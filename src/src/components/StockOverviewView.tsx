import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { getStockOverview } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { canSeeAllSites, donutSlices, rand, randShort, sentence, share } from "@/domain/stockOverview";
import type { StockInsight, StockInsightTone, StockOverview } from "@/types/smartclean";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

const PERIODS = [7, 30, 90] as const;
const TONE: Record<StockInsightTone, { icon: keyof typeof Ionicons.glyphMap; color: () => string }> = {
  bad: { icon: "close-circle", color: () => colors.destructive },
  warn: { icon: "alert-circle", color: () => colors.warning },
  info: { icon: "information-circle", color: () => colors.info },
  good: { icon: "checkmark-circle", color: () => colors.success },
};

const sliceColors = () => [colors.info, colors.success, colors.warning, colors.primary, "#a597d6", "#d48fb0", "#6dbdb0", "#d39a6c"];

/** Receipts, issues and waste per day as stacked bars, drawn with SVG so it needs no chart library. */
function MovementChart({ data, width }: { data: StockOverview["movementsByDay"]; width: number }) {
  const height = 120;
  const top = 8;
  const bottom = 18;
  const max = Math.max(1, ...data.map((d) => d.receipts + d.issues + d.waste));
  const slot = width / Math.max(1, data.length);
  const bar = Math.max(2, Math.min(14, slot * 0.66));
  const plot = height - top - bottom;
  const first = data[0]?.date.slice(5).replace("-", "/");
  const last = data[data.length - 1]?.date.slice(5).replace("-", "/");
  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="rc" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.success} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.success} stopOpacity="0.55" />
          </LinearGradient>
          <LinearGradient id="is" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.info} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.info} stopOpacity="0.55" />
          </LinearGradient>
          <LinearGradient id="ws" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.warning} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.warning} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Rect key={f} x={0} y={top + plot * (1 - f)} width={width} height={StyleSheet.hairlineWidth} fill={colors.border} />
        ))}
        {data.map((d, i) => {
          const x = i * slot + (slot - bar) / 2;
          let y = top + plot;
          return (
            <G key={d.date}>
              {([["issues", "url(#is)", d.issues], ["receipts", "url(#rc)", d.receipts], ["waste", "url(#ws)", d.waste]] as const).map(([key, fill, n]) => {
                if (!n) return null;
                const h = Math.max(2, (n / max) * plot);
                y -= h;
                return <Rect key={key} x={x} y={y} width={bar} height={h} rx={bar > 5 ? 2.5 : 1} fill={fill} />;
              })}
            </G>
          );
        })}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axis}>{first}</Text>
        <Text style={styles.axis}>{last}</Text>
      </View>
    </View>
  );
}

/** Value by category as a ring. */
function Donut({ rows }: { rows: { name: string; value: number }[] }) {
  const size = 132;
  const r = 52;
  const stroke = 20;
  const c = 2 * Math.PI * r;
  const slices = donutSlices(rows, c, 3);
  const palette = sliceColors();
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" opacity={0.4} />
        {slices.map((s, i) => (
          <Circle
            key={s.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={palette[i % palette.length]}
            strokeWidth={stroke}
            strokeDasharray={`${s.length} ${c}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
      </G>
    </Svg>
  );
}

function Bars({ rows, tone, format }: { rows: { label: string; value: number }[]; tone: string; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <View style={styles.barHead}>
            <Text style={styles.barLabel} numberOfLines={1}>{r.label}</Text>
            <Text style={styles.barValue}>{format(r.value)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(3, Math.round((r.value / max) * 100))}%`, backgroundColor: tone }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function InsightRow({ insight }: { insight: StockInsight }) {
  const t = TONE[insight.tone];
  const color = t.color();
  return (
    <View style={[styles.insight, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Ionicons name={t.icon} size={22} color={color} />
      <View style={styles.insightText}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.insightDetail}>{insight.detail}</Text>
      </View>
    </View>
  );
}

/**
 * The stock overview for site managers and above: what the stock is worth and where it sits, what needs
 * attention, how it moved, and plain statements about what to look at. A site manager sees their own site;
 * an organisation admin or operations manager can also see every site together.
 */
export function StockOverviewView({ siteId }: { siteId: string }) {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const [days, setDays] = useState<number>(30);
  const [scope, setScope] = useState<"site" | "all">("site");
  const [data, setData] = useState<StockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(300);
  const wide = canSeeAllSites(currentUser?.role);

  useEffect(() => {
    if (!token || !siteId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getStockOverview(token, scope === "all" ? "all" : siteId, days)
      .then((next) => !cancelled && setData(next))
      .catch(() => !cancelled && (setData(null), setFailed(true)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, siteId, scope, days]);

  const palette = sliceColors();
  const categories = useMemo(() => (data?.valueByCategory ?? []).filter((c) => c.value > 0).slice(0, 8), [data]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Building the overview…</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <Card style={styles.card}>
        <Text style={styles.muted}>{failed ? "The overview could not be built right now." : "No data yet."}</Text>
      </Card>
    );
  }
  const k = data.kpis;
  const moves = data.movementsByDay.reduce((n, d) => n + d.receipts + d.issues + d.waste, 0);
  const wasteDelta = data.waste.previousValue > 0 ? Math.round((data.waste.value / data.waste.previousValue - 1) * 100) : null;

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(Math.max(200, e.nativeEvent.layout.width - spacing.lg * 2))}>
      <Text style={styles.scope}>
        {data.scope === "all" ? `Every site (${data.siteNames.length})` : data.siteNames[0]} · last {data.days} days
      </Text>
      <View style={styles.chips}>
        {wide && chip("This site", scope === "site", () => setScope("site"))}
        {wide && chip("All sites", scope === "all", () => setScope("all"))}
        {PERIODS.map((p) => chip(`${p} days`, days === p, () => setDays(p)))}
      </View>

      <Card style={styles.hero}>
        <Text style={styles.kpiLabel}>STOCK VALUE (COST)</Text>
        <Text style={styles.heroValue} adjustsFontSizeToFit numberOfLines={1}>{rand(k.stockValue)}</Text>
        <Text style={styles.muted}>
          {k.unpricedItems} unpriced · {k.negativeLevels} negative · {k.notCountedItems} not counted lately
        </Text>
      </Card>

      <View style={styles.kpiGrid}>
        {[
          { label: "NEW REQUESTS", value: k.newRequests, sub: "Waiting on the stock room", color: k.newRequests > 0 ? colors.warning : colors.foreground },
          { label: "AT REORDER POINT", value: k.atReorder, sub: k.outOfStock > 0 ? `${k.outOfStock} out of stock` : `Of ${k.itemsTotal} items`, color: k.outOfStock > 0 ? colors.destructive : k.atReorder > 0 ? colors.warning : colors.foreground },
          { label: "MOVEMENTS TODAY", value: k.movementsToday, sub: "Ledger entries", color: colors.foreground },
          { label: "ON LOAN", value: k.loansOut, sub: "Out to other sites", color: colors.foreground },
        ].map((t) => (
          <Card key={t.label} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{t.label}</Text>
            <Text style={[styles.kpiValue, { color: t.color }]}>{t.value}</Text>
            <Text style={styles.muted} numberOfLines={1}>{t.sub}</Text>
          </Card>
        ))}
      </View>

      <Text style={styles.heading}>What to look at</Text>
      <View style={styles.stack}>
        {data.insights.map((i) => (
          <InsightRow key={i.key} insight={i} />
        ))}
      </View>

      <Text style={styles.heading}>Where the money sits</Text>
      <Card style={styles.card}>
        <Bars
          rows={data.valueByLocation.map((l) => ({ label: `${l.name}${k.stockValue > 0 ? ` · ${share(l.value, k.stockValue)}%` : ""}`, value: l.value }))}
          tone={colors.info}
          format={rand}
        />
        {data.valueByLocation.length === 0 && <Text style={styles.muted}>No stock locations yet.</Text>}
      </Card>

      <Text style={styles.heading}>Needs attention</Text>
      <Card style={styles.card}>
        {data.needsAttention.length === 0 ? (
          <Text style={styles.muted}>Nothing is at its reorder level.</Text>
        ) : (
          data.needsAttention.map((a) => (
            <View key={a.itemId} style={styles.attention}>
              <View style={styles.attentionText}>
                <Text style={styles.attentionName} numberOfLines={1}>{a.name} at {a.qty} <Text style={styles.muted}>(reorder {a.reorder})</Text></Text>
                {a.status === "low" && a.coverDays !== null && (
                  <Text style={styles.muted}>About {a.coverDays} day{a.coverDays === 1 ? "" : "s"} left at the current rate</Text>
                )}
              </View>
              <View style={[styles.badge, { borderColor: a.status === "out" ? colors.destructive : colors.warning }]}>
                <Text style={[styles.badgeText, { color: a.status === "out" ? colors.destructive : colors.warning }]}>{a.status === "out" ? "OUT" : "LOW"}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.heading}>How stock has moved</Text>
      <Card style={styles.card}>
        <Text style={styles.chartTitle}>{moves} entries <Text style={styles.muted}>in {data.days} days</Text></Text>
        <View style={styles.legend}>
          {[["Received", colors.success], ["Issued", colors.info], ["Waste", colors.warning]].map(([l, c]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <Text style={styles.muted}>{l}</Text>
            </View>
          ))}
        </View>
        <MovementChart data={data.movementsByDay} width={width} />
      </Card>

      <Text style={styles.heading}>Value by category</Text>
      <Card style={styles.card}>
        {categories.length === 0 ? (
          <Text style={styles.muted}>No priced stock to chart yet.</Text>
        ) : (
          <View style={styles.donutRow}>
            <Donut rows={categories} />
            <View style={styles.donutLegend}>
              {categories.map((c, i) => (
                <View key={c.name} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: palette[i % palette.length] }]} />
                  <Text style={styles.legendName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.muted}>{share(c.value, k.stockValue)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      <Text style={styles.heading}>Most valuable items</Text>
      <Card style={styles.card}>
        {data.topItemsByValue.length === 0 ? (
          <Text style={styles.muted}>No priced stock to chart yet.</Text>
        ) : (
          <Bars rows={data.topItemsByValue.map((t) => ({ label: t.name, value: t.value }))} tone={colors.primary} format={randShort} />
        )}
      </Card>

      <Text style={styles.heading}>Most used</Text>
      <Card style={styles.card}>
        {data.topUsed.length === 0 ? (
          <Text style={styles.muted}>Nothing was issued in this period.</Text>
        ) : (
          <Bars rows={data.topUsed.map((t) => ({ label: t.name, value: t.used }))} tone={colors.success} format={(n) => String(n)} />
        )}
      </Card>

      <Text style={styles.heading}>Waste</Text>
      <Card style={styles.card}>
        <View style={styles.wasteHead}>
          <Text style={styles.wasteValue}>{rand(data.waste.value)}</Text>
          {wasteDelta !== null && (
            <View style={[styles.deltaPill, { backgroundColor: `${wasteDelta > 0 ? colors.warning : colors.success}26` }]}>
              <Text style={[styles.deltaText, { color: wasteDelta > 0 ? colors.warning : colors.success }]}>
                {wasteDelta > 0 ? "+" : ""}{wasteDelta}% on the period before
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.muted}>Written off in the last {data.days} days, at cost</Text>
        {data.waste.byReason.length === 0 ? (
          <Text style={[styles.muted, { marginTop: spacing.sm }]}>No waste was logged. Good, or nobody is logging it.</Text>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <Bars rows={data.waste.byReason.slice(0, 5).map((r) => ({ label: sentence(r.reason), value: r.value }))} tone={colors.warning} format={rand} />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    center: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
    card: { gap: spacing.sm },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    scope: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    hero: { gap: 4, paddingVertical: spacing.lg },
    heroValue: { fontSize: 38, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
    kpiLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.4, color: colors.mutedForeground },
    kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    kpi: { width: "48.5%", flexGrow: 1, gap: 2 },
    kpiValue: { fontSize: 30, fontWeight: "800" },
    heading: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground, marginTop: spacing.md },
    stack: { gap: spacing.sm },
    insight: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
    insightText: { flex: 1, gap: 2 },
    insightTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    insightDetail: { fontSize: typography.small, color: colors.mutedForeground },
    bars: { gap: spacing.md },
    barRow: { gap: 5 },
    barHead: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    barLabel: { flex: 1, fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    barValue: { fontSize: typography.small, color: colors.mutedForeground },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4 },
    attention: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
    attentionText: { flex: 1, minWidth: 0 },
    attentionName: { fontSize: typography.body, color: colors.foreground },
    badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
    chartTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    legend: { flexDirection: "row", gap: spacing.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    dot: { width: 9, height: 9, borderRadius: 5 },
    axisRow: { flexDirection: "row", justifyContent: "space-between" },
    axis: { fontSize: 10, color: colors.mutedForeground },
    donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    donutLegend: { flex: 1, gap: 6 },
    legendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    legendName: { flex: 1, fontSize: typography.small, color: colors.foreground },
    wasteHead: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
    wasteValue: { fontSize: 28, fontWeight: "800", color: colors.foreground },
    deltaPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    deltaText: { fontSize: 11, fontWeight: "700" },
  }),
);
