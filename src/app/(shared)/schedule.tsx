import { useCallback, useMemo, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ScheduleMap } from "@/components/ScheduleMap";
import { CalendarFrame, CalendarLegend, DotStrip, MonthTiles, type DayTileData } from "@/components/MonthCalendar";
import { heatColor, monthDays, monthTitle } from "@/domain/calendarGrid";
import { appAlert } from "@/components/Dialog";
import { cancelBooking, listMyBookings, listSiteBookings, type StaffBooking } from "@/api/client";
import { addDays, bookingShifts, bookingTime, isPastDay, mondayOf, dateKey, dayHeading, groupByDay, mapsUrl, parseDateKey } from "@/domain/schedule";
import { useCanBook, useScheduleOn } from "@/features/schedule";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const AHEAD_DAYS = 30;

/** When and where a person is booked, as a list or on a map. Managers can also see everyone's bookings and book people. */
export default function ScheduleScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const on = useScheduleOn();
  const canBook = useCanBook();
  const homePath = useHomePath();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [view, setView] = useState<"list" | "map" | "calendar">("calendar");
  const [monthStart, setMonthStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [pickedDay, setPickedDay] = useState(() => dateKey(new Date()));
  const [bookings, setBookings] = useState<StaffBooking[] | null>(null);
  const [mapDay, setMapDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    // The calendar shows six whole weeks around the month; the list and map show the next 30 days.
    const gridStart = mondayOf(monthStart);
    const start = view === "calendar" ? dateKey(gridStart) : dateKey(new Date());
    const end = view === "calendar" ? dateKey(addDays(gridStart, 41)) : dateKey(addDays(new Date(), AHEAD_DAYS));
    try {
      setBookings(
        scope === "all" && canBook
          ? await listSiteBookings(state.accessToken, start, end)
          : await listMyBookings(state.accessToken, start, end),
      );
    } catch (error) {
      appAlert("Could not load the schedule", error instanceof Error ? error.message : "Please try again.");
    }
  }, [state.accessToken, scope, canBook, view, monthStart]);

  useFocusEffect(
    useCallback(() => {
      if (on) void load();
    }, [on, load]),
  );

  const groups = useMemo(() => groupByDay(bookings ?? []), [bookings]);
  const activeDay = mapDay && groups.some((g) => g.date === mapDay) ? mapDay : (groups[0]?.date ?? null);
  const pins = useMemo(() => {
    const items = groups.find((g) => g.date === activeDay)?.items ?? [];
    const bySite = new Map<string, { site: StaffBooking["site"]; lines: string[] }>();
    for (const b of items) {
      const entry = bySite.get(b.siteId) ?? { site: b.site, lines: [] };
      entry.lines.push(`${scope === "all" ? `${b.userName}: ` : ""}${bookingTime(b)}`);
      bySite.set(b.siteId, entry);
    }
    return [...bySite.values()];
  }, [groups, activeDay, scope]);
  const plotted = pins.filter((p) => p.site.latitude != null && p.site.longitude != null);

  if (!on) return <Redirect href={homePath as never} />;

  const cancel = (b: StaffBooking) =>
    appAlert("Cancel this booking?", `${b.userName} will be told that ${dayHeading(b.date).toLowerCase()} at ${b.site.name} is cancelled.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () =>
          void cancelBooking(state.accessToken as string, b.id)
            .then(load)
            .catch((e) => appAlert("Could not cancel", e instanceof Error ? e.message : "Please try again.")),
      },
    ]);

  const renderCard = (b: StaffBooking) => (
              <Card key={b.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.site}>{b.site.name}</Text>
                  <Text style={styles.time}>{bookingTime(b)}</Text>
                </View>
                {bookingShifts(b) !== "" && <Text style={styles.muted}>{bookingShifts(b)}</Text>}
                {scope === "all" && <Text style={styles.person}>{b.userName}</Text>}
                {!!b.site.address && <Text style={styles.muted}>{b.site.address}</Text>}
                {!!b.instructions && (
                  <View style={styles.note}>
                    <Text style={styles.noteLabel}>Instructions</Text>
                    <Text style={styles.noteText}>{b.instructions}</Text>
                  </View>
                )}
                <Text style={styles.muted}>
                  {b.tasks.length > 0 ? `${b.tasks.length} task${b.tasks.length === 1 ? "" : "s"}: ${b.tasks.map((t) => t.title).join(", ")}` : "No tasks set yet"}
                </Text>
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(mapsUrl(b.site))}>
                    <Text style={styles.link}>Directions</Text>
                  </Pressable>
                  {canBook && scope === "all" && !isPastDay(b.date) && (
                    <Pressable accessibilityRole="button" onPress={() => cancel(b)}>
                      <Text style={styles.danger}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </Card>
  );

  const bookedOn = (day: string) => (bookings ?? []).filter((b) => b.date === day && b.status !== "cancelled").length;
  const busiest = Math.max(1, ...monthDays(monthStart, 1).map(bookedOn));
  const bookingTile = (day: string): DayTileData => {
    const count = bookedOn(day);
    const label = `${dayHeading(day)}, ${count === 0 ? "no bookings" : `${count} booked`}`;
    return count === 0 ? { label } : { intensity: count / busiest, badge: count, label };
  };

  return (
    <Screen title={scope === "all" ? "Schedule" : "My schedule"}>
      {canBook && (
        <View style={styles.seg}>
          {([["mine", "Mine"], ["all", "Everyone"]] as const).map(([k, label]) => (
            <Pressable key={k} style={[styles.segItem, scope === k && styles.segOn]} onPress={() => { setBookings(null); setScope(k); }} accessibilityRole="button" accessibilityState={{ selected: scope === k }}>
              <Text style={[styles.segText, scope === k && styles.segTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.seg}>
        {([["list", "List", "list-outline"], ["calendar", "Calendar", "calendar-outline"], ["map", "Map", "map-outline"]] as const).map(([k, label, icon]) => (
          <Pressable key={k} style={[styles.segItem, view === k && styles.segOn]} onPress={() => setView(k)} accessibilityRole="button" accessibilityState={{ selected: view === k }}>
            <Ionicons name={icon} size={16} color={view === k ? colors.white : colors.mutedForeground} />
            <Text style={[styles.segText, view === k && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {canBook && <Button onPress={() => router.push("/schedule-book" as never)}>Book staff</Button>}

      {!bookings && <ActivityIndicator color={colors.primary} />}
      {bookings && view !== "calendar" && groups.length === 0 && (
        <Card>
          <Text style={styles.muted}>
            {scope === "all" ? "No one is booked in the next 30 days." : "You are not booked for anything in the next 30 days."}
          </Text>
        </Card>
      )}

      {bookings && groups.length > 0 && view === "map" && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {groups.map((g) => (
              <Pressable key={g.date} style={[styles.chip, activeDay === g.date && styles.chipOn]} onPress={() => setMapDay(g.date)}>
                <Text style={[styles.chipText, activeDay === g.date && styles.chipTextOn]}>
                  {parseDateKey(g.date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScheduleMap
            pins={plotted.map((p) => ({ id: p.site.id, name: p.site.name, address: p.site.address, latitude: p.site.latitude as number, longitude: p.site.longitude as number, lines: p.lines }))}
          />
          {pins.length > plotted.length && (
            <Text style={styles.muted}>Not on the map (no location set): {pins.filter((p) => p.site.latitude == null).map((p) => p.site.name).join(", ")}.</Text>
          )}
          {pins.map((p) => (
            <Pressable key={p.site.id} accessibilityRole="button" onPress={() => void Linking.openURL(mapsUrl(p.site))}>
              <Text style={styles.link}>Directions to {p.site.name}</Text>
            </Pressable>
          ))}
        </>
      )}

      {view === "calendar" && (
        <>
          <CalendarFrame
            id="schedule"
            title={monthTitle(monthStart)}
            caption="Staff bookings"
            onPrev={() => { setBookings(null); setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)); }}
            onNext={() => { setBookings(null); setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)); }}
            onToday={() => { setBookings(null); setMonthStart(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setPickedDay(dateKey(new Date())); }}
            collapsedSummary={
              <DotStrip
                month={monthStart}
                tile={(day) => (parseDateKey(day).getMonth() === monthStart.getMonth() ? bookingTile(day) : { tone: "muted" })}
                right={`${(bookings ?? []).filter((b) => b.status !== "cancelled").length} booked`}
              />
            }
          >
            <MonthTiles month={monthStart} tile={bookingTile} selected={pickedDay} onSelect={setPickedDay} />
            <CalendarLegend
              items={[
                { label: "Booked", color: heatColor(colors.card, colors.primary, 0.6) },
                { label: "Today", ring: true },
                { label: "Free" },
              ]}
            />
          </CalendarFrame>
          <Text style={styles.dayHeading}>{dayHeading(pickedDay)}</Text>
          {canBook && !isPastDay(pickedDay) && <Button onPress={() => router.push(`/schedule-book?date=${pickedDay}` as never)}>Book staff on this day</Button>}
          {isPastDay(pickedDay) && <Text style={styles.muted}>This day has passed, so it can be viewed but not changed.</Text>}
          {(bookings ?? []).filter((b) => b.date === pickedDay && b.status !== "cancelled").map(renderCard)}
          {bookings && !(bookings ?? []).some((b) => b.date === pickedDay && b.status !== "cancelled") && (
            <Text style={styles.muted}>{isPastDay(pickedDay) ? "No one was booked on this day." : "No one is booked on this day."}</Text>
          )}
        </>
      )}

      {bookings && view === "list" &&
        groups.map((g) => (
          <View key={g.date} style={styles.day}>
            <Text style={styles.dayHeading}>{dayHeading(g.date)}</Text>
            {g.items.map(renderCard)}
          </View>
        ))}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    seg: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 2, marginBottom: spacing.sm },
    segItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm, borderRadius: radius.sm },
    segOn: { backgroundColor: colors.primary },
    segText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    segTextOn: { color: colors.white },
    chips: { gap: spacing.sm, paddingVertical: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    day: { gap: spacing.sm, marginTop: spacing.sm },
    dayHeading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    card: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    site: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    time: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    person: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    note: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.muted, gap: 2 },
    noteLabel: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground },
    noteText: { fontSize: typography.small, color: colors.foreground },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    danger: { fontSize: typography.small, fontWeight: "700", color: colors.destructive },
  }),
);
