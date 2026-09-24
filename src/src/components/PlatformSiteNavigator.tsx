import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { getCurrentCoords, watchPosition, type DeviceCoords } from "@/services/geolocation";
import {
  bearingDegrees,
  distanceToPolylineMeters,
  fetchRoute,
  formatDistance,
  formatDuration,
  haversineMeters,
  nearestPointIndex,
  RoutingError,
  type RouteLeg,
} from "@/services/routing";
import { colors, radius, spacing, typography } from "@/theme";
import type { PlatformSite } from "@/api/client";

const OFF_ROUTE_METERS = 40;
const REROUTE_COOLDOWN_MS = 15_000;
const ARRIVAL_METERS = 30;
const MIN_BEARING_DISTANCE_METERS = 8;

/**
 * Live, in-app turn-by-turn navigation to one platform site - the
 * mobile counterpart to the web console's PlatformSitesMap live-nav
 * mode. Ports that component's state machine (position watch, route
 * progress, off-route reroute, arrival) almost unchanged; the
 * difference is purely the rendering surface: web mounts Leaflet
 * straight into the DOM, this drives the same Leaflet+OSM setup inside
 * a WebView via injectJavaScript, since there's no DOM here and
 * react-native-maps would need a Google Maps API key on Android for a
 * feature meant to stay free-tier.
 *
 * Renders as a full-bleed overlay (the caller mounts it conditionally,
 * e.g. behind a "Start navigation" button) rather than an inline card -
 * a turn-by-turn screen is something you look at instead of the rest of
 * the app while driving, same as any real navigation app.
 */
export function PlatformSiteNavigator({ site, onClose }: { site: PlatformSite; onClose: () => void }) {
  const webviewRef = useRef<WebView>(null);
  const webviewReadyRef = useRef(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [live, setLive] = useState<{
    position: [number, number];
    accuracy: number | null;
    heading: number | null;
    remainingPoints: [number, number][];
    instruction: string;
    distanceRemainingMeters: number;
    durationRemainingSeconds: number;
    rerouting: boolean;
  } | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const stopWatchRef = useRef<(() => void) | null>(null);
  const activeRouteRef = useRef<RouteLeg | null>(null);
  const activeStepIndexRef = useRef(0);
  const reroutingRef = useRef(false);
  const lastRerouteAtRef = useRef(0);

  const destination = useMemo<[number, number]>(() => [site.latitude, site.longitude], [site]);

  const initialHtml = useMemo(() => buildNavigatorHtml(destination, site.name), [destination, site.name]);

  const postToMap = useCallback((script: string) => {
    if (!webviewReadyRef.current) return;
    webviewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  const rerouteFromPosition = useCallback(
    async (position: [number, number]) => {
      if (reroutingRef.current) return;
      const now = Date.now();
      if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) return;
      reroutingRef.current = true;
      lastRerouteAtRef.current = now;
      setLive((current) => (current ? { ...current, rerouting: true } : current));
      try {
        const route = await fetchRoute(position, destination, undefined, true);
        activeRouteRef.current = route;
        activeStepIndexRef.current = 0;
        setLive((current) =>
          current
            ? {
                ...current,
                remainingPoints: route.points,
                instruction: route.steps[0]?.instruction ?? "Continue on route",
                distanceRemainingMeters: route.distanceMeters,
                durationRemainingSeconds: route.durationSeconds,
                rerouting: false,
              }
            : current,
        );
        postToMap(`window.setRoute(${JSON.stringify(route.points)})`);
      } catch {
        setLive((current) => (current ? { ...current, rerouting: false } : current));
      } finally {
        reroutingRef.current = false;
      }
    },
    [destination, postToMap],
  );

  const applyPosition = useCallback(
    (coords: DeviceCoords) => {
      const route = activeRouteRef.current;
      if (!route) return;
      const position: [number, number] = [coords.latitude, coords.longitude];
      const current = liveRef.current;

      const distanceToSite = haversineMeters(position, destination);
      if (distanceToSite <= ARRIVAL_METERS) {
        stopWatchRef.current?.();
        stopWatchRef.current = null;
        setLive(null);
        onArrivedRef.current();
        return;
      }

      let heading = coords.heading;
      if (heading === null && current) {
        const moved = haversineMeters(current.position, position);
        heading = moved >= MIN_BEARING_DISTANCE_METERS ? bearingDegrees(current.position, position) : current.heading;
      }

      const pointIndex = nearestPointIndex(position, route.points);
      const remainingPoints = route.points.slice(pointIndex);

      let activeStepIndex = activeStepIndexRef.current;
      const steps = route.steps;
      while (
        activeStepIndex < steps.length - 1 &&
        haversineMeters(position, steps[activeStepIndex].location) < 25
      ) {
        activeStepIndex += 1;
      }
      activeStepIndexRef.current = activeStepIndex;

      const totalPoints = route.points.length;
      const fraction = totalPoints > 1 ? pointIndex / (totalPoints - 1) : 1;

      setLive({
        position,
        accuracy: coords.accuracy,
        heading,
        remainingPoints,
        instruction: steps[activeStepIndex]?.instruction ?? "Continue on route",
        distanceRemainingMeters: route.distanceMeters * (1 - fraction),
        durationRemainingSeconds: route.durationSeconds * (1 - fraction),
        rerouting: current?.rerouting ?? false,
      });

      postToMap(
        `window.updatePosition(${position[0]}, ${position[1]}, ${heading === null ? "null" : heading}, ${JSON.stringify(remainingPoints)})`,
      );

      if (distanceToPolylineMeters(position, route.points) > OFF_ROUTE_METERS) {
        void rerouteFromPosition(position);
      }
    },
    [destination, postToMap, rerouteFromPosition],
  );

  // Held in a ref so applyPosition (defined above, before onClose is
  // relevant) can call the latest onClose without needing it in its own
  // dependency array - onClose is a fresh function every parent render.
  const onArrivedRef = useRef<() => void>(() => {});
  onArrivedRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setStarting(true);
      setError(null);
      const coords = await getCurrentCoords();
      if (cancelled) return;
      if (!coords) {
        setError("Couldn't get your location. Check that location access is allowed.");
        setStarting(false);
        return;
      }
      try {
        const origin: [number, number] = [coords.latitude, coords.longitude];
        const route = await fetchRoute(origin, destination, undefined, true);
        if (cancelled) return;
        activeRouteRef.current = route;
        activeStepIndexRef.current = 0;
        setLive({
          position: origin,
          accuracy: coords.accuracy,
          heading: null,
          remainingPoints: route.points,
          instruction: route.steps[0]?.instruction ?? "Continue on route",
          distanceRemainingMeters: route.distanceMeters,
          durationRemainingSeconds: route.durationSeconds,
          rerouting: false,
        });
        stopWatchRef.current = await watchPosition(applyPosition, () => {
          setError("Lost access to your location - navigation stopped.");
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof RoutingError ? err.message : "Couldn't start navigation right now.");
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
    // Mount-only by design (own destination never changes within one
    // navigator instance - a new site means a new PlatformSiteNavigator
    // mount from the caller, not a prop update this effect should react
    // to), matching PlatformSitesMap's own "the map effect owns the
    // lifecycle" convention on web.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push every live update into the map once the WebView has finished
  // its own setup (see onMessage below) - covers the update that arrives
  // between "route fetched" and "WebView ready".
  useEffect(() => {
    if (!live || !webviewReadyRef.current) return;
    postToMap(
      `window.updatePosition(${live.position[0]}, ${live.position[1]}, ${live.heading === null ? "null" : live.heading}, ${JSON.stringify(live.remainingPoints)})`,
    );
  }, [live, postToMap]);

  return (
    <View style={styles.overlay}>
      <WebView
        ref={webviewRef}
        source={{ html: initialHtml }}
        style={styles.webview}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith("about:") || request.url.startsWith("data:")}
        onMessage={(event) => {
          if (event.nativeEvent.data === "ready") {
            webviewReadyRef.current = true;
            if (liveRef.current) {
              postToMap(
                `window.updatePosition(${liveRef.current.position[0]}, ${liveRef.current.position[1]}, ${liveRef.current.heading === null ? "null" : liveRef.current.heading}, ${JSON.stringify(liveRef.current.remainingPoints)})`,
              );
            }
          }
        }}
      />

      <View style={styles.topBar}>
        <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Stop navigation">
          <Ionicons name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {starting && (
        <View style={styles.centerOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerText}>Finding your route to {site.name}…</Text>
        </View>
      )}

      {error && !starting && (
        <View style={styles.centerOverlay}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.destructive} />
          <Text style={styles.centerText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={onClose}>
            <Text style={styles.retryButtonText}>Close</Text>
          </Pressable>
        </View>
      )}

      {live && !starting && !error && (
        <View style={styles.instructionBanner}>
          <Ionicons name="arrow-up" size={24} color={colors.primary} style={{ transform: [{ rotate: "45deg" }] }} />
          <View style={styles.instructionText}>
            <Text style={styles.instructionMain} numberOfLines={2}>
              {live.instruction}
            </Text>
            <Text style={styles.instructionSub}>
              {formatDistance(live.distanceRemainingMeters)} · {formatDuration(live.durationRemainingSeconds)} to{" "}
              {site.name}
              {live.rerouting ? " · Rerouting…" : ""}
              {live.accuracy != null && live.accuracy > 50 ? " · Weak GPS signal" : ""}
            </Text>
          </View>
        </View>
      )}

      {live && !starting && !error && (
        <Pressable style={styles.stopButton} onPress={onClose}>
          <Ionicons name="square" size={14} color={colors.white} />
          <Text style={styles.stopButtonText}>Stop navigation</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Static HTML shell, built once per site - Leaflet + OSM tiles loaded
 * from unpkg (same CDN convention as GeofenceDistanceMap.tsx), a marker
 * for the destination, and two globals (window.updatePosition,
 * window.setRoute) that the RN side drives via injectJavaScript. Posts
 * "ready" back over the WebView bridge once Leaflet has actually
 * initialised, so the RN side knows injectJavaScript calls will land
 * rather than firing into a page that hasn't loaded the map yet. */
function buildNavigatorHtml(destination: [number, number], siteName: string): string {
  const safeName = siteName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #eef3f5; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { attributionControl: true, zoomControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    var destination = L.latLng(${destination[0]}, ${destination[1]});
    L.marker(destination).addTo(map).bindPopup(${JSON.stringify(safeName)});
    map.setView(destination, 14);

    var routeCasing = null, routeLine = null, positionMarker = null, accuracyCircle = null;

    function arrowIcon(heading) {
      var rotation = heading === null ? 0 : heading;
      return L.divIcon({
        className: '',
        html:
          '<div style="position:relative;width:34px;height:34px;">' +
            '<svg width="34" height="34" viewBox="0 0 30 30" style="transform:rotate(' + rotation + 'deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));">' +
              '<circle cx="15" cy="15" r="13" fill="#fff" />' +
              (heading === null
                ? '<circle cx="15" cy="15" r="7" fill="#2563eb" />'
                : '<path d="M15 3 L24 24 L15 19 L6 24 Z" fill="#2563eb" />') +
            '</svg>' +
          '</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
    }

    window.setRoute = function (points) {
      if (routeCasing) map.removeLayer(routeCasing);
      if (routeLine) map.removeLayer(routeLine);
      routeCasing = L.polyline(points, { color: '#0b3a5b', weight: 9, opacity: 0.55 }).addTo(map);
      routeLine = L.polyline(points, { color: '#22d3ee', weight: 4, opacity: 0.95 }).addTo(map);
    };

    window.updatePosition = function (lat, lon, heading, remainingPoints) {
      var latlng = L.latLng(lat, lon);
      if (!positionMarker) {
        positionMarker = L.marker(latlng, { icon: arrowIcon(heading), zIndexOffset: 1000 }).addTo(map);
        map.setView(latlng, 16);
      } else {
        positionMarker.setLatLng(latlng);
        positionMarker.setIcon(arrowIcon(heading));
        map.panTo(latlng, { animate: true, duration: 0.4 });
      }
      window.setRoute(remainingPoints);
    };

    // requestAnimationFrame, not a bare synchronous call: Leaflet needs
    // one paint cycle after L.map() before addTo/panTo calls reliably
    // affect anything, and the RN side must not start firing
    // injectJavaScript calls before that - hence waiting for this
    // "ready" message rather than assuming the WebView's onLoad means
    // Leaflet itself is ready.
    requestAnimationFrame(function () {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
    });
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  webview: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    top: spacing.xxl,
    left: spacing.md,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  centerText: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.primaryForeground,
    fontWeight: "700",
    fontSize: typography.small,
  },
  instructionBanner: {
    position: "absolute",
    top: spacing.xxl,
    left: spacing.md + 44,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  instructionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  instructionMain: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  instructionSub: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  stopButton: {
    position: "absolute",
    bottom: spacing.xxl,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.destructive,
    borderRadius: radius.round,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  stopButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: typography.small,
  },
});
