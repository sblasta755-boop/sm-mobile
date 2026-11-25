import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import { getMaintenanceMe, saveMaintenanceReminderSettings, type ReminderPriority } from "@/api/client";
import {
  DIRECTION_LABEL,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  settingsErrors,
  type Direction,
} from "@/domain/maintenanceReminders";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const DIRECTIONS: Direction[] = ["both", "to_payers", "to_handlers", "off"];
const INHERIT = "inherit";
type Form = Record<ReminderPriority, string> & { maxPerJobPerDay: string };

/**
 * How reminders work in this organisation: who may remind whom, how long to wait before reminding the same person again
 * at each priority, which priority stops people with a pop-up, and a daily limit. A site can have its own direction.
 * Administrators and operations managers only, like the web Access tab.
 */
export default function ReminderSettingsScreen() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const sites = useMemo(() => state.sites.filter((s) => s.active), [state.sites]);
  const [direction, setDirection] = useState<Direction>("both");
  const [popupFrom, setPopupFrom] = useState<ReminderPriority>("high");
  const [form, setForm] = useState<Form>({ low: "4320", normal: "1440", high: "240", urgent: "60", maxPerJobPerDay: "4" });
  const [siteDirections, setSiteDirections] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const owner = currentUser?.role === "org_admin" || currentUser?.role === "operations_manager";

  useEffect(() => {
    if (!token || !owner) return;
    getMaintenanceMe(token)
      .then((me) => {
        const r = (me.policy.reminders ?? {}) as {
          direction?: Direction;
          popupFrom?: ReminderPriority;
          maxPerJobPerDay?: number;
          cooldownMinutes?: Record<ReminderPriority, number>;
        };
        setDirection(r.direction ?? "both");
        setPopupFrom(r.popupFrom ?? "high");
        setForm({
          low: String(r.cooldownMinutes?.low ?? 4320),
          normal: String(r.cooldownMinutes?.normal ?? 1440),
          high: String(r.cooldownMinutes?.high ?? 240),
          urgent: String(r.cooldownMinutes?.urgent ?? 60),
          maxPerJobPerDay: String(r.maxPerJobPerDay ?? 4),
        });
        const own = (me.policy.reminderSites ?? {}) as Record<string, { direction: string }>;
        setSiteDirections(Object.fromEntries(Object.entries(own).map(([id, v]) => [id, v.direction])));
      })
      .catch(() => undefined);
  }, [token, owner]);

  const errors = settingsErrors(form);
  const shownSites = useMemo(() => fuzzyFilter(sites, query, (s) => [s.name]), [sites, query]);
  if (!owner) return <Redirect href={"/maintenance" as never} />;

  const cycle = (id: string) => {
    const order = [INHERIT, ...DIRECTIONS];
    const now = siteDirections[id] ?? INHERIT;
    setSiteDirections((d) => ({ ...d, [id]: order[(order.indexOf(now) + 1) % order.length] }));
  };

  const save = async () => {
    if (!token || Object.keys(errors).length > 0) return;
    setBusy(true);
    try {
      await saveMaintenanceReminderSettings(token, {
        direction,
        popupFrom,
        maxPerJobPerDay: Number(form.maxPerJobPerDay),
        cooldownMinutes: { low: Number(form.low), normal: Number(form.normal), high: Number(form.high), urgent: Number(form.urgent) },
        sites: Object.fromEntries(
          sites.map((s) => [s.id, siteDirections[s.id] && siteDirections[s.id] !== INHERIT ? { direction: siteDirections[s.id] as Direction } : null]),
        ),
      });
      appAlert("Saved", "Reminder settings saved.", undefined, "success");
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Reminder settings">
      <View style={styles.stack}>
        <Text style={styles.muted}>
          Lets the person handling a job chase the people who approve or pay, and the other way round, without being able to spam them.
        </Text>

        <Card style={styles.stack}>
          <Text style={styles.heading}>Who can remind whom</Text>
          {DIRECTIONS.map((d) => (
            <Pressable key={d} onPress={() => setDirection(d)} accessibilityRole="radio" accessibilityState={{ selected: direction === d }} style={[styles.option, direction === d && styles.optionOn]}>
              <Text style={styles.body}>{DIRECTION_LABEL[d]}</Text>
            </Pressable>
          ))}
        </Card>

        <Card style={styles.stack}>
          <Text style={styles.heading}>Wait before reminding the same person again (minutes)</Text>
          {PRIORITY_ORDER.map((p) => (
            <View key={p} style={styles.field}>
              <Text style={styles.body}>{PRIORITY_LABEL[p]}</Text>
              <TextInput style={styles.input} value={form[p]} onChangeText={(v) => setForm((f) => ({ ...f, [p]: v }))} keyboardType="number-pad" accessibilityLabel={`${PRIORITY_LABEL[p]} waiting time`} />
              {errors[p] ? <Text style={styles.error}>{errors[p]}</Text> : null}
            </View>
          ))}
          <Text style={styles.muted}>1440 is a day, 4320 is three days. A stronger level cannot wait longer than a gentler one.</Text>
        </Card>

        <Card style={styles.stack}>
          <Text style={styles.heading}>Stop people with a pop-up from</Text>
          <View style={styles.row}>
            {PRIORITY_ORDER.map((p) => (
              <Pressable key={p} onPress={() => setPopupFrom(p)} accessibilityRole="button" accessibilityState={{ selected: popupFrom === p }} style={[styles.chip, popupFrom === p && styles.chipOn]}>
                <Text style={[styles.chipText, popupFrom === p && styles.chipTextOn]}>{PRIORITY_LABEL[p]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.heading}>Most reminders per person per job per day</Text>
          <TextInput style={styles.input} value={form.maxPerJobPerDay} onChangeText={(v) => setForm((f) => ({ ...f, maxPerJobPerDay: v }))} keyboardType="number-pad" accessibilityLabel="Daily limit" />
          {errors.maxPerJobPerDay ? <Text style={styles.error}>{errors.maxPerJobPerDay}</Text> : null}
        </Card>

        {sites.length > 1 ? (
          <Card style={styles.stack}>
            <Text style={styles.heading}>A site that works differently</Text>
            {sites.length > 6 ? (
              <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Find a site" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Find a site" />
            ) : null}
            {shownSites.map((s) => {
              const own = siteDirections[s.id] ?? INHERIT;
              return (
                <Pressable key={s.id} onPress={() => cycle(s.id)} accessibilityRole="button" accessibilityLabel={`${s.name}: ${own === INHERIT ? "same as the organisation" : DIRECTION_LABEL[own as Direction]}. Tap to change`} style={styles.siteRow}>
                  <Text style={[styles.body, { flex: 1 }]}>{s.name}</Text>
                  <Text style={styles.muted}>{own === INHERIT ? "Same as the organisation" : DIRECTION_LABEL[own as Direction]}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.muted}>Tap a site to change it.</Text>
          </Card>
        ) : null}

        <Button loading={busy} disabled={Object.keys(errors).length > 0} onPress={() => void save()}>
          Save reminder settings
        </Button>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.sm },
    heading: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    error: { fontSize: typography.small, color: colors.destructive },
    field: { gap: 4 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card },
    optionOn: { borderColor: colors.primary, borderWidth: 2 },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.white },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.card },
    siteRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  }),
);
