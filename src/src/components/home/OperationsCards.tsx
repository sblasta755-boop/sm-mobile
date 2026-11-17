import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CardShell, Stack } from "@/components/home/CustomCards";
import { compareToSchedule, statusText, statusTone, summarise, type ScheduleTone } from "@/domain/onShiftSchedule";
import { agoText } from "@/domain/homeSummary";
import { DEFAULT_LOOK, type Look } from "@/domain/homeLayout";
import type { ManagerOverviewData } from "@/features/managerOverview";
import type { HomeSummaryApi } from "@/features/useHomeSummary";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The operations cards (who is in, what waits for you, site pulse, maintenance, stock): not about tasks. Written once
 * and used by the Classic home and the Custom home, each in the view the person chose. A card whose data the server
 * left out is not drawn at all (see operationsAvailable in domain/homeSummary.ts), never shown as a made-up zero.
 */

/** Each card's first view, which Classic shows (its Custom view is chosen in the editor). */
export const DEFAULT_VIEW: Record<string, string> = {
  attendance_now: "roster",
  approvals: "list",
  site_pulse: "list",
  maintenance: "summary",
  stock_alerts: "list",
  leave_today: "list",
  compliance_reviews: "summary",
  noticeboard: "number",
  device_battery: "list",
};

// Where a row goes: the screens that already exist.
const GO = {
  attendance: "/attendance",
  overtime: "/overtime",
  leave: "/leave",
  onboarding: "/manage-approvals",
  maintenance: "/maintenance",
  stock: "/stock",
  inspections: "/kanban",
  compliance: "/hourly-compliance",
  noticeboard: "/noticeboard",
} as const;
const go = (to: string) => () => router.push(to as never);

const TONE: Record<ScheduleTone, string> = { ok: "success", warn: "warning", bad: "destructive", muted: "mutedForeground" };

function Updated({ summary }: { summary: HomeSummaryApi }) {
  useThemeVersion();
  if (!summary.stale || summary.state.fetchedAt === null) return null;
  return <Text style={styles.updated}>updated {agoText(summary.state.fetchedAt, Date.now())}</Text>;
}

function Skeleton() {
  useThemeVersion();
  return <View accessibilityLabel="Loading" style={styles.skeleton} />;
}

function Row({ label, count, tone, onPress }: { label: string; count: number; tone?: "bad" | "warn"; onPress: () => void }) {
  useThemeVersion();
  const hot = count > 0;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
      <View style={[styles.pill, hot ? { backgroundColor: tone === "bad" ? colors.destructiveSoft : colors.warningSoft } : { backgroundColor: colors.secondary }]}>
        <Text style={[styles.pillText, hot ? { color: tone === "bad" ? colors.destructive : colors.warningForeground } : { color: colors.mutedForeground }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

// ---- Who is in ----

function AttendanceNow({ summary, data, view, look }: Props) {
  useThemeVersion();
  const bookings = summary.state.data.schedule?.bookings;
  const names = useMemo(() => Object.fromEntries(data.users.map((u) => [u.id, u.name])), [data.users]);
  const rows = useMemo(
    () => (bookings ? compareToSchedule({ bookings, attendance: data.attendance, names, now: new Date() }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, data.attendance, names, summary.stale],
  );
  const s = summarise(rows);
  const attention = rows.filter((r) => r.state === "no_show" || r.state === "location_lost" || (r.state === "not_in" && statusTone(r) === "bad")).slice(0, 5);
  const waiting = summary.status("schedule") === "loading";

  return (
    <CardShell look={look} title="Who is in" right={<Updated summary={summary} />}>
      {bookings === undefined ? (
        // No schedule to compare with (scheduling is off, or still loading): only the live count.
        <Pressable accessibilityRole="button" onPress={go(GO.attendance)}>
          {waiting ? <Skeleton /> : <Text style={styles.big}>{data.onShift.length}<Text style={styles.unit}>  on site now</Text></Text>}
          {!waiting ? <Text style={styles.sub}>No schedule to compare with</Text> : null}
        </Pressable>
      ) : view === "number" ? (
        <Pressable accessibilityRole="button" onPress={go(GO.attendance)}>
          <Text style={styles.big}>{s.onSite}<Text style={styles.unit}>  of {s.scheduled} booked on site</Text></Text>
          <Text style={styles.sub}>{s.missing} late or missing · {s.upcoming} not due yet</Text>
        </Pressable>
      ) : view === "bar" ? (
        <Pressable accessibilityRole="button" onPress={go(GO.attendance)}>
          <Stack parts={[{ value: s.scheduledOnSite, tone: "success", label: "On site" }, { value: s.missing, tone: "destructive", label: "Late or missing" }, { value: s.upcoming, tone: "primary", label: "Not due yet" }]} />
        </Pressable>
      ) : (
        <View>
          <Text style={styles.big}>{s.onSite}<Text style={styles.unit}>  on site · {s.scheduled} booked</Text></Text>
          {attention.length === 0 ? (
            <Text style={[styles.sub, { marginTop: spacing.sm }]}>{s.scheduled === 0 ? "Nobody is booked today." : "Everyone due is in."}</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {attention.map((r, i) => (
                <Pressable key={r.userId} accessibilityRole="button" onPress={go(GO.attendance)} style={[styles.person, i > 0 && styles.divider]}>
                  <View style={[styles.dot, { backgroundColor: colors[TONE[statusTone(r)] as "success"] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{statusText(r)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </CardShell>
  );
}

// ---- Waiting for you ----

function Approvals({ summary, data, view, look }: Props) {
  useThemeVersion();
  const block = summary.state.data.approvals;
  // Tasks awaiting an inspection decision are already in /bootstrap.
  const inspections = data.tasks.filter((t) => ["submitted", "awaiting_inspection", "resubmitted"].includes(t.status)).length;
  const lines: { key: string; label: string; count: number; to: string; tone: "bad" | "warn" }[] = [
    ...(block?.overtime !== undefined ? [{ key: "overtime", label: "Overtime requests", count: block.overtime, to: GO.overtime, tone: "bad" as const }] : []),
    ...(block?.leave !== undefined ? [{ key: "leave", label: "Leave requests", count: block.leave, to: GO.leave, tone: "bad" as const }] : []),
    ...(block?.onboarding !== undefined ? [{ key: "onboarding", label: "Staff sign-ups", count: block.onboarding, to: GO.onboarding, tone: "bad" as const }] : []),
    ...(block?.maintenance !== undefined ? [{ key: "maintenance", label: "Maintenance quotes", count: block.maintenance, to: GO.maintenance, tone: "bad" as const }] : []),
    { key: "inspections", label: "Work to inspect", count: inspections, to: GO.inspections, tone: "warn" },
  ];
  const total = lines.reduce((a, l) => a + l.count, 0);
  const waiting = summary.status("approvals") === "loading";

  return (
    <CardShell look={look} title="Waiting for you" right={<Updated summary={summary} />}>
      {waiting && !block ? (
        <Skeleton />
      ) : view === "number" ? (
        <Text style={styles.big}>{total}<Text style={styles.unit}>  {total === 1 ? "decision" : "decisions"} waiting</Text></Text>
      ) : total === 0 ? (
        <Text style={styles.sub}>Nothing is waiting for you.</Text>
      ) : (
        lines.map((l) => <Row key={l.key} label={l.label} count={l.count} tone={l.tone} onPress={go(l.to)} />)
      )}
    </CardShell>
  );
}

// ---- Site pulse (from /bootstrap alone) ----

function SitePulse({ data, view, look }: Props) {
  useThemeVersion();
  const rows = data.mySites.map((site) => ({
    id: site.id,
    name: site.name,
    onSite: data.onShiftBySite(site.id),
    overdue: data.openTasks.filter((t) => t.siteId === site.id && t.scheduledAt && new Date(t.scheduledAt) < new Date()).length,
    incidents: data.openIncidents.filter((i) => i.siteId === site.id).length,
  }));
  const max = Math.max(1, ...rows.map((r) => r.overdue));
  return (
    <CardShell look={look} title="Site pulse">
      {rows.length === 0 ? (
        <Text style={styles.sub}>No sites to show.</Text>
      ) : view === "bar" ? (
        rows.map((r) => (
          <View key={r.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.split}>
              <Text style={styles.sub} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.sub}>{r.overdue} overdue</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${(r.overdue / max) * 100}%`, backgroundColor: colors.destructive }]} /></View>
          </View>
        ))
      ) : (
        <View>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 1 }]}>Site</Text>
            <Text style={styles.thNum}>On site</Text>
            <Text style={styles.thNum}>Overdue</Text>
            <Text style={styles.thNum}>Incidents</Text>
          </View>
          {rows.map((r, i) => (
            <View key={r.id} style={[styles.tableRow, i > 0 && styles.divider]}>
              <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.num}>{r.onSite}</Text>
              <Text style={[styles.num, r.overdue > 0 && { color: colors.destructive, fontWeight: "700" }]}>{r.overdue}</Text>
              <Text style={[styles.num, r.incidents > 0 && { color: colors.warningForeground, fontWeight: "700" }]}>{r.incidents}</Text>
            </View>
          ))}
        </View>
      )}
    </CardShell>
  );
}

// ---- Maintenance ----

function Maintenance({ summary, view, look }: Props) {
  useThemeVersion();
  const m = summary.state.data.maintenance;
  const waiting = summary.status("maintenance") === "loading";
  const chips = m
    ? [
        { label: "critical", value: m.critical, bad: true },
        { label: "awaiting approval", value: m.awaitingApproval, bad: false },
        { label: "need a quote", value: m.needQuote, bad: false },
        { label: "to verify", value: m.verify, bad: false },
        ...(m.paymentsOverdue !== undefined ? [{ label: "invoices overdue", value: m.paymentsOverdue, bad: true }] : []),
      ].filter((c) => c.value > 0)
    : [];
  return (
    <CardShell look={look} title="Maintenance" right={<Updated summary={summary} />}>
      {!m ? (
        waiting ? <Skeleton /> : null
      ) : (
        <Pressable accessibilityRole="button" onPress={go(GO.maintenance)}>
          <Text style={styles.big}>{m.open}<Text style={styles.unit}>  open jobs</Text></Text>
          {view !== "number" && chips.length > 0 ? (
            <View style={styles.chips}>
              {chips.map((c) => (
                <View key={c.label} style={[styles.chip, { backgroundColor: c.bad ? colors.destructiveSoft : colors.warningSoft }]}>
                  <Text style={[styles.chipText, { color: c.bad ? colors.destructive : colors.warningForeground }]}>{c.value} {c.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      )}
    </CardShell>
  );
}

// ---- Stock alerts ----

function StockAlerts({ summary, view, look }: Props) {
  useThemeVersion();
  const s = summary.state.data.stock;
  const waiting = summary.status("stock") === "loading";
  return (
    <CardShell look={look} title="Stock alerts" right={<Updated summary={summary} />}>
      {!s ? (
        waiting ? <Skeleton /> : null
      ) : view === "number" ? (
        <Pressable accessibilityRole="button" onPress={go(GO.stock)}>
          <Text style={styles.big}>{s.outOfStock + s.atReorder}<Text style={styles.unit}>  items need stock</Text></Text>
        </Pressable>
      ) : s.outOfStock + s.atReorder + s.restockOpen === 0 ? (
        <Text style={styles.sub}>Stock is healthy.</Text>
      ) : (
        <View>
          <Row label="Out of stock" count={s.outOfStock} tone="bad" onPress={go(GO.stock)} />
          <Row label="At reorder level" count={s.atReorder} tone="warn" onPress={go(GO.stock)} />
          <Row label="Restock tasks open" count={s.restockOpen} tone="warn" onPress={go(GO.stock)} />
        </View>
      )}
    </CardShell>
  );
}

// ---- Away today ----

function LeaveToday({ summary, view, look }: Props) {
  useThemeVersion();
  const b = summary.state.data.leave;
  const waiting = summary.status("leave") === "loading";
  return (
    <CardShell look={look} title="Away today" right={<Updated summary={summary} />}>
      {!b ? (
        waiting ? <Skeleton /> : null
      ) : view === "number" ? (
        <Pressable accessibilityRole="button" onPress={go(GO.leave)}>
          <Text style={styles.big}>{b.awayToday}<Text style={styles.unit}>  on leave today</Text></Text>
        </Pressable>
      ) : b.awayToday === 0 ? (
        <Text style={styles.sub}>Nobody is on leave today.</Text>
      ) : (
        <View>
          <Text style={styles.big}>{b.awayToday}<Text style={styles.unit}>  on leave today</Text></Text>
          <View style={{ marginTop: spacing.sm }}>
            {b.away.map((p, i) => (
              <Pressable key={`${p.userName}-${i}`} accessibilityRole="button" onPress={go(GO.leave)} style={[styles.person, i > 0 && styles.divider]}>
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{p.userName}</Text>
                <Text style={styles.sub} numberOfLines={1}>{p.typeName}{p.endDate ? ` · back after ${p.endDate}` : ""}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </CardShell>
  );
}

// ---- Compliance reviews ----

function ComplianceReviews({ summary, view, look }: Props) {
  useThemeVersion();
  const b = summary.state.data.compliance;
  const waiting = summary.status("compliance") === "loading";
  return (
    <CardShell look={look} title="Compliance reviews" right={<Updated summary={summary} />}>
      {!b ? (
        waiting ? <Skeleton /> : null
      ) : (
        <Pressable accessibilityRole="button" onPress={go(GO.compliance)}>
          <Text style={styles.big}>{b.reviewsWaiting}<Text style={styles.unit}>  {b.reviewsWaiting === 1 ? "day" : "days"} waiting for sign-off</Text></Text>
          {view !== "number" && (b.withFailures > 0 || b.disputed > 0) ? (
            <View style={styles.chips}>
              {b.withFailures > 0 ? <View style={[styles.chip, { backgroundColor: colors.destructiveSoft }]}><Text style={[styles.chipText, { color: colors.destructive }]}>{b.withFailures} with failed checks</Text></View> : null}
              {b.disputed > 0 ? <View style={[styles.chip, { backgroundColor: colors.warningSoft }]}><Text style={[styles.chipText, { color: colors.warningForeground }]}>{b.disputed} disputed</Text></View> : null}
            </View>
          ) : null}
        </Pressable>
      )}
    </CardShell>
  );
}

// ---- Noticeboard ----

function Noticeboard({ summary, look }: Props) {
  useThemeVersion();
  const b = summary.state.data.noticeboard;
  const waiting = summary.status("noticeboard") === "loading";
  return (
    <CardShell look={look} title="Noticeboard" right={<Updated summary={summary} />}>
      {!b ? (
        waiting ? <Skeleton /> : null
      ) : (
        <Pressable accessibilityRole="button" onPress={go(GO.noticeboard)}>
          <Text style={styles.big}>{b.unread}<Text style={styles.unit}>  {b.unread === 1 ? "notice" : "notices"} unread</Text></Text>
        </Pressable>
      )}
    </CardShell>
  );
}

// ---- Phone batteries (no phone screen lists the team's batteries, so these rows are not links) ----

function DeviceBattery({ summary, view, look }: Props) {
  useThemeVersion();
  const b = summary.state.data.devices;
  const waiting = summary.status("devices") === "loading";
  return (
    <CardShell look={look} title="Phone batteries" right={<Updated summary={summary} />}>
      {!b ? (
        waiting ? <Skeleton /> : null
      ) : view === "number" ? (
        <Text style={styles.big}>{b.lowBattery}<Text style={styles.unit}>  phones low</Text></Text>
      ) : b.lowBattery + b.notReporting === 0 ? (
        <Text style={styles.sub}>All {b.reporting} phones are charged and reporting.</Text>
      ) : (
        <View>
          <Row label="Low on battery" count={b.lowBattery} tone="bad" onPress={() => undefined} />
          <Row label="Not reporting" count={b.notReporting} tone="warn" onPress={() => undefined} />
          {b.lowest.map((p, i) => (
            <View key={`${p.userName}-${i}`} style={[styles.listRow, i === 0 && styles.divider]}>
              <Text style={styles.listName} numberOfLines={1}>{p.userName}</Text>
              <Text style={[styles.listCount, { color: colors.destructive }]}>{p.batteryLevel}%</Text>
            </View>
          ))}
        </View>
      )}
    </CardShell>
  );
}

// ---- entry point ----

interface Props {
  summary: HomeSummaryApi;
  data: ManagerOverviewData;
  view: string;
  look: Look;
}

/** One operations card in the given view. Check operationsAvailable first, so a card with nothing to show is not drawn. */
export function OperationsCard({ id, summary, data, view, look }: { id: string; summary: HomeSummaryApi; data: ManagerOverviewData; view?: string; look?: Look }) {
  const p = { summary, data, view: view ?? DEFAULT_VIEW[id] ?? "", look: look ?? DEFAULT_LOOK };
  switch (id) {
    case "attendance_now":
      return <AttendanceNow {...p} />;
    case "approvals":
      return <Approvals {...p} />;
    case "site_pulse":
      return <SitePulse {...p} />;
    case "maintenance":
      return <Maintenance {...p} />;
    case "stock_alerts":
      return <StockAlerts {...p} />;
    case "leave_today":
      return <LeaveToday {...p} />;
    case "compliance_reviews":
      return <ComplianceReviews {...p} />;
    case "noticeboard":
      return <Noticeboard {...p} />;
    case "device_battery":
      return <DeviceBattery {...p} />;
    default:
      return null;
  }
}

const styles = themedStyles(() =>
  StyleSheet.create({
    big: { fontSize: 36, fontWeight: "300", color: colors.foreground, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    sub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    updated: { fontSize: 11, color: colors.mutedForeground },
    skeleton: { height: 36, width: 96, borderRadius: radius.md, backgroundColor: colors.secondary },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm + 2 },
    rowLabel: { flex: 1, fontSize: typography.body, color: colors.foreground },
    pill: { minWidth: 28, alignItems: "center", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.round },
    pillText: { fontSize: typography.small, fontWeight: "700" },
    person: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.sm },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    name: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    split: { flexDirection: "row", justifyContent: "space-between" },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.secondary, marginTop: 4, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4 },
    tableHead: { flexDirection: "row", paddingBottom: spacing.xs },
    th: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.mutedForeground },
    thNum: { width: 62, textAlign: "right", fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: colors.mutedForeground },
    tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
    num: { width: 62, textAlign: "right", fontSize: typography.body, color: colors.foreground },
    listRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
    listName: { flex: 1, fontSize: typography.body, color: colors.foreground },
    listCount: { fontSize: typography.body, fontWeight: "700" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.round },
    chipText: { fontSize: typography.small, fontWeight: "700" },
  }),
);
