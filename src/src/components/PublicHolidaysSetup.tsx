import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { addHoliday, listHolidays, removeHoliday, seedHolidays, type Holiday } from "@/api/client";
import { typedDay } from "@/domain/operatingCalendar";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

/** The organisation's public holiday calendar. It belongs to the organisation, not to Leave: sites can close on these
 * days, schedules and alerts skip them, leave does not count them. `readOnly` is a site's (or non-admin's) view of it. */
export function PublicHolidaysSetup({ readOnly = false }: { readOnly?: boolean }) {
  const { state } = useSmartClean();
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
      <View style={styles.yearRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous year" hitSlop={8} onPress={() => setYear((y) => y - 1)}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next year" hitSlop={8} onPress={() => setYear((y) => y + 1)}>
          <Ionicons name="chevron-forward" size={22} color={colors.foreground} />
        </Pressable>
      </View>
      {!readOnly && (
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
          {!readOnly && (
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
      {!readOnly && (
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
