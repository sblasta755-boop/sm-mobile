import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { activityMap, attentionSummary, completion, flowSeries, heatColumns, qualitySummary } from "@/domain/homeData";
import { DEFAULT_PERIOD, customDef, type Look, type ResolvedCustomCard } from "@/domain/homeLayout";
import type { ManagerOverviewData } from "@/features/managerOverview";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The cards of the secondary (Custom) home. Each draws itself in the view the person chose (design D-1/D-3) from data
 * the app already holds. Charts are plain Views and react-native-svg, in the theme's own colours.
 */

// ---- small charts ----

function Ring({ pct, size = 108, stroke = 12, label, sub }: { pct: number; size?: number; stroke?: number; label: string; sub?: string }) {
  useThemeVersion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`${label} ${sub ?? ""}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.secondary} strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringMid}>
        <Text style={styles.ringLabel}>{label}</Text>
        {sub ? <Text style={styles.ringSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Gauge({ pct, width }: { pct: number; width: number }) {
  useThemeVersion();
  const w = Math.min(260, Math.max(160, width));
  const r = w * 0.38;
  const stroke = 20;
  const cx = w / 2;
  const cy = r + stroke;
  const p = Math.max(0, Math.min(100, pct));
  const theta = Math.PI * (1 - p / 100);
  const kx = cx + r * Math.cos(theta);
  const ky = cy - r * Math.sin(theta);
  const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  // Stroke dashes along the arc: the arc length is pi*r.
  const len = Math.PI * r;
  return (
    <View style={{ alignItems: "center" }} accessibilityRole="image" accessibilityLabel={`${p}% done`}>
      <Svg width={w} height={cy + stroke / 2 + 4}>
        <Path d={arc} fill="none" stroke={colors.secondary} strokeWidth={stroke} strokeLinecap="round" />
        <Path d={arc} fill="none" stroke={colors.primary} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(len * p) / 100} ${len}`} />
        <Circle cx={kx} cy={ky} r={8} fill={colors.card} stroke={colors.primary} strokeWidth={4} />
      </Svg>
    </View>
  );
}

function smooth(points: [number, number][]) {
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function Trend({ values, width, height = 110 }: { values: number[]; width: number; height?: number }) {
  useThemeVersion();
  const w = Math.max(120, width);
  const max = Math.max(1, ...values);
  const pts: [number, number][] = values.map((v, i) => [(i * w) / Math.max(1, values.length - 1), height - 8 - (v / max) * (height - 20)]);
  const line = smooth(pts.length > 1 ? pts : [[0, height - 8], [w, height - 8]]);
  return (
    <Svg width={w} height={height} accessibilityLabel="Tasks done per day">
      <Path d={`${line} L${w},${height} L0,${height}Z`} fill={colors.primary} fillOpacity={0.14} />
      <Path d={line} fill="none" stroke={colors.primary} strokeWidth={2.2} />
    </Svg>
  );
}

function Bars({ values, height = 100 }: { values: number[]; height?: number }) {
  useThemeVersion();
  const max = Math.max(1, ...values);
  return (
    <View style={[styles.bars, { height }]} accessibilityLabel="Tasks done per day">
      {values.map((v, i) => (
        <View
          key={i}
          style={{ flex: 1, minWidth: 2, borderRadius: 2, height: `${Math.max(4, (v / max) * 100)}%`, backgroundColor: colors.primary, opacity: v === 0 ? 0.25 : 1 }}
        />
      ))}
    </View>
  );
}

type Tone = "success" | "destructive" | "warning" | "primary";
const toneColor = (t: Tone) => colors[t];

export function Stack({ parts }: { parts: { value: number; tone: Tone; label: string }[] }) {
  useThemeVersion();
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <View>
      <View style={styles.stack}>
        {parts.map((p) => (
          <View key={p.label} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, backgroundColor: toneColor(p.tone) }} />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: toneColor(p.tone) }]} />
            <Text style={styles.sub}>
              {p.label} {p.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const HEAT_OPACITY = [0.1, 0.3, 0.5, 0.75, 1];

function Heat({ days }: { days: ReturnType<typeof activityMap> }) {
  useThemeVersion();
  return (
    <View style={styles.heat} accessibilityLabel="Busy and quiet days">
      {heatColumns(days).map((col, i) => (
        <View key={i} style={styles.heatCol}>
          {col.map((d) => (
            <View key={d.date} style={[styles.heatCell, { opacity: HEAT_OPACITY[d.level] }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---- the shell and each card ----

export function CardShell({ look, title, right, children }: { look: Look; title: string; right?: ReactNode; children: ReactNode }) {
  useThemeVersion();
  return (
    <View
      accessibilityLabel={title}
      style={[styles.card, look.density === "compact" && styles.cardCompact, look.cardStyle === "outlined" && styles.cardOutlined]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const periodText = (p: string | null) => `Last ${p ?? DEFAULT_PERIOD} days`;

export function CustomCard({ card, look, data }: { card: ResolvedCustomCard; look: Look; data: ManagerOverviewData }) {
  useThemeVersion();
  const [width, setWidth] = useState(300);
  const def = customDef(card.id);
  const title = def?.label ?? card.id;
  const days = Number(card.period ?? DEFAULT_PERIOD);
  const period = def?.periods ? <Text style={styles.sub}>{periodText(card.period)}</Text> : undefined;
  const measure = { onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width) };

  switch (card.id) {
    case "completion": {
      const c = completion(data.tasks);
      return (
        <CardShell look={look} title={title} right={<Text style={styles.pct}>{c.pct}<Text style={styles.pctUnit}>%</Text></Text>}>
          <View {...measure}>
            {card.view === "gauge" ? <Gauge pct={c.pct} width={width} /> : card.view === "ring" ? <View style={{ alignItems: "center" }}><Ring pct={c.pct} label={`${c.pct}%`} sub="done" /></View> : null}
          </View>
          <Text style={[styles.sub, card.view !== "number" && { textAlign: "center" }]}>
            {c.done} of {c.total} tasks done
          </Text>
        </CardShell>
      );
    }
    case "flow": {
      const values = flowSeries(data.tasks, days).map((p) => p.count);
      const total = values.reduce((a, b) => a + b, 0);
      return (
        <CardShell look={look} title={title} right={period}>
          <View {...measure}>
            {card.view === "number" ? (
              <Text style={styles.big}>{total}<Text style={styles.unit}>  tasks done</Text></Text>
            ) : card.view === "bar" ? (
              <Bars values={values} />
            ) : (
              <Trend values={values} width={width} />
            )}
          </View>
          {card.view !== "number" ? <Text style={[styles.sub, { marginTop: spacing.sm }]}>{total} tasks done</Text> : null}
        </CardShell>
      );
    }
    case "attention": {
      const a = attentionSummary(data.tasks);
      return (
        <View accessibilityLabel={title} style={[styles.cta, look.density === "compact" && styles.cardCompact]}>
          <View style={styles.ctaTag}>
            <Text style={styles.ctaTagText}>{title}</Text>
          </View>
          {a.overdue === 0 ? (
            <Text style={styles.ctaTitle}>Nothing is overdue</Text>
          ) : (
            <>
              <Text style={styles.ctaTitle}>
                {a.overdue} overdue task{a.overdue === 1 ? "" : "s"}
                {a.sites > 1 ? ` across ${a.sites} sites` : ""}
              </Text>
              <Text style={styles.ctaSub}>{a.oldestDays > 0 ? `The oldest is ${a.oldestDays} day${a.oldestDays === 1 ? "" : "s"} late.` : "Review them now."}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push("/kanban")} style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>Review overdue</Text>
              </Pressable>
            </>
          )}
        </View>
      );
    }
    case "activity_map":
      return (
        <CardShell look={look} title={title} right={period}>
          <Heat days={activityMap(data.tasks, days)} />
        </CardShell>
      );
    case "on_shift":
      return (
        <CardShell look={look} title={title}>
          <Text style={styles.big}>{data.onShift.length}<Text style={styles.unit}>  clocked in</Text></Text>
          {card.view === "list" ? (
            <View style={{ marginTop: spacing.sm }}>
              {data.mySites.slice(0, 6).map((s, i) => (
                <View key={s.id} style={[styles.listRow, i > 0 && styles.divider]}>
                  <Text style={styles.listName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.listCount}>{data.onShiftBySite(s.id)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.sub}>{data.onShift.length === 0 ? "Nobody clocked in yet" : `Across ${data.mySites.length} site${data.mySites.length === 1 ? "" : "s"}`}</Text>
          )}
        </CardShell>
      );
    case "quality": {
      const q = qualitySummary(data.inspections, data.correctiveActions, days);
      return (
        <CardShell look={look} title={title} right={period}>
          {card.view === "ring" ? (
            <View style={styles.ringRow}>
              <Ring pct={q.passRate} label={`${q.passRate}%`} sub="pass rate" />
              <Text style={styles.sub}>Average score {q.avgScore}{"\n"}{q.passed} passed, {q.failed} failed</Text>
            </View>
          ) : card.view === "bar" ? (
            <Stack parts={[{ value: q.passed, tone: "success", label: "Passed" }, { value: q.failed, tone: "destructive", label: "Failed" }, { value: q.openActions, tone: "warning", label: "Corrective" }]} />
          ) : (
            <Text style={styles.big}>{q.passRate}<Text style={styles.unit}>  % pass rate</Text></Text>
          )}
        </CardShell>
      );
    }
    case "open_tasks": {
      const open = data.openTasks.length;
      const late = data.overdue.length;
      return (
        <CardShell look={look} title={title}>
          {card.view === "ring" ? (
            <View style={{ alignItems: "center" }}><Ring pct={open ? Math.round((late / open) * 100) : 0} label={String(late)} sub={`of ${open} late`} /></View>
          ) : (
            <>
              <Text style={styles.big}>{open}</Text>
              {card.view === "bar" ? <View style={{ marginTop: spacing.md }}><Stack parts={[{ value: late, tone: "destructive", label: "Overdue" }, { value: open - late, tone: "success", label: "On time" }]} /></View> : null}
            </>
          )}
        </CardShell>
      );
    }
    case "incidents":
      return (
        <CardShell look={look} title={title}>
          <Text style={styles.big}>{data.openIncidents.length}</Text>
          {card.view === "bar" ? <View style={{ marginTop: spacing.md }}><Stack parts={[{ value: data.openIncidents.length, tone: "warning", label: "Incidents" }, { value: data.openActions.length, tone: "destructive", label: "Corrective" }]} /></View> : null}
        </CardShell>
      );
    case "corrective_actions": {
      const open = data.openActions.length;
      const overdue = data.correctiveActions.filter((a) => a.status === "overdue").length;
      return (
        <CardShell look={look} title={title}>
          <Text style={styles.big}>{open}<Text style={styles.unit}>  open</Text></Text>
          {card.view === "bar" ? <View style={{ marginTop: spacing.md }}><Stack parts={[{ value: overdue, tone: "destructive", label: "Overdue" }, { value: open - overdue, tone: "warning", label: "Open" }]} /></View> : <Text style={styles.sub}>{overdue} overdue</Text>}
        </CardShell>
      );
    }
    default:
      return null;
  }
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.xl + 6,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.sm + 2,
    },
    cardCompact: { padding: spacing.md },
    cardOutlined: { backgroundColor: "transparent" },
    cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
    cardTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    big: { fontSize: 36, fontWeight: "300", color: colors.foreground, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    pct: { fontSize: 30, fontWeight: "700", color: colors.foreground },
    pctUnit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    bars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
    stack: { height: 10, borderRadius: 5, backgroundColor: colors.secondary, overflow: "hidden", flexDirection: "row" },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    heat: { flexDirection: "row", gap: 4 },
    heatCol: { gap: 4 },
    heatCell: { width: 18, height: 18, borderRadius: 4, backgroundColor: colors.primary },
    ringMid: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
    ringLabel: { fontSize: 20, fontWeight: "700", color: colors.foreground },
    ringSub: { fontSize: 11, color: colors.mutedForeground },
    ringRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
    listRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    listName: { flex: 1, fontSize: typography.body, color: colors.foreground },
    listCount: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    cta: { backgroundColor: colors.primary, borderRadius: radius.xl + 6, padding: spacing.lg, marginBottom: spacing.sm + 2 },
    ctaTag: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    ctaTagText: { fontSize: typography.small - 0.5, fontWeight: "700", color: colors.primaryForeground },
    ctaTitle: { marginTop: spacing.md, fontSize: 24, fontWeight: "800", color: colors.primaryForeground, lineHeight: 28 },
    ctaSub: { marginTop: spacing.sm, fontSize: typography.small, color: colors.primaryForeground, opacity: 0.85 },
    ctaButton: { alignSelf: "flex-start", marginTop: spacing.md, height: 38, paddingHorizontal: spacing.lg, borderRadius: radius.round, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
    ctaButtonText: { fontSize: typography.small + 1, fontWeight: "700", color: colors.black },
  }),
);
