import { useEffect, useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { bookStaff, listBookablePeople, listSiteBookings, type StaffBooking } from "@/api/client";
import { addDays, dateKey, daysBetween, isPastDay } from "@/domain/schedule";
import { useCanBook, useScheduleOn } from "@/features/schedule";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Book people onto a site for one or more days, with instructions. They are told straight away. */
export default function ScheduleBookScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const on = useScheduleOn();
  const canBook = useCanBook();
  const homePath = useHomePath();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const startDay = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dateKey(new Date());
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [from, setFrom] = useState(startDay);
  const [to, setTo] = useState(startDay);
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.accessToken || !siteId) return;
    setChosen([]);
    listBookablePeople(state.accessToken, siteId).then(setPeople).catch(() => setPeople([]));
  }, [state.accessToken, siteId]);

  const dates = useMemo(() => daysBetween(from, to, weekdaysOnly), [from, to, weekdaysOnly]);
  // Who is already booked at this site on the chosen days, so the list can say so.
  const [existing, setExisting] = useState<StaffBooking[]>([]);
  useEffect(() => {
    if (!state.accessToken || !siteId || dates.length === 0) {
      setExisting([]);
      return;
    }
    let live = true;
    listSiteBookings(state.accessToken, dates[0], dates[dates.length - 1])
      .then((rows) => live && setExisting(rows.filter((r) => r.siteId === siteId && r.status !== "cancelled")))
      .catch(() => live && setExisting([]));
    return () => {
      live = false;
    };
  }, [state.accessToken, siteId, dates]);
  const bookedOn = (userId: string) => dates.filter((d) => existing.some((b) => b.userId === userId && b.date === d)).length;
  const fullyBooked = (userId: string) => dates.length > 0 && bookedOn(userId) === dates.length;
  const pickable = people.filter((p) => !fullyBooked(p.id));
  const picked = chosen.filter((id) => pickable.some((p) => p.id === id));
  const inPast = isPastDay(from);
  const timesOk = (!startTime || TIME.test(startTime)) && (!endTime || (TIME.test(endTime) && !!startTime && endTime > startTime));

  if (!on || !canBook) return <Redirect href={homePath as never} />;

  const preset = (which: "today" | "tomorrow" | "week") => {
    const first = which === "tomorrow" ? 1 : 0;
    setFrom(dateKey(addDays(new Date(), first)));
    setTo(dateKey(addDays(new Date(), which === "week" ? 6 : first)));
  };

  const submit = async () => {
    if (!state.accessToken) return;
    setBusy(true);
    try {
      const result = await bookStaff(state.accessToken, {
        siteId,
        userIds: picked,
        dates,
        startTime: startTime || null,
        endTime: endTime || null,
        instructions,
      });
      const told = new Set(result.created.map((c) => c.userId)).size;
      appAlert(
        "Booked",
        `${result.created.length} booking${result.created.length === 1 ? "" : "s"} made and ${told} ${told === 1 ? "person" : "people"} told.` +
          (result.skipped.length ? ` ${result.skipped.length} already booked, left as they were.` : ""),
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      appAlert("Could not book", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Book staff">
      <Card style={styles.card}>
        <Text style={styles.heading}>Where?</Text>
        {sites.length > 1 ? (
          <View style={styles.chips}>
            {sites.map((s) => (
              <Pressable key={s.id} style={[styles.chip, siteId === s.id && styles.chipOn]} onPress={() => setSiteId(s.id)}>
                <Text style={[styles.chipText, siteId === s.id && styles.chipTextOn]}>{s.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>{sites[0]?.name}</Text>
        )}

        <Text style={styles.heading}>Who? ({picked.length} chosen)</Text>
        {pickable.length > 1 && (
          <Pressable onPress={() => setChosen(picked.length === pickable.length ? [] : pickable.map((p) => p.id))}>
            <Text style={styles.link}>{picked.length === pickable.length ? "Untick everyone" : "Tick everyone"}</Text>
          </Pressable>
        )}
        {people.map((p) => {
          const full = fullyBooked(p.id);
          const some = bookedOn(p.id);
          const on = full || chosen.includes(p.id);
          return (
            <Pressable
              key={p.id}
              style={[styles.person, full && styles.personFull]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: full }}
              disabled={full}
              onPress={() => setChosen((ids) => (on ? ids.filter((i) => i !== p.id) : [...ids, p.id]))}
            >
              <View style={[styles.box, on && styles.boxOn, full && styles.boxFull]}>{on && <Ionicons name="checkmark" size={14} color={colors.white} />}</View>
              <Text style={[styles.personName, full && styles.muted]}>{p.name}</Text>
              <Text style={full ? styles.badge : styles.muted}>
                {full ? (dates.length === 1 ? "Already booked" : "Booked on all days") : some > 0 ? `Booked ${some} of ${dates.length} days` : p.role.replace(/_/g, " ")}
              </Text>
            </Pressable>
          );
        })}
        {people.length === 0 && <Text style={styles.muted}>No one is assigned to this site.</Text>}

        <Text style={styles.heading}>When?</Text>
        <View style={styles.chips}>
          {([["Today", "today"], ["Tomorrow", "tomorrow"], ["Next 7 days", "week"]] as const).map(([label, which]) => (
            <Pressable key={label} style={styles.chip} onPress={() => preset(which)}>
              <Text style={styles.chipText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.pair}>
          <TextInput style={[styles.input, styles.flex]} value={from} onChangeText={(v) => { setFrom(v); if (to < v) setTo(v); }} placeholder="From 2026-11-03" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="From" />
          <TextInput style={[styles.input, styles.flex]} value={to} onChangeText={setTo} placeholder="To 2026-11-05" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="To" />
        </View>
        {from !== to && (
          <Pressable style={styles.person} accessibilityRole="checkbox" accessibilityState={{ checked: weekdaysOnly }} onPress={() => setWeekdaysOnly((w) => !w)}>
            <View style={[styles.box, weekdaysOnly && styles.boxOn]}>{weekdaysOnly && <Ionicons name="checkmark" size={14} color={colors.white} />}</View>
            <Text style={styles.personName}>Weekdays only</Text>
          </Pressable>
        )}
        <View style={styles.pair}>
          <TextInput style={[styles.input, styles.flex]} value={startTime} onChangeText={setStartTime} placeholder="Start 07:00" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="Start time" />
          <TextInput style={[styles.input, styles.flex]} value={endTime} onChangeText={setEndTime} placeholder="End 15:00" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" accessibilityLabel="End time" />
        </View>
        {inPast && <Text style={styles.error}>Days that have passed cannot be booked. Choose today or a later day.</Text>}
        {!timesOk && <Text style={styles.error}>Times look like 07:30, and the end must be after the start.</Text>}

        <Text style={styles.heading}>Instructions</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={instructions}
          onChangeText={setInstructions}
          multiline
          placeholder="Where to report, what to bring, who to ask for"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.muted}>
          {picked.length} {picked.length === 1 ? "person" : "people"} × {dates.length} {dates.length === 1 ? "day" : "days"}. Each person is told by notification and email.
        </Text>
      </Card>
      <Button disabled={busy || !siteId || picked.length === 0 || dates.length === 0 || !timesOk || inPast} onPress={() => void submit()}>
        Book and notify
      </Button>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    heading: { fontSize: typography.body, fontWeight: "800", color: colors.foreground, marginTop: spacing.xs },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    person: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
    personName: { flex: 1, fontSize: typography.body, color: colors.foreground },
    personFull: { opacity: 0.8 },
    boxFull: { opacity: 0.6 },
    badge: { fontSize: typography.tiny, fontWeight: "700", color: colors.primary },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    pair: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: typography.body },
    multiline: { minHeight: 80, textAlignVertical: "top" },
  }),
);
