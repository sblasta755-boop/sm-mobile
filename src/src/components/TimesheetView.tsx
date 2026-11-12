import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAttendanceTimesheet, type TimesheetDay } from "@/api/client";
import { useSmartClean } from "@/features/store";
import {
  EXCEPTION_LABELS,
  SEGMENT_END_LABELS,
  addDays,
  dateKey,
  dayLabel,
  formatClock,
  formatDuration,
  groupPeople,
  isIncomplete,
  needsCheck,
  startOfWeek,
  weekLabel,
} from "@/domain/timesheet";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The week's hours for the manager's people: one row per person (hours, and how many days need a look), a card per day
 * when opened. It reads the same computed timesheet as the web app, so the two never disagree. Amending, approving and
 * exporting stay on the web timesheet.
 */
export function TimesheetView() {
  useThemeVersion();
  const { state } = useSmartClean();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [days, setDays] = useState<TimesheetDay[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [opened, setOpened] = useState<string[]>([]);
  const periodStart = dateKey(weekStart);
  const periodEnd = dateKey(addDays(weekStart, 6));
  const isThisWeek = periodStart === dateKey(startOfWeek(new Date()));

  useEffect(() => {
    if (!state.accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAttendanceTimesheet(state.accessToken, periodStart, periodEnd)
      .then((result) => {
        if (cancelled) return;
        setDays(result.days);
        setTotals(result.totals);
        setOpened([]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the timesheet");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.accessToken, periodStart, periodEnd, retry]);

  const people = useMemo(() => groupPeople(days), [days]);
  const grandTotal = people.reduce((sum, p) => sum + (totals[p.userId] ?? 0), 0);
  const toggle = (id: string) => setOpened((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <View>
      <View style={[styles.card, styles.weekBar]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => setWeekStart((w) => addDays(w, -7))} style={styles.arrow} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.weekMid}>
          <Text style={styles.week} numberOfLines={1}>{weekLabel(weekStart)}</Text>
          {!isThisWeek && (
            <Pressable accessibilityRole="button" onPress={() => setWeekStart(startOfWeek(new Date()))} hitSlop={8}>
              <Text style={styles.link}>Back to this week</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next week"
          accessibilityState={{ disabled: isThisWeek }}
          disabled={isThisWeek}
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          style={[styles.arrow, isThisWeek && styles.disabled]}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.empty}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetry((n) => n + 1)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : people.length === 0 ? (
        <View style={styles.card}><Text style={styles.empty}>Nobody clocked in this week.</Text></View>
      ) : (
        <>
          <Text style={styles.summary}>
            {people.length} {people.length === 1 ? "person" : "people"} · {formatDuration(grandTotal)} worked
          </Text>
          <View style={styles.card}>
            {people.map((p, i) => {
              const open = opened.includes(p.userId);
              const check = p.rows.filter(needsCheck).length;
              return (
                <View key={p.userId} style={i > 0 && styles.rowBorder}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => toggle(p.userId)} style={styles.person}>
                    <View style={styles.who}>
                      <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.muted}>
                        {p.rows.length} {p.rows.length === 1 ? "day" : "days"}
                        {check > 0 ? ` · ${check} to check` : ""}
                      </Text>
                    </View>
                    <Text style={styles.hours}>{formatDuration(totals[p.userId])}</Text>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </Pressable>
                  {open && (
                    <View style={styles.days}>
                      {p.rows.map((d) => <DayCard key={d.id} day={d} />)}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.note}>Amend a day, approve the week or export it on the web timesheet.</Text>
        </>
      )}
    </View>
  );
}

function DayCard({ day }: { day: TimesheetDay }) {
  const stretches = day.segments ?? [];
  const chips = [
    ...(isIncomplete(day) ? [{ key: "incomplete", text: `Missing clock ${day.clockInAt ? "out" : "in"}`, warn: true }] : []),
    ...day.exceptions.map((code) => ({ key: code, text: EXCEPTION_LABELS[code] ?? code, warn: false })),
    ...(day.approvalState === "approved" ? [{ key: "approved", text: "Approved", warn: false }] : []),
  ];
  return (
    <View style={styles.day}>
      <View style={styles.dayTop}>
        <Text style={styles.dayName}>{dayLabel(day.workDate)}</Text>
        <Text style={styles.dayHours}>{formatDuration(day.workedMinutes)}</Text>
      </View>
      <Text style={styles.muted}>
        {formatClock(day.clockInAt)} to {formatClock(day.clockOutAt)}
        {day.source === "auto_closed" ? " (auto)" : ""}
        {day.siteName ? ` · ${day.siteName}` : ""}
      </Text>
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((c) => (
            <View key={c.key} style={[styles.chip, c.warn && styles.chipWarn]}>
              <Text style={styles.chipText}>{c.text}</Text>
            </View>
          ))}
        </View>
      )}
      {stretches.length > 1 && (
        <Text style={[styles.muted, styles.stretches]}>
          On site:{" "}
          {stretches
            .map(
              (s) =>
                `${formatClock(s.startedAt)} to ${s.endedAt ? formatClock(s.endedAt) : "now"}${
                  s.endedAt && s.endReason ? ` (${SEGMENT_END_LABELS[s.endReason] ?? s.endReason})` : ""
                }`,
            )
            .join(" · ")}
          . Time away is not counted.
        </Text>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.md },
    weekBar: { flexDirection: "row", alignItems: "center", padding: spacing.sm },
    arrow: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    disabled: { opacity: 0.3 },
    weekMid: { flex: 1, alignItems: "center" },
    week: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    link: { fontSize: typography.small, fontWeight: "600", color: colors.primary },
    center: { paddingVertical: spacing.xl, alignItems: "center" },
    empty: { padding: spacing.lg, fontSize: typography.small, color: colors.mutedForeground },
    retry: { alignSelf: "flex-start", marginHorizontal: spacing.lg, marginBottom: spacing.lg },
    retryText: { fontSize: typography.body, fontWeight: "700", color: colors.primary },
    summary: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
    note: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    person: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    who: { flex: 1, gap: 2 },
    name: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    hours: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    days: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.muted, borderTopWidth: 1, borderTopColor: colors.border },
    day: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 2 },
    dayTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    dayName: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    dayHours: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
    chip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round, backgroundColor: colors.muted },
    chipWarn: { borderWidth: 1, borderColor: colors.warning },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    stretches: { marginTop: spacing.sm },
  }),
);
