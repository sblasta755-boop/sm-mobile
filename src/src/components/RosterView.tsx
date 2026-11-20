import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import {
  bookStaff,
  cancelBooking,
  changeBooking,
  listBookablePeople,
  listSiteBookings,
  listSiteShifts,
  type StaffBooking,
} from "@/api/client";
import type { StockShift } from "@/types/smartclean";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { addDays, bookingShifts, bookingTime, dateKey, dayHeading, isPastDay, mondayOf, parseDateKey } from "@/domain/schedule";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Person = { id: string; name: string; role: string };
type Cell = { person: Person; day: string; booking: StaffBooking | null };

const WEEKDAY = (iso: string) => parseDateKey(iso).toLocaleDateString("en-ZA", { weekday: "narrow" });

/** What a booking covers, short enough for a day chip. */
const short = (b: StaffBooking) => (b.shiftNames.length > 0 ? bookingShifts(b) : bookingTime(b));

/**
 * The roster: the people at a site, each with the days of the week beside them. Tapping a day opens that
 * person's details for it (shift or hours, instructions) to book, change or cancel there and then. The same
 * bookings as the list and calendar, laid out the other way round.
 */
export function RosterView() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const token = state.accessToken;
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [people, setPeople] = useState<Person[] | null>(null);
  const [bookings, setBookings] = useState<StaffBooking[] | null>(null);
  const [query, setQuery] = useState("");
  const [cell, setCell] = useState<Cell | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dateKey(addDays(weekStart, i))), [weekStart]);

  useEffect(() => {
    if (!token || !siteId) return;
    let live = true;
    setPeople(null);
    listBookablePeople(token, siteId)
      .then((rows) => live && setPeople(rows))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [token, siteId]);

  const load = useCallback(async () => {
    if (!token || !siteId) return;
    try {
      setBookings(await listSiteBookings(token, days[0], days[6], siteId));
    } catch (error) {
      appAlert("Could not load the roster", error instanceof Error ? error.message : "Please try again.");
    }
  }, [token, siteId, days]);
  useEffect(() => {
    setBookings(null);
    void load();
  }, [load]);

  const shown = useMemo(() => fuzzyFilter(people ?? [], query, (p: Person) => [p.name, p.role.replace(/_/g, " ")]), [people, query]);
  const bookingFor = (userId: string, day: string) =>
    (bookings ?? []).find((b) => b.userId === userId && b.date === day && b.status !== "cancelled") ?? null;
  const today = dateKey(new Date());

  return (
    <View style={styles.wrap}>
      {sites.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {sites.map((s) => (
            <Pressable key={s.id} style={[styles.chip, siteId === s.id && styles.chipOn]} onPress={() => setSiteId(s.id)} accessibilityRole="button" accessibilityState={{ selected: siteId === s.id }}>
              <Text style={[styles.chipText, siteId === s.id && styles.chipTextOn]}>{s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.weekRow}>
        <Pressable onPress={() => setWeekStart((w) => addDays(w, -7))} accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.weekTitle}>
          {parseDateKey(days[0]).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} to{" "}
          {parseDateKey(days[6]).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
        </Text>
        <Pressable onPress={() => setWeekStart((w) => addDays(w, 7))} accessibilityRole="button" accessibilityLabel="Next week" hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Find a person or role"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Find a person or role"
      />
      <Text style={styles.muted}>Tap a day next to a person to set their shift and details there.</Text>

      {(people === null || bookings === null) && <ActivityIndicator color={colors.primary} />}
      {people !== null && bookings !== null && shown.length === 0 && (
        <Card>
          <Text style={styles.muted}>{people.length === 0 ? "No one can be booked at this site yet." : "No one found."}</Text>
        </Card>
      )}
      {people !== null &&
        bookings !== null &&
        shown.map((person) => (
          <Card key={person.id} style={styles.person}>
            <Text style={styles.name}>{person.name}</Text>
            <Text style={styles.role}>{person.role.replace(/_/g, " ")}</Text>
            <View style={styles.days}>
              {days.map((day) => {
                const b = bookingFor(person.id, day);
                const past = isPastDay(day);
                return (
                  <Pressable
                    key={day}
                    disabled={past && !b}
                    onPress={() => setCell({ person, day, booking: b })}
                    accessibilityRole="button"
                    accessibilityLabel={`${person.name}, ${dayHeading(day)}: ${b ? short(b) : past ? "no booking" : "not booked. Book"}`}
                    style={[styles.day, b && styles.dayBooked, !b && !past && styles.dayFree, day === today && styles.dayToday]}
                  >
                    <Text style={styles.dayLetter}>{WEEKDAY(day)}</Text>
                    <Text style={styles.dayNum}>{parseDateKey(day).getDate()}</Text>
                    {b ? (
                      <Text style={styles.dayShift} numberOfLines={1}>{short(b)}</Text>
                    ) : past ? (
                      <Text style={styles.dayMuted}>-</Text>
                    ) : (
                      <Ionicons name="add" size={14} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}

      <CellSheet cell={cell} siteId={siteId} siteName={sites.find((s) => s.id === siteId)?.name ?? ""} onClose={() => setCell(null)} onChanged={() => void load()} />
    </View>
  );
}

/** One person on one day: shift or hours and instructions, then book, save or cancel. */
function CellSheet({ cell, siteId, siteName, onClose, onChanged }: { cell: Cell | null; siteId: string; siteName: string; onClose: () => void; onChanged: () => void }) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [shifts, setShifts] = useState<StockShift[]>([]);
  const [shiftIds, setShiftIds] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const booking = cell?.booking ?? null;
  const past = cell ? isPastDay(cell.day) : false;

  useEffect(() => {
    if (!cell || !token) return;
    let live = true;
    listSiteShifts(token, siteId)
      .then((rows) => live && setShifts(rows))
      .catch(() => live && setShifts([]));
    return () => {
      live = false;
    };
  }, [cell, token, siteId]);

  useEffect(() => {
    if (!cell) return;
    const b = cell.booking;
    setShiftIds(b?.shiftIds ?? []);
    setCustom(!!b && b.shiftIds.length === 0 && !!b.startTime);
    setStartTime(b?.startTime ?? "");
    setEndTime(b?.endTime ?? "");
    setInstructions(b?.instructions ?? "");
  }, [cell]);

  if (!cell) return null;
  const useTimes = custom || shifts.length === 0;
  const hours = {
    shiftIds: useTimes ? [] : shiftIds,
    startTime: useTimes ? startTime || null : null,
    endTime: useTimes ? endTime || null : null,
  };

  async function run(job: () => Promise<string>) {
    setBusy(true);
    try {
      const message = await job();
      appAlert("Done", message);
      onChanged();
      onClose();
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (!token || !cell) return "";
      if (booking) {
        await changeBooking(token, booking.id, { date: booking.date, ...hours, instructions });
        return `${cell.person.name} has been told about the change.`;
      }
      const result = await bookStaff(token, { siteId, userIds: [cell.person.id], dates: [cell.day], ...hours, instructions });
      if (result.created.length === 0) throw new Error(`${cell.person.name} could not be booked that day. They may be on approved leave.`);
      return `${cell.person.name} is booked and has been told.`;
    });

  const cancel = () =>
    appAlert("Cancel this booking?", `${cell.person.name} will be told that ${dayHeading(cell.day).toLowerCase()} at ${siteName} is cancelled.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: () =>
          void run(async () => {
            await cancelBooking(token as string, (booking as StaffBooking).id);
            return "Booking cancelled and the person told.";
          }),
      },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            <Text style={styles.sheetTitle}>
              {past ? "Booking" : booking ? "Change booking" : "Book"} · {cell.person.name}
            </Text>
            <Text style={styles.muted}>
              {dayHeading(cell.day)} at {siteName}. {past ? "This day has passed, so it is for viewing only." : "They are told when you save."}
            </Text>

            {shifts.length > 0 && (
              <View style={styles.chipsWrap}>
                {shifts.map((shift) => {
                  const on = !custom && shiftIds.includes(shift.id);
                  return (
                    <Pressable
                      key={shift.id}
                      disabled={past}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => {
                        setCustom(false);
                        setShiftIds((ids) => (ids.includes(shift.id) ? ids.filter((i) => i !== shift.id) : [...ids, shift.id]));
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {shift.name} {shift.startTime} to {shift.endTime}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  disabled={past}
                  style={[styles.chip, custom && styles.chipOn]}
                  onPress={() => {
                    setCustom(true);
                    setShiftIds([]);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: custom }}
                >
                  <Text style={[styles.chipText, custom && styles.chipTextOn]}>Custom hours</Text>
                </Pressable>
              </View>
            )}
            {useTimes && (
              <View style={styles.pair}>
                <TextInput style={[styles.input, styles.flex]} value={startTime} onChangeText={setStartTime} editable={!past} placeholder="Start 07:00" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Start time" />
                <TextInput style={[styles.input, styles.flex]} value={endTime} onChangeText={setEndTime} editable={!past} placeholder="End 15:00" placeholderTextColor={colors.mutedForeground} accessibilityLabel="End time" />
              </View>
            )}
            <TextInput
              style={[styles.input, styles.notes]}
              value={instructions}
              onChangeText={setInstructions}
              editable={!past}
              multiline
              placeholder="Instructions: where to report, what to bring, who to ask for"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Instructions"
            />
            {!past && (
              <Button loading={busy} onPress={() => void save()}>
                {booking ? "Save and notify" : "Book and notify"}
              </Button>
            )}
            {booking && !past && (
              <Button variant="outline" disabled={busy} onPress={cancel}>
                Cancel booking
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onPress={onClose}>
              Close
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { gap: spacing.sm, paddingVertical: spacing.sm },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    weekTitle: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.card },
    notes: { minHeight: 80, textAlignVertical: "top" },
    pair: { flexDirection: "row", gap: spacing.sm },
    flex: { flex: 1 },
    person: { gap: 2 },
    name: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    role: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "capitalize", marginBottom: spacing.xs },
    days: { flexDirection: "row", gap: 4 },
    day: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 1, borderRadius: radius.md, borderWidth: 1, borderColor: "transparent", paddingVertical: spacing.xs },
    dayBooked: { backgroundColor: colors.muted },
    dayFree: { borderStyle: "dashed", borderColor: colors.border },
    dayToday: { borderColor: colors.primary },
    dayLetter: { fontSize: typography.tiny, color: colors.mutedForeground, fontWeight: "700" },
    dayNum: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    dayShift: { fontSize: 9, fontWeight: "700", color: colors.primary, maxWidth: "100%" },
    dayMuted: { fontSize: typography.small, color: colors.mutedForeground },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { maxHeight: "85%", backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    sheetBody: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.sm },
    sheetTitle: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
  }),
);
