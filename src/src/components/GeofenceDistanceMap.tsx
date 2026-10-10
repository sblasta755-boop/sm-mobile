import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * Shows why a geofenced QR scan/clock-in was rejected: the device's
 * reported position, the site's geofence centre + radius circle, and the
 * straight-line distance between them - free OpenStreetMap tiles, no API
 * key. Fed directly from the rejection's structured detail (see
 * evaluate_geofence on the backend / ApiError.detail on the client), not
 * re-derived - the distance shown here always matches what actually
 * failed the check. Mirrors the web app's GeofenceDistanceMap.tsx (which
 * renders Leaflet directly in the DOM); this renders the same Leaflet +
 * OSM setup inside a WebView, since there's no DOM here to mount it in
 * and react-native-maps would need a Google Maps API key on Android for
 * a feature that's meant to be free-tier by design.
 */
export function GeofenceDistanceMap({
  deviceLatitude,
  deviceLongitude,
  siteLatitude,
  siteLongitude,
  radiusMeters,
  distanceMeters,
  siteName,
}: {
  deviceLatitude: number;
  deviceLongitude: number;
  siteLatitude: number;
  siteLongitude: number;
  radiusMeters: number;
  distanceMeters: number;
  siteName?: string;
}) {
  const html = useMemo(
    () => buildMapHtml({ deviceLatitude, deviceLongitude, siteLatitude, siteLongitude, radiusMeters, siteName }),
    [deviceLatitude, deviceLongitude, siteLatitude, siteLongitude, radiusMeters, siteName],
  );

  return (
    <View style={styles.wrap}>
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={["*"]}
        // The map is a static illustration of the rejection, not an
        // interactive browsing surface - block navigation away from
        // the inline HTML (e.g. a tapped OSM attribution link trying
        // to open in this same WebView).
        onShouldStartLoadWithRequest={(request) => request.url.startsWith("about:") || request.url.startsWith("data:")}
      />
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          You&apos;re <Text style={styles.footerStrong}>{Math.round(distanceMeters)}m</Text> away
        </Text>
        <Text style={styles.footerText}>Allowed radius: {Math.round(radiusMeters)}m</Text>
      </View>
    </View>
  );
}

function buildMapHtml({
  deviceLatitude,
  deviceLongitude,
  siteLatitude,
  siteLongitude,
  radiusMeters,
  siteName,
}: {
  deviceLatitude: number;
  deviceLongitude: number;
  siteLatitude: number;
  siteLongitude: number;
  radiusMeters: number;
  siteName?: string;
}): string {
  const safeName = (siteName ?? "Site").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { attributionControl: true, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    var site = L.latLng(${siteLatitude}, ${siteLongitude});
    var device = L.latLng(${deviceLatitude}, ${deviceLongitude});

    L.marker(site).addTo(map).bindPopup(${JSON.stringify(safeName)}).openPopup();
    L.marker(device).addTo(map).bindPopup('You');
    L.circle(site, { radius: ${radiusMeters}, color: '#21779b', fillColor: '#21779b', fillOpacity: 0.1 }).addTo(map);
    L.polyline([site, device], { color: '#d3382c', dashArray: '6 4' }).addTo(map);

    var bounds = L.latLngBounds([site, device]);
    map.fitBounds(bounds.pad(0.35), { maxZoom: 18 });
  </script>
</body>
</html>`;
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  webview: {
    height: 220,
    width: "100%",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.muted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  footerText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  footerStrong: {
    fontWeight: "700",
    color: colors.foreground,
  },
}));
