import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { listBookablePeople, listSiteBookings, listSiteShifts, type StaffBooking } from "@/api/client";
import { markDraft, useDrafts } from "@/features/rosterDraftStore";
import {
  draftKey,
  hoursLabel,
  sameAsBooking,
  type DraftEntry,
} from "@/domain/rosterDraft";
import type { StockShift } from "@/types/smartclean";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { addDays, bookingShifts, bookingTime, dateKey, dayHeading, isPastDay, mondayOf, parseDateKey } from "@/domain/schedule";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Person = { id: string; name: string; role: string };
type Cell = { person: Person; day: string; booking: StaffBooking | null; marked: DraftEntry | null };

const WEEKDAY = (iso: string) => parseDateKey(iso).toLocaleDateString("en-ZA", { weekday: "narrow" });

/** What a booking covers, short enough for a day chip. */
const short = (b: StaffBooking) => (b.shiftNames.length > 0 ? bookingShifts(b) : bookingTime(b));

/**
 * The roster: the people at a site, each with the days of the week beside them. Tapping a day opens that
 * person's details for it (shift or hours, instructions). Those taps only mark the day: nothing is saved or sent
 * until "Send schedules", and then each person gets one notification and one email covering their whole week.
 * The same bookings as the list and calendar, laid out the other way round.
 *
 * The "Send schedules" bar sits at the top of the schedule screen, above every view.
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
  // Marked but unsent changes are held by one store shared with the other schedule screens, which also sends them.
  const drafts = useDrafts();
  const draft = drafts[siteId] ?? {};
  const siteName = sites.find((s) => s.id === siteId)?.name ?? "";
  const markCell = (userId: string, day: string, entry: DraftEntry | null) => markDraft(siteId, userId, day, entry);

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
      <Text style={styles.muted}>Mark the days for each person and set their shift and details, then press Send schedules at the top. Each person gets one message with their whole week.</Text>

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
                const marked = past ? null : (draft[draftKey(person.id, day)] ?? null);
                return (
                  <Pressable
                    key={day}
                    disabled={past && !b}
                    onPress={() => setCell({ person, day, booking: b, marked })}
                    accessibilityRole="button"
                    accessibilityLabel={`${person.name}, ${dayHeading(day)}: ${
                      marked ? (marked.kind === "cancel" ? "marked to be removed" : `${marked.label}, not sent yet`) : b ? short(b) : past ? "no booking" : "not booked. Add"
                    }`}
                    style={[
                      styles.day,
                      b && styles.dayBooked,
                      !b && !past && styles.dayFree,
                      marked && styles.dayMarked,
                      marked?.kind === "cancel" && styles.dayRemoved,
                      day === today && styles.dayToday,
                    ]}
                  >
                    <Text style={styles.dayLetter}>{WEEKDAY(day)}</Text>
                    <Text style={styles.dayNum}>{parseDateKey(day).getDate()}</Text>
                    {marked ? (
                      <>
                        <Text style={[styles.dayShift, marked.kind === "cancel" && styles.dayStruck]} numberOfLines={1}>{marked.label}</Text>
                        <Text style={styles.dayTag}>{marked.kind === "add" ? "New" : marked.kind === "update" ? "Changed" : "Removed"}</Text>
                      </>
                    ) : b ? (
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

      <CellSheet cell={cell} siteId={siteId} siteName={siteName} onClose={() => setCell(null)} onMark={markCell} />
    </View>
  );
}

/**
 * One person on one day: shift or hours and instructions. Nothing is saved here; the choice is marked on the
 * roster and goes out with the rest when the schedules are sent.
 */
function CellSheet({ cell, siteId, siteName, onClose, onMark }: { cell: Cell | null; siteId: string; siteName: string; onClose: () => void; onMark: (userId: string, day: string, entry: DraftEntry | null) => void }) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [shifts, setShifts] = useState<StockShift[]>([]);
  const [shiftIds, setShiftIds] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const booking = cell?.booking ?? null;
  const marked = cell?.marked ?? null;
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
    // What was marked wins over what the booking has, so reopening a marked day shows the marked choice.
    const m = cell.marked && cell.marked.kind !== "cancel" ? cell.marked : null;
    const h = m ? m.hours : cell.booking ? { shiftIds: cell.booking.shiftIds, startTime: cell.booking.startTime, endTime: cell.booking.endTime } : null;
    setShiftIds(h?.shiftIds ?? []);
    setCustom(!!h && h.shiftIds.length === 0 && !!h.startTime);
    setStartTime(h?.startTime ?? "");
    setEndTime(h?.endTime ?? "");
    setInstructions(m ? m.instructions : (cell.booking?.instructions ?? ""));
  }, [cell]);

  if (!cell) return null;
  const useTimes = custom || shifts.length === 0;
  const hours = {
    shiftIds: useTimes ? [] : shiftIds,
    startTime: useTimes ? startTime || null : null,
    endTime: useTimes ? endTime || null : null,
  };
  const shiftNames = Object.fromEntries(shifts.map((x) => [x.id, x.name]));
  const who = { userId: cell.person.id, userName: cell.person.name, date: cell.day };

  const mark = () => {
    if (booking) {
      // Putting back exactly what the booking has is the same as not touching it.
      if (sameAsBooking(booking, hours, instructions)) onMark(who.userId, who.date, null);
      else onMark(who.userId, who.date, { kind: "update", bookingId: booking.id, ...who, hours, instructions, label: hoursLabel(hours, shiftNames) });
    } else {
      onMark(who.userId, who.date, { kind: "add", ...who, hours, instructions, label: hoursLabel(hours, shiftNames) });
    }
    onClose();
  };
  const remove = () => {
    onMark(who.userId, who.date, booking ? { kind: "cancel", bookingId: booking.id, ...who, label: short(booking) } : null);
    onClose();
  };
  const undo = () => {
    onMark(who.userId, who.date, null);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
            <Text style={styles.sheetTitle}>
              {past ? "Booking" : booking ? "Change booking" : "Add to schedule"} · {cell.person.name}
            </Text>
            <Text style={styles.muted}>
              {dayHeading(cell.day)} at {siteName}. {past ? "This day has passed, so it is for viewing only." : "This is only marked on the roster. They are told when you send the schedules."}
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
            {!past && <Button onPress={mark}>{booking ? "Update in schedule" : "Add to schedule"}</Button>}
            {!past && marked && (
              <Button variant="outline" onPress={undo}>
                {booking ? "Undo my change" : "Clear this day"}
              </Button>
            )}
            {!past && !marked && booking && (
              <Button variant="outline" onPress={remove}>
                Remove from schedule
              </Button>
            )}
            <Button variant="ghost" onPress={onClose}>
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
    dayMarked: { borderStyle: "dashed", borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.muted },
    dayRemoved: { borderColor: colors.destructive },
    dayStruck: { textDecorationLine: "line-through", color: colors.destructive },
    dayTag: { fontSize: 8, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase" },
    bar: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
    barTitle: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
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
