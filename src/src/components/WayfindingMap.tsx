import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors, radius, themedStyles } from "@/theme";
import type { WayfindingBeaconRecord, WayfindingEdgeRecord } from "@/api/client";

/**
 * A map of a site's wayfinding signs and the paths between them, drawn with
 * Leaflet and free OpenStreetMap tiles inside a WebView (the same approach as
 * GeofenceDistanceMap, so no map API key). The page is loaded once; changes are
 * sent to it as data, so panning and zooming are never reset by a re-render.
 *
 * Needs a network connection for the map tiles. The signs and paths still draw
 * without them, on a blank background.
 */
export interface MapPoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export function WayfindingMap({
  beacons,
  edges,
  here,
  trail,
  fromId,
  toId,
  draft,
  height = 300,
  onPick,
}: {
  beacons: WayfindingBeaconRecord[];
  edges: WayfindingEdgeRecord[];
  /** The phone's own position. */
  here?: MapPoint | null;
  /** The route walked so far, oldest first. */
  trail?: MapPoint[];
  fromId?: string | null;
  toId?: string | null;
  /** A sign about to be installed (not saved yet). */
  draft?: MapPoint | null;
  height?: number;
  onPick?: (beaconId: string) => void;
}) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => PAGE_HTML, []);

  const payload = useMemo(
    () =>
      JSON.stringify({
        beacons: beacons
          .filter((b) => b.active)
          .map((b) => ({ id: b.id, name: b.name, kind: b.kind, lat: b.latitude, lng: b.longitude, safe: b.safePoint })),
        edges: edges.map((e) => ({ a: e.aBeaconId, b: e.bBeaconId, status: e.status, source: e.source, shape: e.polyline ?? [] })),
        here: here ? { lat: here.latitude, lng: here.longitude, acc: here.accuracy ?? null } : null,
        trail: (trail ?? []).map((p) => [p.latitude, p.longitude]),
        fromId: fromId ?? null,
        toId: toId ?? null,
        draft: draft ? { lat: draft.latitude, lng: draft.longitude } : null,
      }),
    [beacons, edges, here, trail, fromId, toId, draft],
  );

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.setData(${payload});true;`);
  }, [payload, ready]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; id?: string };
      if (message.type === "ready") setReady(true);
      if (message.type === "pick" && message.id) onPick?.(message.id);
    } catch {
      /* not one of ours */
    }
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={ref}
        source={{ html }}
        style={styles.webview}
        originWhitelist={["*"]}
        onMessage={onMessage}
        // A tapped attribution link must not navigate this page away.
        onShouldStartLoadWithRequest={(request) => request.url.startsWith("about:") || request.url.startsWith("data:")}
      />
    </View>
  );
}

const PAGE_HTML = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #eef3f5; }
  .lbl { background: rgba(255,255,255,.92); border: 0; border-radius: 4px; padding: 1px 5px; font: 600 10px sans-serif; color: #182531; box-shadow: none; }
  .lbl:before { display: none; }
  .legend { position: absolute; left: 6px; bottom: 6px; z-index: 999; background: rgba(255,255,255,.92); border-radius: 6px; padding: 4px 6px; font: 10px sans-serif; color: #182531; line-height: 1.5; }
  .legend i { display: inline-block; width: 14px; height: 0; border-top: 3px solid; vertical-align: middle; margin-right: 4px; }
  .locate { position: absolute; right: 8px; bottom: 28px; z-index: 999; width: 34px; height: 34px; border-radius: 17px; border: 0; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); font-size: 17px; }
</style></head>
<body>
<div id="map"></div>
<div class="legend"><i style="border-color:#209c68"></i>walked <i style="border-color:#8a96a3;border-top-style:dashed"></i>straight guess <i style="border-color:#d3382c"></i>closed <i style="border-color:#f0b42a"></i>hazard</div>
<button class="locate" id="locate" aria-label="Centre on me">&#9737;</button>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var KIND = { gate: '#21779b', junction: '#6f7b87', viewpoint: '#8b5cf6', room: '#0ea5a4', help_point: '#f59e0b', safe_point: '#209c68' };
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var fitted = false, lastHere = null;

  function post(m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }

  window.setData = function (d) {
    layer.clearLayers();
    var byId = {}; d.beacons.forEach(function (b) { byId[b.id] = b; });
    var pts = [];
    d.edges.forEach(function (e) {
      var a = byId[e.a], b = byId[e.b]; if (!a || !b) return;
      // A path with a known shape is drawn along it; without one it is only a straight guess (dashed).
      var shaped = e.shape && e.shape.length > 0;
      var guess = e.source === 'geometry' && !shaped && e.status === 'open';
      var color = e.status === 'closed' ? '#d3382c' : e.status === 'hazard' ? '#f0b42a' : guess ? '#8a96a3' : shaped ? '#209c68' : '#209c68';
      var line = [[a.lat, a.lng]].concat(e.shape || [], [[b.lat, b.lng]]);
      L.polyline(line, { color: color, weight: guess ? 3 : 4, dashArray: guess ? '6 6' : null, opacity: .9 }).addTo(layer);
    });
    d.beacons.forEach(function (b) {
      pts.push([b.lat, b.lng]);
      var ring = b.id === d.fromId ? '#209c68' : b.id === d.toId ? '#2d74c4' : '#ffffff';
      var m = L.circleMarker([b.lat, b.lng], { radius: b.id === d.fromId || b.id === d.toId ? 11 : 8, color: ring, weight: 3, fillColor: KIND[b.kind] || '#6f7b87', fillOpacity: 1 }).addTo(layer);
      if (d.beacons.length <= 40 || b.id === d.fromId || b.id === d.toId) m.bindTooltip(b.name, { permanent: true, direction: 'top', offset: [0, -8], className: 'lbl' });
      m.on('click', function () { post({ type: 'pick', id: b.id }); });
    });
    if (d.trail && d.trail.length > 1) L.polyline(d.trail, { color: '#2d74c4', weight: 5, opacity: .9 }).addTo(layer);
    if (d.draft) { L.circleMarker([d.draft.lat, d.draft.lng], { radius: 10, color: '#d3382c', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(layer).bindTooltip('New sign here', { permanent: true, direction: 'top', offset: [0, -8], className: 'lbl' }); pts.push([d.draft.lat, d.draft.lng]); }
    if (d.here) {
      lastHere = [d.here.lat, d.here.lng];
      if (d.here.acc) L.circle(lastHere, { radius: d.here.acc, color: '#2d74c4', weight: 1, fillOpacity: .12 }).addTo(layer);
      L.circleMarker(lastHere, { radius: 7, color: '#fff', weight: 3, fillColor: '#2d74c4', fillOpacity: 1 }).addTo(layer);
      pts.push(lastHere);
    }
    // Fit once, then leave the view to the user.
    if (!fitted && pts.length) { fitted = true; map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 19 }); }
  };
  document.getElementById('locate').onclick = function () { if (lastHere) map.setView(lastHere, Math.max(map.getZoom(), 18)); };
  post({ type: 'ready' });
</script>
</body></html>`;

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
    webview: { flex: 1, width: "100%" },
  }),
);
