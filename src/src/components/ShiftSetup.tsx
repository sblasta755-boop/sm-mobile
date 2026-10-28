import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { listSiteShifts, saveSiteShifts } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Row = { id?: string; name: string; startTime: string; endTime: string };

/** The shifts this site runs. People are booked onto them, their clock-in is checked against
 * them, and stock handover counts start with each one. */
export function ShiftSetup({ siteId, onSaved }: { siteId: string; onSaved: () => void }) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !siteId) return;
    let live = true;
    setLoaded(false);
    listSiteShifts(token, siteId)
      .then((next) => live && setRows(next.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime }))))
      .catch(() => live && setRows([]))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [token, siteId]);

  const patch = (index: number, change: Partial<Row>) => setRows((cur) => cur.map((row, i) => (i === index ? { ...row, ...change } : row)));
  // 0600 -> 06:00 as the person types.
  const clock = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  };

  const save = async () => {
    if (!token) return;
    if (rows.some((r) => !r.name.trim() || !HHMM.test(r.startTime) || !HHMM.test(r.endTime))) {
      appAlert("Check the shifts", "Give each shift a name and times such as 06:00 and 18:00.");
      return;
    }
    setBusy(true);
    try {
      await saveSiteShifts(token, siteId, rows);
      appAlert("Shifts saved", undefined, undefined, "success");
      onSaved();
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name="time-outline" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Shifts at this site</Text>
      </View>
      <Text style={styles.muted}>
        For example Day 06:00 to 18:00 and Night 18:00 to 06:00. A shift that ends before it starts runs past midnight.
      </Text>
      {loaded && rows.length === 0 && <Text style={styles.muted}>No shifts yet, so bookings use hours you type, or the site's working hours.</Text>}
      {rows.map((row, index) => (
        <View key={row.id ?? index} style={styles.shiftRow}>
          <TextInput style={[styles.input, styles.shiftName]} value={row.name} onChangeText={(name) => patch(index, { name })} placeholder="Name" placeholderTextColor={colors.mutedForeground} />
          <TextInput
            style={[styles.input, styles.shiftTime]}
            value={row.startTime}
            onChangeText={(t) => patch(index, { startTime: clock(t) })}
            placeholder="06:00"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel={`${row.name || "Shift"} starts`}
          />
          <TextInput
            style={[styles.input, styles.shiftTime]}
            value={row.endTime}
            onChangeText={(t) => patch(index, { endTime: clock(t) })}
            placeholder="18:00"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel={`${row.name || "Shift"} ends`}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Remove shift" onPress={() => setRows((cur) => cur.filter((_, i) => i !== index))} style={styles.remove}>
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      ))}
      <View style={styles.actions}>
        <Button
          variant="outline"
          fullWidth={false}
          disabled={rows.length >= 6}
          onPress={() =>
            setRows((cur) => [
              ...cur,
              cur.length === 0
                ? { name: "Day", startTime: "06:00", endTime: "18:00" }
                : cur.length === 1
                  ? { name: "Night", startTime: "18:00", endTime: "06:00" }
                  : { name: "", startTime: "", endTime: "" },
            ])
          }
        >
          Add shift
        </Button>
        <Button fullWidth={false} onPress={save} disabled={busy || !loaded}>
          Save shifts
        </Button>
      </View>
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { padding: spacing.lg, gap: spacing.md },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    shiftRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    shiftName: { flex: 1 },
    shiftTime: { width: 72, textAlign: "center" },
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    actions: { flexDirection: "row", gap: spacing.sm },
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
