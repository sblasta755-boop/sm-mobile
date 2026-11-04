import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * Pieces of the platform operator's home screen: a thin growth curve, plan bars, a status bar and the pill selector.
 * Plain Views and one SVG path, in the app's theme tokens only, so light, dark and an organisation's brand colour all
 * apply without anything being hard-coded.
 */

type Glyph = keyof typeof Ionicons.glyphMap;

// ---- Curve ----

function smoothPath(xs: number[], ys: number[]): string {
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  const n = xs.length;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = [xs[Math.max(i - 1, 0)], ys[Math.max(i - 1, 0)]];
    const [x1, y1] = [xs[i], ys[i]];
    const [x2, y2] = [xs[i + 1], ys[i + 1]];
    const [x3, y3] = [xs[Math.min(i + 2, n - 1)], ys[Math.min(i + 2, n - 1)]];
    d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

/** A smooth running-total curve with a soft fill and a dot on today. */
export function GrowthCurve({ values, height = 120, labels }: { values: number[]; height?: number; labels: [string, string, string] }) {
  useThemeVersion();
  const [width, setWidth] = useState(0);
  const max = Math.max(...values, 1);
  const pad = 8;
  const xs = values.map((_, i) => pad + (i * (width - pad * 2)) / Math.max(values.length - 1, 1));
  const ys = values.map((v) => height - pad - (v / max) * (height - pad * 2 - 6));
  const line = width > 0 && values.length > 1 ? smoothPath(xs, ys) : "";
  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {line ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${line} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`} fill="url(#growthFill)" />
            <Path d={line} fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" />
            <Circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4.2} fill={colors.primary} stroke={colors.card} strokeWidth={2} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{labels[0]}</Text>
        <Text style={styles.axisText}>{labels[1]}</Text>
        <Text style={styles.axisText}>{labels[2]}</Text>
      </View>
    </View>
  );
}

// ---- Bars ----

/** One labelled horizontal bar per row, scaled to the largest. */
export function BarRows({ rows }: { rows: { label: string; value: number; tone?: "primary" | "good" | "warn" | "bad" | "muted" }[] }) {
  useThemeVersion();
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fill = (tone?: string) =>
    tone === "good" ? colors.success : tone === "warn" ? colors.warning : tone === "bad" ? colors.destructive : tone === "muted" ? colors.neutral : colors.primary;
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.label}</Text>
          <View style={styles.track}>
            <View style={[styles.fillBar, { width: `${(r.value / max) * 100}%`, backgroundColor: fill(r.tone) }]} />
          </View>
          <Text style={styles.barValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** A single stacked bar for a share of the whole, with a legend. */
export function StackedBar({ parts }: { parts: { label: string; value: number; tone: "good" | "muted" | "warn" | "bad" }[] }) {
  useThemeVersion();
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const fill = (t: string) => (t === "good" ? colors.success : t === "warn" ? colors.warning : t === "bad" ? colors.destructive : colors.neutral);
  return (
    <View>
      <View style={styles.stack}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <View key={p.label} style={{ flex: p.value / total, backgroundColor: fill(p.tone), borderRadius: 4 }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: fill(p.tone) }]} />
            <Text style={styles.axisText}>
              {p.label} {p.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Pill selector ----

/** Icons, with the chosen one showing its name. */
export function PillSelector<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: Glyph }[];
  onChange: (v: T) => void;
}) {
  useThemeVersion();
  return (
    <View style={styles.pills} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.pill, on && styles.pillOn]}
          >
            <Ionicons name={o.icon} size={16} color={on ? colors.primary : colors.mutedForeground} />
            {on ? <Text style={styles.pillText}>{o.label}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    axis: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
    axisText: { fontSize: typography.tiny + 1, color: colors.mutedForeground },
    barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    barLabel: { width: 84, fontSize: typography.small, color: colors.mutedForeground },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.secondary, overflow: "hidden" },
    fillBar: { height: 8, borderRadius: 4 },
    barValue: { width: 26, textAlign: "right", fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    stack: { flexDirection: "row", gap: 3, height: 10 },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    pills: {
      flexDirection: "row",
      gap: 4,
      padding: 4,
      borderRadius: radius.round,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pill: { flex: 1, height: 38, borderRadius: radius.round, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    pillOn: { flex: 2.2, backgroundColor: colors.accent },
    pillText: { fontSize: typography.small + 1, fontWeight: "600", color: colors.primary },
  }),
);
