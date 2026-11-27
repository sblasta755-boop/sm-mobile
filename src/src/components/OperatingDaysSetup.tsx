import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { InheritRow } from "@/components/InheritRow";
import { SelectField } from "@/components/SelectField";
import { appAlert } from "@/components/Dialog";
import { CalendarLegend, MonthTiles, monthTitle, type DayTileData } from "@/components/MonthCalendar";
import {
  getOrgOperationsConflicts,
  getSiteOperationsConflicts,
  listHolidays,
  saveOrgOperations,
  saveSiteOperations,
  type OrgOperations,
} from "@/api/client";
import { dayKey } from "@/domain/calendarGrid";
import {
  ALL_DAYS,
  CLOSURE_KINDS,
  WEEKDAYS,
  closedReason,
  closureProblem,
  operatingDaysLabel,
  siteOperatingDays,
  siteOperationsPayload,
  toggleDate,
  typedDay,
} from "@/domain/operatingCalendar";
import { useSmartClean } from "@/features/store";
import type { Site, SiteClosure, SiteClosureKind } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * The weekdays a place operates, whether it closes on public holidays, and the dates it is shut. At the organisation
 * level these are the defaults every site follows (plus company-wide closures); at a site the weekly pattern and the
 * holiday rule each follow the organisation or are the site's own, site closures add to the organisation's, and single
 * dates can be opened or closed by hand on the calendar. Nobody is booked or flagged late on a closed day.
 */
export function OperatingDaysSetup({
  site,
  org,
  canEditOrg,
  onOrgSaved,
}: {
  /** The site being edited, or undefined for the organisation default. */
  site?: Site;
  org: OrgOperations | null;
  canEditOrg: boolean;
  onOrgSaved: (next: OrgOperations) => void;
}) {
  const { state, refreshBackendData } = useSmartClean();
  const token = state.accessToken;
  const orgDays = org?.operatingDays ?? ALL_DAYS;
  const orgHolidays = org?.closedOnPublicHolidays ?? false;
  const orgClosures = useMemo<SiteClosure[]>(() => (org?.closures ?? []).map((c) => ({ ...c, scope: "organisation" as const })), [org?.closures]);

  const startState = () => ({
    days: site ? siteOperatingDays(site) : orgDays,
    inheritDays: site ? !site.calendarOverride?.operatingDays : false,
    onHolidays: site ? (site.closedOnPublicHolidays ?? false) : orgHolidays,
    inheritHolidays: site ? !site.calendarOverride?.closedOnPublicHolidays : false,
    closures: site ? (site.ownClosures ?? []) : (org?.closures ?? []),
    openDates: site?.openDates ?? [],
  });
  const initial = startState();
  const [days, setDays] = useState<number[]>(initial.days);
  const [inheritDays, setInheritDays] = useState(initial.inheritDays);
  const [onHolidays, setOnHolidays] = useState(initial.onHolidays);
  const [inheritHolidays, setInheritHolidays] = useState(initial.inheritHolidays);
  const [closures, setClosures] = useState<SiteClosure[]>(initial.closures);
  const [openDates, setOpenDates] = useState<string[]>(initial.openDates);
  const [draft, setDraft] = useState<SiteClosure>({ startDate: "", endDate: "", reason: "", kind: "maintenance" });
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [holidayDates, setHolidayDates] = useState<Record<number, string[]>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = startState();
    setDays(next.days);
    setInheritDays(next.inheritDays);
    setOnHolidays(next.onHolidays);
    setInheritHolidays(next.inheritHolidays);
    setClosures(next.closures);
    setOpenDates(next.openDates);
    // Follow the scope picked and what the server last returned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    site?.id,
    site?.operatingDays,
    site?.closedOnPublicHolidays,
    site?.ownClosures,
    site?.openDates,
    site?.calendarOverride?.operatingDays,
    site?.calendarOverride?.closedOnPublicHolidays,
    org?.operatingDays,
    org?.closedOnPublicHolidays,
    org?.closures,
  ]);

  const readOnly = !site && !canEditOrg;
  const effDays = site && inheritDays ? orgDays : days;
  const effHolidays = site && inheritHolidays ? orgHolidays : onHolidays;
  const effClosures = useMemo(() => (site ? [...orgClosures, ...closures] : closures), [site, orgClosures, closures]);
  const effective = useMemo(
    () => ({ operatingDays: effDays, closedOnPublicHolidays: effHolidays, closures: effClosures, openDates }),
    [effDays, effHolidays, effClosures, openDates],
  );
  const today = dayKey(new Date());

  // Public holidays only matter when the place closes on them. Read for the years the month grid touches; if they
  // cannot be read the calendar leaves them out (the server still applies them).
  useEffect(() => {
    if (!effHolidays || !token) return;
    const years = new Set([month.getFullYear() - (month.getMonth() === 0 ? 1 : 0), month.getFullYear() + (month.getMonth() === 11 ? 1 : 0)]);
    for (const year of years) {
      if (holidayDates[year]) continue;
      listHolidays(token, year)
        .then((rows) => setHolidayDates((all) => ({ ...all, [year]: rows.map((h) => h.date) })))
        .catch(() => setHolidayDates((all) => ({ ...all, [year]: [] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effHolidays, token, month]);
  const holidaySet = useMemo(() => new Set(Object.values(holidayDates).flat()), [holidayDates]);

  const tapDate = (day: string) => {
    if (readOnly) return;
    // A day an organisation closure covers is opened (or put back) by hand at a site; it cannot be removed there.
    if (site && orgClosures.some((c) => c.startDate <= day && day <= c.endDate)) {
      setOpenDates((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()));
      return;
    }
    const next = toggleDate(effective, day, holidaySet, !!site);
    if (!site && next.openDates.length === openDates.length && next.closures.length === closures.length) {
      appAlert("Closed by the weekly pattern", "Change the weekly pattern to open that day.");
      return;
    }
    setOpenDates(next.openDates);
    setClosures(next.closures.filter((c) => c.scope !== "organisation"));
  };
  const dayTile = (day: string): DayTileData => {
    const reason = closedReason(effective, day, holidaySet);
    const byHand = openDates.includes(day);
    const oneDay = closures.some((c) => c.startDate === day && c.endDate === day);
    if (day < today) return { tone: "muted", disabled: true, label: `${day}: ${reason ?? "open"} (past)` };
    return {
      tone: reason ? "bad" : "good",
      badge: byHand ? "Open" : oneDay ? "Shut" : undefined,
      label: `${day}: ${reason ?? "open"}. ${byHand || oneDay ? "Set by hand. Tap to undo" : `Tap to ${reason ? "open" : "close"} this day`}`,
    };
  };

  const toggleDay = (day: number) => setDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()));
  const addClosure = () => {
    const problem = closureProblem(draft);
    if (problem) {
      appAlert("Check the dates", problem);
      return;
    }
    setClosures((cur) => [...cur, { ...draft, reason: draft.reason.trim() }].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    setDraft({ startDate: "", endDate: "", reason: "", kind: draft.kind });
  };

  const save = async () => {
    if (!token) return;
    if (effDays.length === 0) {
      appAlert("Choose a day", "At least one day has to be an operating day.");
      return;
    }
    const sitePayload = site
      ? siteOperationsPayload(site, {
          operatingDays: inheritDays ? null : days,
          closedOnPublicHolidays: inheritHolidays ? null : onHolidays,
          closures,
          openDates,
        })
      : null;
    const orgPayload: OrgOperations = { workingHours: org?.workingHours ?? null, operatingDays: days, closedOnPublicHolidays: onHolidays, closures };
    const commit = async (cancel: boolean) => {
      setBusy(true);
      try {
        if (site) await saveSiteOperations(token, site.id, { ...sitePayload!, cancelConflictingBookings: cancel });
        else onOrgSaved(await saveOrgOperations(token, { ...orgPayload, cancelConflictingBookings: cancel }));
        await refreshBackendData();
        appAlert("Operating days saved", undefined, undefined, "success");
      } catch (error) {
        appAlert("Could not save", error instanceof Error ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    };
    setBusy(true);
    try {
      // Bookings already made for days this would shut: ask before they are cancelled and the people told.
      const clash = site ? await getSiteOperationsConflicts(token, site.id, sitePayload!) : await getOrgOperationsConflicts(token, orgPayload);
      setBusy(false);
      if (clash.total > 0) {
        appAlert(
          `${clash.total} upcoming ${clash.total === 1 ? "booking falls" : "bookings fall"} on closed days`,
          site
            ? "Saving cancels them and tells each person. Nothing is changed if you go back."
            : "Saving cancels them at every site that follows this default and tells each person. Nothing is changed if you go back.",
          [
            { text: "Go back", style: "cancel" },
            { text: "Cancel bookings and save", style: "destructive", onPress: () => commit(true) },
          ],
        );
        return;
      }
      await commit(false);
    } catch (error) {
      setBusy(false);
      appAlert("Could not save", error instanceof Error ? error.message : "Something went wrong");
    }
  };

  const kindLabel = (kind: SiteClosureKind) => CLOSURE_KINDS.find((k) => k.value === kind)?.label ?? "Other";
  const sortedClosures = [...effClosures].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lockedDays = (!!site && inheritDays) || readOnly;

  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Operating days and closures</Text>
      </View>
      <Text style={styles.muted}>
        On a closed day nobody is booked or flagged for not clocking in, and recurring tasks and hourly rounds are not created.
      </Text>

      <Text style={styles.label}>Weekly pattern</Text>
      {site && <InheritRow inherit={inheritDays} onChange={setInheritDays} current={operatingDaysLabel(orgDays)} />}
      <View style={styles.dayRow}>
        {WEEKDAYS.map((day) => {
          const on = effDays.includes(day.value);
          return (
            <Pressable
              key={day.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: lockedDays }}
              accessibilityLabel={day.long}
              disabled={lockedDays}
              onPress={() => toggleDay(day.value)}
              style={[styles.dayChip, on && styles.dayChipOn, lockedDays && styles.dim]}
            >
              <Text style={[styles.dayText, on && styles.dayTextOn]}>{day.short}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.muted}>{operatingDaysLabel(effDays.length ? effDays : ALL_DAYS)}</Text>
      {!lockedDays && (
        <View style={styles.actions}>
          <Button variant="outline" fullWidth={false} onPress={() => setDays([0, 1, 2, 3, 4])}>
            Weekdays only
          </Button>
          <Button variant="outline" fullWidth={false} onPress={() => setDays(ALL_DAYS)}>
            Every day
          </Button>
        </View>
      )}

      {site && (
        <InheritRow
          inherit={inheritHolidays}
          onChange={setInheritHolidays}
          label="Public holiday rule: use the organisation default"
          current={orgHolidays ? "closed on public holidays" : "open on public holidays"}
        />
      )}
      <View style={styles.switchRow}>
        <View style={styles.copy}>
          <Text style={styles.label}>Closed on public holidays</Text>
          <Text style={styles.muted}>Uses the public holiday calendar kept for the organisation. Leave off for sites that trade on holidays.</Text>
        </View>
        <Switch
          value={effHolidays}
          onValueChange={setOnHolidays}
          disabled={(!!site && inheritHolidays) || readOnly}
          trackColor={{ true: colors.primary, false: colors.neutral }}
          accessibilityLabel="Closed on public holidays"
        />
      </View>

      <Text style={styles.label}>Calendar</Text>
      <Text style={styles.muted}>
        {readOnly ? "How the default plays out." : "Tap a date to open or close just that day."} Dates set by hand win over the weekly pattern,
        holidays and closures.
      </Text>
      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      <MonthTiles month={month} tile={dayTile} today={today} onSelect={readOnly ? undefined : tapDate} />
      <CalendarLegend items={[{ label: "Open", color: colors.success }, { label: "Closed", color: colors.destructive }, { label: "Today", ring: true }]} />

      <Text style={styles.label}>{site ? "Closures" : "Company-wide closures"}</Text>
      {sortedClosures.length === 0 && <Text style={styles.muted}>No closures set.</Text>}
      {sortedClosures.map((closure, index) => {
        const inherited = closure.scope === "organisation";
        return (
          <View key={closure.id ?? `${closure.startDate}-${index}`} style={styles.closureRow}>
            <View style={styles.copy}>
              <Text style={styles.label}>
                {closure.startDate === closure.endDate ? closure.startDate : `${closure.startDate} to ${closure.endDate}`}
              </Text>
              <Text style={styles.muted}>
                {kindLabel(closure.kind)}
                {closure.reason ? `: ${closure.reason}` : ""}
                {inherited ? " (organisation)" : ""}
              </Text>
            </View>
            {!inherited && !readOnly && (
              <Pressable accessibilityRole="button" accessibilityLabel="Remove closure" onPress={() => setClosures((cur) => cur.filter((item) => item !== closure))} style={styles.remove}>
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              </Pressable>
            )}
          </View>
        );
      })}

      {!readOnly && (
        <>
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.input, styles.date]}
              value={draft.startDate}
              onChangeText={(t) => {
                const startDate = typedDay(t);
                setDraft({ ...draft, startDate, endDate: draft.endDate || (startDate.length === 10 ? startDate : "") });
              }}
              placeholder="From 2026-12-24"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Closed from"
            />
            <TextInput
              style={[styles.input, styles.date]}
              value={draft.endDate}
              onChangeText={(t) => setDraft({ ...draft, endDate: typedDay(t) })}
              placeholder="Until 2026-12-26"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={10}
              accessibilityLabel="Closed until, inclusive"
            />
          </View>
          <SelectField
            label="Type"
            value={kindLabel(draft.kind)}
            options={CLOSURE_KINDS.map((k) => k.label)}
            onChange={(label) => setDraft({ ...draft, kind: CLOSURE_KINDS.find((k) => k.label === label)?.value ?? "other" })}
          />
          <TextInput
            style={styles.input}
            value={draft.reason}
            onChangeText={(reason) => setDraft({ ...draft, reason })}
            placeholder="Reason (optional), such as New floors"
            placeholderTextColor={colors.mutedForeground}
            maxLength={160}
          />
          <View style={styles.actions}>
            <Button variant="outline" fullWidth={false} onPress={addClosure}>
              Add closure
            </Button>
            <Button fullWidth={false} onPress={save} disabled={busy}>
              Save operating days
            </Button>
          </View>
        </>
      )}
      {readOnly && <Text style={styles.muted}>Only an administrator or operations manager can change the organisation default.</Text>}
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { padding: spacing.lg, gap: spacing.md },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    label: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    copy: { flex: 1, gap: 2 },
    dim: { opacity: 0.55 },
    dayRow: { flexDirection: "row", gap: spacing.xs },
    dayChip: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
    },
    dayChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    dayText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    dayTextOn: { color: colors.primaryForeground },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    closureRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    monthTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground, textTransform: "uppercase" },
    dateRow: { flexDirection: "row", gap: spacing.sm },
    date: { flex: 1 },
    actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      color: colors.foreground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
      minHeight: 44,
    },
  }),
);
