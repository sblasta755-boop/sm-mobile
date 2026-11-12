import { useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listSiteBookings, type StaffBooking } from "@/api/client";
import { useSmartClean } from "@/features/store";
import {
  compareToSchedule,
  statusText,
  statusTone,
  summarise,
  type ScheduleRow,
  type ScheduleTone,
} from "@/domain/onShiftSchedule";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const BADGE: Record<ScheduleRow["state"], string> = {
  on_site: "On site",
  not_in: "Not in",
  no_show: "No show",
  location_lost: "Location lost",
  clocked_out: "Left",
  upcoming: "Later",
  finished: "Finished",
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

/**
 * Who is on site, set against who is booked to be. A list of clock-ins cannot show who is missing, so each person
 * booked for today is compared with their live state (on site, late, never arrived, left early, location lost, due
 * later) and anyone on site without a booking is marked as not scheduled. Reads bootstrap for the live state and the
 * schedule for today's bookings (and yesterday's, for a night shift still running). The web app's is OnShiftNow.tsx.
 */
export function OnShiftNow({ sites }: { sites: { id: string; name: string }[] }) {
  useThemeVersion();
  const { state } = useSmartClean();
  const [bookings, setBookings] = useState<StaffBooking[]>([]);
  const [scheduleError, setScheduleError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const token = state.accessToken;
  const today = dayKey(now);

  // Someone "late" becomes later as the minutes pass, so the clock moves even when nothing else changes.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    const sub = AppState.addEventListener("change", (next) => next === "active" && setNow(new Date()));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      const current = new Date();
      const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
      listSiteBookings(token, dayKey(yesterday), dayKey(current))
        .then((list) => {
          if (cancelled) return;
          setBookings(list);
          setScheduleError(false);
        })
        .catch(() => !cancelled && setScheduleError(true))
        .finally(() => !cancelled && setLoaded(true));
    };
    load();
    // Bookings change rarely; a new day or an edit is picked up within minutes, or when the app comes back.
    const timer = setInterval(load, 5 * 60_000);
    const sub = AppState.addEventListener("change", (next) => next === "active" && load());
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [token, today]);

  const siteIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites]);
  const rows = useMemo(() => {
    const names = Object.fromEntries(state.users.map((u) => [u.id, u.name]));
    return compareToSchedule({ bookings, attendance: state.attendance, names, now }).filter((r) => siteIds.has(r.siteId));
  }, [bookings, state.attendance, state.users, now, siteIds]);
  const summary = useMemo(() => summarise(rows), [rows]);

  const toneColor = (tone: ScheduleTone) =>
    tone === "ok" ? colors.success : tone === "bad" ? colors.destructive : tone === "warn" ? colors.warning : colors.mutedForeground;
  const toneSoft = (tone: ScheduleTone) =>
    tone === "ok" ? colors.successSoft : tone === "bad" ? colors.destructiveSoft : tone === "warn" ? colors.warningSoft : colors.muted;

  const chips = [
    { label: "missing", count: summary.missing, tone: "bad" as const },
    { label: "location lost", count: summary.locationLost, tone: "bad" as const },
    { label: "left early", count: summary.leftEarly, tone: "warn" as const },
    { label: "due later", count: summary.upcoming, tone: "muted" as const },
    { label: "not scheduled", count: summary.unscheduled, tone: "muted" as const },
  ].filter((c) => c.count > 0);

  return (
    <View>
      <View style={[styles.card, styles.summary]}>
        <View style={styles.headline}>
          <Ionicons name="people-outline" size={20} color={colors.primary} />
          <Text style={styles.big}>{summary.scheduled > 0 ? summary.scheduledOnSite : summary.onSite}</Text>
          <Text style={styles.muted}>
            {summary.scheduled > 0
              ? `on site of ${summary.scheduled} scheduled`
              : `on site across ${sites.length} ${sites.length === 1 ? "site" : "sites"}`}
          </Text>
        </View>
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((c) => (
              <View key={c.label} style={[styles.chip, { backgroundColor: toneSoft(c.tone) }]}>
                <Text style={[styles.chipText, { color: toneColor(c.tone) }]}>
                  {c.count} {c.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {loaded && scheduleError && (
        <Text style={styles.note} accessibilityRole="alert">
          The schedule could not be loaded, so this shows who is clocked in but not who is missing.
        </Text>
      )}
      {loaded && !scheduleError && summary.scheduled === 0 && (
        <Text style={styles.note}>
          Nobody is booked for today, so there is nothing to compare against. Book people under Schedule to see who is missing.
        </Text>
      )}

      {sites.map((site) => {
        const here = rows.filter((r) => r.siteId === site.id);
        const expected = here.filter((r) => r.scheduled).length;
        // Booked people who are here; a walk-in is shown on the list but never counted towards the booking.
        const onSite = here.filter((r) => (expected > 0 ? r.scheduled : true) && r.state === "on_site").length;
        return (
          <View key={site.id} style={styles.card}>
            <View style={styles.siteHead}>
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <Text style={styles.siteName} numberOfLines={1}>{site.name}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{expected > 0 ? `${onSite} of ${expected} here` : `${onSite} on site`}</Text>
              </View>
            </View>
            {here.length === 0 ? (
              <Text style={styles.empty}>{loaded ? "Nobody booked or clocked in" : "Loading the schedule..."}</Text>
            ) : (
              here.map((r, i) => {
                const tone = statusTone(r);
                return (
                  <View key={r.userId} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={[styles.avatar, r.state === "on_site" && { backgroundColor: colors.successSoft }]}>
                      <Text style={styles.avatarText}>{initialsOf(r.name)}</Text>
                    </View>
                    <View style={styles.who}>
                      <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.muted}>{statusText(r)}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: toneSoft(tone) }]}>
                      <Text style={[styles.badgeText, { color: toneColor(tone) }]}>{BADGE[r.state]}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.md },
    summary: { padding: spacing.lg, gap: spacing.md },
    headline: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    big: { fontSize: 32, fontWeight: "300", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    chip: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round },
    chipText: { fontSize: typography.small, fontWeight: "700" },
    note: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.md, paddingHorizontal: spacing.xs },
    siteHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.muted, borderBottomWidth: 1, borderBottomColor: colors.border },
    siteName: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round, backgroundColor: colors.muted },
    pillText: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    empty: { padding: spacing.lg, fontSize: typography.small, color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
    avatarText: { fontSize: typography.small, fontWeight: "800", color: colors.primary },
    who: { flex: 1, gap: 2 },
    name: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round },
    badgeText: { fontSize: typography.small, fontWeight: "700" },
  }),
);
