import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { SelectField } from "@/components/SelectField";
import {
  addHoliday,
  getSiteOperationsConflicts,
  listHolidays,
  removeHoliday,
  saveSiteOperations,
  seedHolidays,
  type Holiday,
  type OrgOperations,
  type SiteOperationsPayload,
} from "@/api/client";
import { siteOperationsPayload, typedDay } from "@/domain/operatingCalendar";
import { useSmartClean } from "@/features/store";
import type { Site } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

/** The organisation's public holiday calendar. It belongs to the organisation, not to Leave: sites can close on these
 * days, schedules and alerts skip them, leave does not count them. `readOnly` is a site's (or non-admin's) view of it. */
export function PublicHolidaysSetup({
  readOnly = false,
  onManage,
  site,
  org,
}: {
  readOnly?: boolean;
  onManage?: () => void;
  /** The site being edited: it follows the organisation's rule or has its own, can stay open on a holiday, and keeps its own. */
  site?: Site;
  org?: OrgOperations | null;
}) {
  const { state, refreshBackendData } = useSmartClean();
  const token = state.accessToken;
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Holiday[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listHolidays(token, year)
      .then(setRows)
      .catch((e) => appAlert("Could not load holidays", e instanceof Error ? e.message : "Please try again."));
  }, [token, year]);
  useEffect(load, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      load();
    } catch (e) {
      appAlert("Could not save", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  // A site saves its own calendar, with the same check for bookings that would land on a newly shut day.
  const RULES = ["Follow the organisation", "Close on public holidays", "Stay open on public holidays"] as const;
  const rule = !site || !site.calendarOverride?.closedOnPublicHolidays ? 0 : site.closedOnPublicHolidays ? 1 : 2;
  const closesOnHolidays = site ? (site.closedOnPublicHolidays ?? false) : true;
  const openHere = site?.openDates ?? [];
  const ownHolidays = (site?.ownClosures ?? []).filter((c) => c.kind === "holiday");
  const today = new Date().toISOString().slice(0, 10);
  const [ownDate, setOwnDate] = useState("");
  const [ownName, setOwnName] = useState("");
  async function commit(patch: Partial<SiteOperationsPayload>, done?: () => void) {
    if (!token || !site) return;
    const payload = siteOperationsPayload(site, patch);
    const save = async (cancel: boolean) => {
      setBusy(true);
      try {
        await saveSiteOperations(token, site.id, { ...payload, cancelConflictingBookings: cancel });
        await refreshBackendData();
        done?.();
      } catch (e) {
        appAlert("Could not save", e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    };
    setBusy(true);
    try {
      const clash = await getSiteOperationsConflicts(token, site.id, payload);
      setBusy(false);
      if (clash.total > 0) {
        appAlert(
          `${clash.total} upcoming ${clash.total === 1 ? "booking falls" : "bookings fall"} on closed days`,
          "Saving cancels them and tells each person. Nothing is changed if you go back.",
          [
            { text: "Go back", style: "cancel" },
            { text: "Cancel bookings and save", style: "destructive", onPress: () => save(true) },
          ],
        );
        return;
      }
      await save(false);
    } catch (e) {
      setBusy(false);
      appAlert("Could not save", e instanceof Error ? e.message : "Something went wrong");
    }
  }
  return (
    <Card style={styles.section}>
      <View style={styles.head}>
        <Ionicons name="flag-outline" size={18} color={colors.primary} />
        <Text style={styles.title}>Public holidays</Text>
      </View>
      <Text style={styles.muted}>
        {readOnly
          ? "Set for the whole organisation. A site can close on these days under Operating days and closures."
          : "Set once for the organisation. Sites can close on these days, leave does not count them, and pay runs can use them."}
      </Text>
      {site && (
        <>
          <SelectField
            label={`What ${site.name} does on public holidays`}
            value={RULES[rule]}
            options={RULES}
            searchable={false}
            disabled={busy}
            onChange={(label) => {
              const next = RULES.indexOf(label as (typeof RULES)[number]);
              void commit({ closedOnPublicHolidays: next === 0 ? null : next === 1 });
            }}
          />
          <Text style={styles.muted}>
            {rule === 0
              ? `Follows the organisation, which ${org?.closedOnPublicHolidays ? "closes" : "stays open"} on public holidays.`
              : rule === 1
                ? "Closed on every public holiday below, unless you open one."
                : "Open on public holidays. Nothing below closes this site."}
          </Text>
        </>
      )}
      {readOnly && onManage && (
        <Button variant="outline" onPress={onManage}>
          Manage holidays for the organisation
        </Button>
      )}
      <View style={styles.yearRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous year" hitSlop={8} onPress={() => setYear((y) => y - 1)}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next year" hitSlop={8} onPress={() => setYear((y) => y + 1)}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      {!site && !readOnly && (
        <Button variant="outline" disabled={busy} onPress={() => token && void run(() => seedHolidays(token, year))}>
          Add South African holidays
        </Button>
      )}
      {rows.length === 0 && <Text style={styles.muted}>No holidays for {year} yet.</Text>}
      {rows.map((h) => (
        <View key={h.id} style={styles.item}>
          <View style={styles.copy}>
            <Text style={styles.strong}>{h.name}</Text>
            <Text style={styles.muted}>{dayText(h.date)}</Text>
          </View>
          {site && (
            <View style={styles.openCol}>
              <Text style={styles.muted}>{openHere.includes(h.date) || !closesOnHolidays ? "Open here" : "Closed here"}</Text>
              <Switch
                value={openHere.includes(h.date) || !closesOnHolidays}
                disabled={busy || h.date < today || !closesOnHolidays}
                accessibilityLabel={`${site.name} open on ${h.name}`}
                onValueChange={(on) =>
                  void commit({ openDates: on ? [...new Set([...openHere, h.date])].sort() : openHere.filter((d) => d !== h.date) })
                }
              />
            </View>
          )}
          {!site && !readOnly && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${h.name}`}
              style={styles.remove}
              onPress={() =>
                appAlert(`Remove ${h.name}?`, undefined, [
                  { text: "Keep", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => (token ? run(() => removeHoliday(token, h.id)) : undefined) },
                ])
              }
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
            </Pressable>
          )}
        </View>
      ))}
      {site && (
        <>
          <Text style={styles.strong}>Only at {site.name}</Text>
          <Text style={styles.muted}>A day this site closes that is not a public holiday, such as a local event.</Text>
          {ownHolidays.map((c, i) => (
            <View key={`${c.startDate}-${i}`} style={styles.item}>
              <View style={styles.copy}>
                <Text style={styles.strong}>{c.reason || "Site holiday"}</Text>
                <Text style={styles.muted}>
                  {dayText(c.startDate)}
                  {c.endDate !== c.startDate ? ` to ${dayText(c.endDate)}` : ""}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.reason || "site holiday"}`}
                style={styles.remove}
                disabled={busy}
                onPress={() => void commit({ closures: (site.ownClosures ?? []).filter((x) => x !== ownHolidays[i]) })}
              >
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              </Pressable>
            </View>
          ))}
          <TextInput
            style={styles.input}
            value={ownDate}
            onChangeText={(t) => setOwnDate(typedDay(t))}
            placeholder="Date 2026-12-31"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Site holiday date"
          />
          <TextInput
            style={styles.input}
            value={ownName}
            onChangeText={setOwnName}
            placeholder="Name, e.g. Local festival"
            placeholderTextColor={colors.mutedForeground}
            maxLength={120}
            accessibilityLabel="Site holiday name"
          />
          <Button
            variant="outline"
            disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(ownDate) || ownDate < today || !ownName.trim()}
            onPress={() =>
              void commit(
                { closures: [...(site.ownClosures ?? []), { startDate: ownDate, endDate: ownDate, reason: ownName.trim(), kind: "holiday" }] },
                () => {
                  setOwnDate("");
                  setOwnName("");
                },
              )
            }
          >
            Add site holiday
          </Button>
        </>
      )}
      {!site && !readOnly && (
        <>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={(t) => setDate(typedDay(t))}
            placeholder="Date 2026-12-31"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Holiday date"
          />
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name, e.g. Company day"
            placeholderTextColor={colors.mutedForeground}
            maxLength={120}
            accessibilityLabel="Holiday name"
          />
          <Button
            variant="outline"
            disabled={busy || !validDate || !name.trim()}
            onPress={() =>
              token &&
              void run(async () => {
                await addHoliday(token, date, name.trim());
                setDate("");
                setName("");
              })
            }
          >
            Add holiday
          </Button>
        </>
      )}
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { padding: spacing.lg, gap: spacing.md },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    strong: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    copy: { flex: 1, gap: 2 },
    yearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    year: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    item: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    openCol: { alignItems: "flex-end", gap: 2 },
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
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
