import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { appAlert } from "@/components/Dialog";
import { toUserRecord, updateUser } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { NotificationPrefs } from "@/types/smartclean";

type Row = { key: keyof NotificationPrefs; label: string; hint: string };

const ROWS: Row[] = [
  { key: "taskAssignments", label: "Tasks", hint: "New tasks and changes to the ones you hold" },
  { key: "incidents", label: "Incidents", hint: "Incident reports at your sites" },
  { key: "correctiveActions", label: "Corrective actions", hint: "Follow-ups raised or rejected" },
  { key: "reports", label: "Reports", hint: "Scheduled reports" },
];
const TABLE_ROW: Row = {
  key: "tableService",
  label: "Table requests",
  hint: "Menu, bill, call waiter and other guest requests",
};

/**
 * Which alerts are pushed to this person's phone. Everything still lands in
 * the notifications bell either way - these only switch the phone alerts
 * (sound and banner) on or off. Security and account notices can't be
 * switched off.
 */
export default function NotificationSettingsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, dispatch, currentUser } = useSmartClean();
  const [saving, setSaving] = useState(false);
  const prefs = currentUser?.notificationPrefs ?? {};
  const isOn = (key: keyof NotificationPrefs) => prefs[key] !== false;
  const pushOn = isOn("push");
  const rows = state.tenant?.tableServiceEnabled ? [...ROWS, TABLE_ROW] : ROWS;
  const offline = state.connectivity === "offline";

  async function set(key: keyof NotificationPrefs, value: boolean) {
    if (!currentUser || !state.accessToken || saving) return;
    if (offline) {
      appAlert("You're offline", "Connect to the internet to change your notification settings.");
      return;
    }
    const next = { ...prefs, [key]: value };
    setSaving(true);
    try {
      await updateUser(state.accessToken, currentUser.id, toUserRecord(currentUser, { notificationPrefs: next }));
      dispatch({ type: "UPDATE_USER", userId: currentUser.id, patch: { notificationPrefs: next } });
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Please try again.", undefined, "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Notification settings">
      <Card style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
          <View style={styles.copy}>
            <Text style={styles.label}>Push alerts</Text>
            <Text style={styles.hint}>
              {pushOn ? "Your phone alerts you when something new arrives." : "Nothing will buzz your phone. New items still appear in the bell."}
            </Text>
          </View>
          <Switch
            value={pushOn}
            disabled={saving}
            onValueChange={(v) => void set("push", v)}
            trackColor={{ true: colors.primary, false: colors.neutral }}
            accessibilityLabel="Push alerts"
          />
        </View>
      </Card>

      <Text style={styles.section}>Alert me about</Text>
      <Card style={styles.card}>
        {rows.map((row, index) => (
          <View key={row.key} style={[styles.row, index > 0 && styles.divider, !pushOn && styles.dim]}>
            <View style={styles.copy}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.hint}>{row.hint}</Text>
            </View>
            <Switch
              value={isOn(row.key)}
              disabled={saving || !pushOn}
              onValueChange={(v) => void set(row.key, v)}
              trackColor={{ true: colors.primary, false: colors.neutral }}
              accessibilityLabel={row.label}
            />
          </View>
        ))}
      </Card>

      <Text style={styles.footnote}>
        Security and account notices always come through, and everything is kept in the notifications bell.
      </Text>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { paddingVertical: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    dim: { opacity: 0.5 },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    label: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    section: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.small,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.mutedForeground,
    },
    footnote: { marginTop: spacing.md, fontSize: typography.small, color: colors.mutedForeground },
  }),
);
