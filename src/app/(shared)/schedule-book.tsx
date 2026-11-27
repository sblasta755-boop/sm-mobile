import { fuzzyFilter } from "@/domain/fuzzySearch";
import { useEffect, useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import {
  listBookablePeople,
  listSiteBookings,
  listSiteShifts,
  type StaffBooking,
} from "@/api/client";
import { ShiftSetup } from "@/components/ShiftSetup";
import { MonthTiles, monthTitle } from "@/components/MonthCalendar";
import type { StockShift } from "@/types/smartclean";
import { addDays, bookingTime, dateKey, daysBetween, isPastDay } from "@/domain/schedule";
import { hoursLabel, updateEntry } from "@/domain/rosterDraft";
import { markDraft } from "@/features/rosterDraftStore";
import {
  actionFor,
  buttonLabel,
  changePatch,
  splitChosen,
  summaryLine,
} from "@/domain/bookingBulk";
import { useCanBook, useScheduleOn } from "@/features/schedule";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { useClosedDays } from "@/features/useClosedDays";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutes = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
/** First start to last end of the picked shifts, running past midnight when the last one does. */
function shiftSpan(
  chosen: StockShift[],
): { start: string; end: string } | null {
  if (chosen.length === 0) return null;
  const first = chosen.reduce((a, b) =>
    minutes(b.startTime) < minutes(a.startTime) ? b : a,
  );
  const offset = (s: StockShift) =>
    (minutes(s.startTime) - minutes(first.startTime) + 1440) % 1440;
  const last = chosen.reduce((a, b) => (offset(b) > offset(a) ? b : a));
  return { start: first.startTime, end: last.endTime };
}

/** Book people onto a site for one or more days, with instructions. Nothing is sent until you press Send schedules. */
export default function ScheduleBookScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const on = useScheduleOn();
  const canBook = useCanBook();
  const homePath = useHomePath();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const startDay =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : dateKey(new Date());
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [people, setPeople] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [from, setFrom] = useState(startDay);
  const [to, setTo] = useState(startDay);
  // The same three choices as a recurring task: every day, weekdays, or specific dates.
  const [pattern, setPattern] = useState<"daily" | "weekdays" | "dates">(
    "daily",
  );
  const [pickedDays, setPickedDays] = useState<string[]>([]);
  const [calMonth, setCalMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  // The shifts picked (several for a double shift), or custom hours for a half day.
  const [shiftIds, setShiftIds] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [shifts, setShifts] = useState<StockShift[]>([]);
  const [shiftsVersion, setShiftsVersion] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [busy] = useState(false);
  // Three steps: who, when, then the shift and details with a recap.
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!state.accessToken || !siteId) return;
    setChosen([]);
    listBookablePeople(state.accessToken, siteId)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [state.accessToken, siteId]);

  useEffect(() => {
    if (!state.accessToken || !siteId) return;
    let live = true;
    setShiftIds([]);
    setCustom(false);
    setStartTime("");
    setEndTime("");
    listSiteShifts(state.accessToken, siteId)
      .then((next) => live && setShifts(next))
      .catch(() => live && setShifts([]));
    return () => {
      live = false;
    };
  }, [state.accessToken, siteId, shiftsVersion]);
  const chosenShifts = shifts.filter((s) => shiftIds.includes(s.id));
  const span = shiftSpan(chosenShifts);

  // Days the site is shut are never booked: the calendar greys them and they are left out here too.
  const spanFirst = pattern === "dates" ? ([...pickedDays].sort()[0] ?? from) : from;
  const spanLast = pattern === "dates" ? ([...pickedDays].sort().pop() ?? to) : to;
  const validSpan = !!siteId && /^\d{4}-\d{2}-\d{2}$/.test(spanFirst) && /^\d{4}-\d{2}-\d{2}$/.test(spanLast);
  const shutLimit = validSpan ? dateKey(addDays(new Date(`${spanFirst}T00:00:00`), 120)) : "";
  const shutDays = useClosedDays(
    validSpan ? spanFirst : undefined,
    validSpan ? (spanLast < shutLimit ? spanLast : shutLimit) : undefined,
    siteId,
  );
  const closedOn = (day: string) => shutDays.forSite(siteId, day);
  const wanted = useMemo(
    () =>
      pattern === "dates"
        ? [...pickedDays].sort()
        : daysBetween(from, to, pattern === "weekdays"),
    [from, to, pattern, pickedDays],
  );
  const leftOut = wanted.filter((d) => shutDays.forSite(siteId, d));
  const dates = useMemo(
    () => wanted.filter((d) => !shutDays.forSite(siteId, d)).slice(0, 31),
    [wanted, shutDays, siteId],
  );
  // Who is already booked at this site on the chosen days, so the list can say so.
  const [existing, setExisting] = useState<StaffBooking[]>([]);
  useEffect(() => {
    if (!state.accessToken || !siteId || dates.length === 0) {
      setExisting([]);
      return;
    }
    let live = true;
    listSiteBookings(state.accessToken, dates[0], dates[dates.length - 1])
      .then(
        (rows) =>
          live &&
          setExisting(
            rows.filter((r) => r.siteId === siteId && r.status !== "cancelled"),
          ),
      )
      .catch(() => live && setExisting([]));
    return () => {
      live = false;
    };
  }, [state.accessToken, siteId, dates]);
  const bookedOn = (userId: string) =>
    dates.filter((d) =>
      existing.some((b) => b.userId === userId && b.date === d),
    ).length;
  const fullyBooked = (userId: string) =>
    dates.length > 0 && bookedOn(userId) === dates.length;
  // Booked people can be ticked too: their bookings are changed together, instead of one by one.
  const picked = chosen.filter((id) => people.some((p) => p.id === id));
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    return fuzzyFilter(people, query, (p) => [p.name, p.role]);
  }, [people, query]);
  const split = useMemo(
    () =>
      splitChosen(
        picked,
        dates,
        existing.map((b) => ({ userId: b.userId, date: b.date })),
      ),
    [picked, dates, existing],
  );
  // The hours as the server wants them, and what a change would send: only what was set.
  const hoursBody = {
    shiftIds: custom ? [] : shiftIds,
    startTime: custom || shifts.length === 0 ? startTime || null : null,
    endTime: custom || shifts.length === 0 ? endTime || null : null,
  };
  const hoursSet =
    custom || shifts.length === 0
      ? startTime.trim() !== ""
      : shiftIds.length > 0;
  const patch = changePatch(
    {
      custom: hoursSet && (custom || shifts.length === 0),
      shiftIds,
      startTime,
      endTime,
    },
    instructions,
    hoursBody,
  );
  const canChange = Object.keys(patch).length > 0;
  const action = actionFor(split, canChange);
  const inPast = pattern !== "dates" && isPastDay(from);
  // Step one is done when there is a site, someone chosen, and a sensible run of days.
  const canChoosePeople = !!siteId && picked.length > 0;
  const canContinue =
    !!siteId &&
    picked.length > 0 &&
    dates.length > 0 &&
    pickedDays.length <= 31 &&
    !inPast;
  const timesOk =
    !custom && shifts.length > 0
      ? true
      : (!startTime || TIME.test(startTime)) &&
        (!endTime ||
          (TIME.test(endTime) && !!startTime && endTime > startTime));

  if (!on || !canBook) return <Redirect href={homePath as never} />;

  const preset = (which: "today" | "tomorrow" | "week") => {
    const first = which === "tomorrow" ? 1 : 0;
    setFrom(dateKey(addDays(new Date(), first)));
    setTo(dateKey(addDays(new Date(), which === "week" ? 6 : first)));
  };

  const shiftNames = Object.fromEntries(shifts.map((x) => [x.id, x.name]));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const labelOf = (b: StaffBooking) => (b.shiftNames.length > 0 ? b.shiftNames.join(" + ") : bookingTime(b));

  // Adds, changes and removals are only marked; they go out, one message per person, from the bar on the schedule.
  const submit = () => {
    const hoursNow = { shiftIds: hoursBody.shiftIds ?? [], startTime: hoursBody.startTime ?? null, endTime: hoursBody.endTime ?? null };
    let adds = 0;
    let changes = 0;
    if (split.toBook > 0) {
      for (const userId of split.newPeople) {
        for (const date of dates) {
          if (existing.some((b) => b.userId === userId && b.date === date)) continue;
          markDraft(siteId, userId, date, {
            kind: "add", userId, userName: nameOf(userId), date, hours: hoursNow, instructions, label: hoursLabel(hoursNow, shiftNames),
          });
          adds += 1;
        }
      }
    }
    if (split.toChange > 0 && canChange) {
      const patched = patch.shiftIds !== undefined ? { shiftIds: patch.shiftIds, startTime: patch.startTime ?? null, endTime: patch.endTime ?? null } : undefined;
      for (const b of existing) {
        if (!picked.includes(b.userId) || !dates.includes(b.date)) continue;
        const entry = updateEntry(
          b,
          { ...(patched ? { hours: patched } : {}), ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}) },
          patched ? hoursLabel(patched, shiftNames) : labelOf(b),
        );
        if (entry) {
          markDraft(siteId, b.userId, b.date, entry);
          changes += 1;
        }
      }
    }
    const bits = [adds ? `${adds} to book` : null, changes ? `${changes} to update` : null].filter(Boolean);
    appAlert("Added to the schedule", `${bits.join(" and ") || "Nothing new to mark"}. Press Send schedules on the schedule screen when you are sure.`, [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  const cancelChosen = () => {
    const targets = existing.filter((b) => picked.includes(b.userId) && dates.includes(b.date));
    for (const b of targets) {
      markDraft(siteId, b.userId, b.date, { kind: "cancel", bookingId: b.id, userId: b.userId, userName: b.userName, date: b.date, label: labelOf(b) });
    }
    appAlert("Marked to remove", `${targets.length} ${targets.length === 1 ? "booking" : "bookings"} marked to be removed. Press Send schedules on the schedule screen to tell everyone.`, [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <Screen title="Book staff">
      {/* Where you are: three short steps. */}
      <View style={styles.steps} accessibilityLabel={`Step ${step} of 3`}>
        {(["Who", "When", "Details"] as const).map((label, index) => {
          const n = (index + 1) as 1 | 2 | 3;
          return (
            <View key={label} style={styles.stepCol}>
              <View style={[styles.stepBar, step >= n && styles.stepBarOn]} />
              <Text
                style={[styles.stepText, step === n && styles.stepTextOn]}
                numberOfLines={1}
              >
                {step > n ? "✓ " : `${n}. `}
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <Card style={styles.card}>
        {step === 1 ? (
          <>
            <Text style={styles.heading}>Where?</Text>
            {sites.length > 1 ? (
              <View style={styles.chips}>
                {sites.map((s) => (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, siteId === s.id && styles.chipOn]}
                    onPress={() => setSiteId(s.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        siteId === s.id && styles.chipTextOn,
                      ]}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>{sites[0]?.name}</Text>
            )}

            <Text style={styles.heading}>Who? ({picked.length} chosen)</Text>
            {people.length > 6 && (
              <View style={styles.search}>
                <Ionicons
                  name="search"
                  size={16}
                  color={colors.mutedForeground}
                />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by name or role"
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Search people"
                  style={styles.searchInput}
                />
              </View>
            )}
            {shown.length > 1 && (
              <Pressable
                onPress={() => {
                  const all = shown.every((p) => picked.includes(p.id));
                  setChosen((ids) =>
                    all
                      ? ids.filter((id) => !shown.some((p) => p.id === id))
                      : [...new Set([...ids, ...shown.map((p) => p.id)])],
                  );
                }}
              >
                <Text style={styles.link}>
                  {shown.every((p) => picked.includes(p.id))
                    ? "Untick everyone"
                    : query
                      ? "Tick everyone shown"
                      : "Tick everyone"}
                </Text>
              </Pressable>
            )}
            {shown.map((p) => {
              const full = fullyBooked(p.id);
              const some = bookedOn(p.id);
              const on = chosen.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  style={[styles.person, full && styles.personFull]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() =>
                    setChosen((ids) =>
                      on ? ids.filter((i) => i !== p.id) : [...ids, p.id],
                    )
                  }
                >
                  <View style={[styles.box, on && styles.boxOn]}>
                    {on && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={colors.white}
                      />
                    )}
                  </View>
                  <Text style={styles.personName}>{p.name}</Text>
                  <Text style={full ? styles.badge : styles.muted}>
                    {full
                      ? dates.length === 1
                        ? "Already booked"
                        : "Booked on all days"
                      : some > 0
                        ? `Booked ${some} of ${dates.length} days`
                        : p.role.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              );
            })}
            {people.length === 0 && (
              <Text style={styles.muted}>No one is assigned to this site.</Text>
            )}
            {people.length > 0 && shown.length === 0 && (
              <Text style={styles.muted}>
                No one matches &quot;{query}&quot;.
              </Text>
            )}
            <Text style={styles.muted}>
              Tick people who are already booked to change their bookings
              together. You set the shift, hours or instructions next; anything
              you leave empty stays as it is.
            </Text>
          </>
        ) : step === 2 ? (
          <>
            {/* The people from step one, so this step makes sense on its own. */}
            <View style={styles.recap}>
              <Text style={styles.recapText} numberOfLines={2}>
                {picked.length} {picked.length === 1 ? "person" : "people"} ·{" "}
                {sites.find((x) => x.id === siteId)?.name}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setStep(1)}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
            <Text style={styles.heading}>Days</Text>
            <View style={styles.chips}>
              {(
                [
                  ["Every day", "daily"],
                  ["Weekdays", "weekdays"],
                  ["Specific dates", "dates"],
                ] as const
              ).map(([label, value]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pattern === value }}
                  style={[styles.chip, pattern === value && styles.chipOn]}
                  onPress={() => {
                    // Switching to hand-picked days starts from the day already chosen.
                    if (
                      value === "dates" &&
                      pickedDays.length === 0 &&
                      !isPastDay(from) &&
                      /^\d{4}-\d{2}-\d{2}$/.test(from)
                    )
                      setPickedDays([from]);
                    setPattern(value);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      pattern === value && styles.chipTextOn,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.muted}>
              {pattern === "daily"
                ? "Each day from the start to the end date, weekends included. Use the same day twice for one day."
                : pattern === "weekdays"
                  ? "Monday to Friday between the start and end dates."
                  : "Only the days you tap."}
            </Text>
            {pattern === "dates" ? (
              <>
                <View style={styles.pair}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                    onPress={() =>
                      setCalMonth(
                        (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                      )
                    }
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={colors.foreground}
                    />
                  </Pressable>
                  <Text
                    style={[
                      styles.heading,
                      styles.flex,
                      { textAlign: "center" },
                    ]}
                  >
                    {monthTitle(calMonth)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                    onPress={() =>
                      setCalMonth(
                        (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                      )
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={colors.foreground}
                    />
                  </Pressable>
                </View>
                <MonthTiles
                  month={calMonth}
                  tile={(day) =>
                    isPastDay(day) || closedOn(day)
                      ? { tone: "muted", disabled: true, label: closedOn(day) ?? undefined }
                      : {}
                  }
                  selected={pickedDays}
                  onSelect={(day) =>
                    setPickedDays((current) =>
                      current.includes(day)
                        ? current.filter((d) => d !== day)
                        : [...current, day],
                    )
                  }
                />
                {pickedDays.some((d) => closedOn(d)) && (
                  <Text style={styles.muted}>Closed days are left out.</Text>
                )}
                <Text style={styles.muted}>
                  {pickedDays.length === 0
                    ? "Tap the days to book."
                    : `${pickedDays.length} ${pickedDays.length === 1 ? "day" : "days"} picked${pickedDays.length > 31 ? ". Book up to 31 days at a time." : "."}`}
                </Text>
              </>
            ) : (
              <>
                <View style={styles.chips}>
                  {(
                    [
                      ["Today", "today"],
                      ["Tomorrow", "tomorrow"],
                      ["Next 7 days", "week"],
                    ] as const
                  ).map(([label, which]) => (
                    <Pressable
                      key={label}
                      style={styles.chip}
                      onPress={() => preset(which)}
                    >
                      <Text style={styles.chipText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.pair}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    value={from}
                    onChangeText={(v) => {
                      setFrom(v);
                      if (to < v) setTo(v);
                    }}
                    placeholder="From 2026-11-03"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    accessibilityLabel="From"
                  />
                  <TextInput
                    style={[styles.input, styles.flex]}
                    value={to}
                    onChangeText={setTo}
                    placeholder="To 2026-11-05"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    accessibilityLabel="To"
                  />
                </View>
              </>
            )}
            {pattern !== "dates" && leftOut.length > 0 && (
              <Text style={styles.muted}>
                {leftOut.length} closed {leftOut.length === 1 ? "day is" : "days are"} left out
                {leftOut.length <= 3 ? `: ${leftOut.map((d) => `${d} (${closedOn(d)})`).join(", ")}` : ""}.
              </Text>
            )}
            {inPast && (
              <Text style={styles.error}>
                Days that have passed cannot be booked. Choose today or a later
                day.
              </Text>
            )}
          </>
        ) : (
          <>
            {/* What the first two steps chose, so this step makes sense on its own. */}
            <View style={styles.recap}>
              <Text style={styles.recapText} numberOfLines={2}>
                {picked.length} {picked.length === 1 ? "person" : "people"} ·{" "}
                {dates.length} {dates.length === 1 ? "day" : "days"} ·{" "}
                {sites.find((x) => x.id === siteId)?.name}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setStep(2)}>
                <Text style={styles.link}>Change</Text>
              </Pressable>
            </View>
            <Text style={styles.heading}>Hours</Text>
            {shifts.length > 0 ? (
              <>
                <View style={styles.chips}>
                  {shifts.map((shift) => {
                    const on = !custom && shiftIds.includes(shift.id);
                    return (
                      <Pressable
                        key={shift.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => {
                          setCustom(false);
                          setShiftIds((ids) =>
                            ids.includes(shift.id)
                              ? ids.filter((i) => i !== shift.id)
                              : [...ids, shift.id],
                          );
                        }}
                      >
                        <Text
                          style={[styles.chipText, on && styles.chipTextOn]}
                        >
                          {shift.name} {shift.startTime} to {shift.endTime}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: custom }}
                    style={[styles.chip, custom && styles.chipOn]}
                    onPress={() => {
                      setCustom((c) => !c);
                      setShiftIds([]);
                    }}
                  >
                    <Text
                      style={[styles.chipText, custom && styles.chipTextOn]}
                    >
                      Custom hours
                    </Text>
                  </Pressable>
                </View>
                {!custom && chosenShifts.length > 1 && (
                  <Text style={styles.muted}>
                    Double shift:{" "}
                    {chosenShifts.map((s) => s.name).join(" and ")}.
                  </Text>
                )}
                {!custom && span && (
                  <Text style={styles.muted}>
                    Works {span.start} to {span.end}
                    {span.end <= span.start ? " the next morning" : ""}.
                    Clock-in is checked against these hours.
                  </Text>
                )}
                {!custom && !span && (
                  <Text style={styles.muted}>
                    Pick a shift, several for a double shift, or Custom hours
                    for a half day. Leave empty for all day.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.muted}>
                Optional. Without hours the site&apos;s working hours apply. Set
                up shifts below to book onto them.
              </Text>
            )}
            {(custom || shifts.length === 0) && (
              <View style={styles.pair}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="Start 07:00"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  accessibilityLabel="Start time"
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="End 15:00"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  accessibilityLabel="End time"
                />
              </View>
            )}
            {!timesOk && (
              <Text style={styles.error}>
                Times look like 07:30, and the end must be after the start.
              </Text>
            )}

            <Text style={styles.heading}>Instructions</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={instructions}
              onChangeText={setInstructions}
              multiline
              placeholder="Where to report, what to bring, who to ask for"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.summary}>
              {summaryLine(picked.length, dates.length, split, canChange)}
            </Text>
            {split.toChange > 0 && !canChange && (
              <Text style={styles.muted}>
                To change the {split.toChange === 1 ? "booking" : "bookings"}{" "}
                already made, choose a shift or hours, or write instructions.
                {split.toBook > 0
                  ? " Until then they are left as they are."
                  : ""}
              </Text>
            )}
            {split.toChange > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={cancelChosen}
                disabled={busy}
              >
                <Text style={styles.danger}>
                  Cancel the {split.toChange} existing{" "}
                  {split.toChange === 1 ? "booking" : "bookings"} instead
                </Text>
              </Pressable>
            )}
          </>
        )}
      </Card>
      {step === 1 ? (
        <Button disabled={!canChoosePeople} onPress={() => setStep(2)}>
          Next: days
        </Button>
      ) : step === 2 ? (
        <>
          <Button disabled={!canContinue} onPress={() => setStep(3)}>
            Next: shift and details
          </Button>
          <Button variant="outline" onPress={() => setStep(1)}>
            Back
          </Button>
        </>
      ) : (
        <>
          <Button
            disabled={busy || !canContinue || action === "none" || !timesOk}
            onPress={submit}
          >
            {buttonLabel(action)}
          </Button>
          <Button variant="outline" disabled={busy} onPress={() => setStep(2)}>
            Back
          </Button>
        </>
      )}
      <View style={styles.setup}>
        <ShiftSetup
          siteId={siteId}
          onSaved={() => setShiftsVersion((v) => v + 1)}
        />
      </View>
      <View style={styles.setup}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/operations-settings" as never)}>
          <Text style={styles.link}>Operating days, closures and working hours are in Organisation and site settings</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { marginBottom: spacing.md, gap: spacing.sm },
    setup: { marginTop: spacing.lg },
    steps: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
    stepCol: { flex: 1, minWidth: 0, gap: 4 },
    stepBar: { height: 6, borderRadius: 3, backgroundColor: colors.muted },
    stepBarOn: { backgroundColor: colors.primary },
    stepText: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.mutedForeground,
    },
    stepTextOn: { color: colors.foreground },
    recap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      backgroundColor: colors.muted,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    recapText: {
      flex: 1,
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.foreground,
    },
    heading: {
      fontSize: typography.body,
      fontWeight: "800",
      color: colors.foreground,
      marginTop: spacing.xs,
    },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    link: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.primary,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    chipTextOn: { color: colors.white },
    person: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    personName: {
      flex: 1,
      fontSize: typography.body,
      color: colors.foreground,
    },
    personFull: { opacity: 0.8 },
    boxFull: { opacity: 0.6 },
    badge: {
      fontSize: typography.tiny,
      fontWeight: "700",
      color: colors.primary,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    pair: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    flex: { flex: 1, minWidth: 0 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.card,
      fontSize: typography.body,
    },
    multiline: { minHeight: 80, textAlignVertical: "top" },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      backgroundColor: colors.card,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.body,
      color: colors.foreground,
      paddingVertical: spacing.xs,
    },
    summary: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.foreground,
    },
    danger: {
      fontSize: typography.small,
      fontWeight: "700",
      color: colors.destructive,
      paddingVertical: spacing.xs,
    },
  }),
);
