import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, radius, themedStyles } from "@/theme";

export type ScheduleMapPin = { id: string; name: string; address: string; latitude: number; longitude: number; lines: string[] };

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The sites a person is booked at, as pins on an OpenStreetMap (the same Leaflet-in-a-WebView approach as the geofence map). */
export function ScheduleMap({ pins, height = 280 }: { pins: ScheduleMapPin[]; height?: number }) {
  const html = useMemo(() => buildHtml(pins), [pins]);
  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        source={{ html }}
        style={styles.webview}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith("about:") || request.url.startsWith("data:")}
      />
    </View>
  );
}

function buildHtml(pins: ScheduleMapPin[]): string {
  const markers = pins.map((p) => ({
    at: [p.latitude, p.longitude],
    html: `<strong>${esc(p.name)}</strong><br/>${esc(p.address)}${p.lines.map((l) => `<br/>${esc(l)}`).join("")}`,
  }));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var pins = ${JSON.stringify(markers).replace(/</g, "\\u003c")};
    var points = [];
    pins.forEach(function (p) { points.push(p.at); L.marker(p.at).addTo(map).bindPopup(p.html); });
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 17 });
    else map.setView([-28.5, 24.7], 5);
  </script>
</body>
</html>`;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
    webview: { flex: 1, width: "100%" },
  }),
);
