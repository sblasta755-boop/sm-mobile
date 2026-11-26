import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { appAlert } from "@/components/Dialog";
import { toUserRecord, updateUser } from "@/api/client";
import { useLeaveOn } from "@/features/leave";
import {
  PAUSE_CHOICES,
  QUIET_PRESETS,
  SUMMARY_HOURS,
  SUMMARY_ROLES,
  summaryLabel,
  pauseActive,
  pauseEnd,
  visiblePrefRows,
  type PrefKey,
} from "@/domain/notificationPrefsConfig";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { NotificationPrefs } from "@/types/smartclean";

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
  const prefs: Partial<NotificationPrefs> = currentUser?.notificationPrefs ?? {};
  const bag = prefs as Record<string, unknown>;
  const isOn = (key: string) => bag[key] !== false;
  const pushOn = isOn("push");
  const leaveOn = useLeaveOn();
  const hidden: PrefKey[] = [];
  if (!leaveOn) hidden.push("leave");
  if (!state.tenant?.tableServiceEnabled) hidden.push("tableService");
  const rows = visiblePrefRows(currentUser?.role, hidden);
  const quiet = prefs.quietHours ?? {};
  const paused = pauseActive(prefs.pausedUntil);
  const hasSummary = SUMMARY_ROLES.includes(currentUser?.role ?? "");
  const summaryHour = typeof prefs.summaryHour === "number" ? prefs.summaryHour : 18;
  const offline = state.connectivity === "offline";

  async function save(patch: Record<string, unknown>) {
    if (!currentUser || !state.accessToken || saving) return;
    if (offline) {
      appAlert("You're offline", "Connect to the internet to change your notification settings.");
      return;
    }
    const next = { ...prefs, ...patch };
    setSaving(true);
    try {
      await updateUser(state.accessToken, currentUser.id, toUserRecord(currentUser, { notificationPrefs: next }));
      dispatch({
        type: "UPDATE_USER",
        userId: currentUser.id,
        patch: { notificationPrefs: next },
      });
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
              {pushOn
                ? "Your phone alerts you when something new arrives."
                : "Nothing will buzz your phone. New items still appear in the bell."}
            </Text>
          </View>
          <Switch
            value={pushOn}
            disabled={saving}
            onValueChange={(v) => void save({ push: v })}
            trackColor={{ true: colors.primary, false: colors.neutral }}
            accessibilityLabel="Push alerts"
          />
        </View>
      </Card>

      <Text style={styles.section}>Where you get notifications</Text>
      <Card style={styles.card}>
        {[
          {
            key: "inApp",
            label: "In the app",
            hint: "The notifications bell. Off means new items are not kept there.",
          },
          { key: "email", label: "Email", hint: "Optional emails such as bookings, incidents and notices." },
        ].map((channel, index) => (
          <View key={channel.key} style={[styles.row, index > 0 && styles.divider]}>
            <View style={styles.copy}>
              <Text style={styles.label}>{channel.label}</Text>
              <Text style={styles.hint}>{channel.hint}</Text>
            </View>
            <Switch
              value={isOn(channel.key)}
              disabled={saving}
              onValueChange={(v) => void save({ [channel.key]: v })}
              trackColor={{ true: colors.primary, false: colors.neutral }}
              accessibilityLabel={channel.label}
            />
          </View>
        ))}
      </Card>

      <Text style={styles.section}>Alert me about</Text>
      <Card style={styles.card}>
        {rows.map((row, index) => (
          <View
            key={row.key}
            style={[
              styles.row,
              index > 0 && styles.divider,
              row.parent && styles.child,
              (!pushOn || (row.parent && !isOn(row.parent))) && styles.dim,
            ]}
          >
            <View style={styles.copy}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.hint}>{row.hint}</Text>
            </View>
            <Switch
              value={isOn(row.key)}
              disabled={saving || !pushOn || Boolean(row.parent && !isOn(row.parent))}
              onValueChange={(v) => void save({ [row.key]: v })}
              trackColor={{ true: colors.primary, false: colors.neutral }}
              accessibilityLabel={row.label}
            />
          </View>
        ))}
      </Card>

      {hasSummary && (
        <>
          <Text style={styles.section}>Daily attendance summary</Text>
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text style={styles.label}>Arrives at</Text>
                <Text style={styles.hint}>One note a day instead of one per person.</Text>
              </View>
            </View>
            <View style={styles.chips}>
              {SUMMARY_HOURS.map((hour) => (
                <Pressable
                  key={hour}
                  disabled={saving}
                  onPress={() => void save({ summaryHour: hour })}
                  style={[styles.chip, summaryHour === hour && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Summary at ${summaryLabel(hour)}`}
                >
                  <Text style={[styles.chipText, summaryHour === hour && styles.chipTextActive]}>
                    {summaryLabel(hour)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.row, styles.divider]}>
              <View style={styles.copy}>
                <Text style={styles.label}>Only my sites</Text>
                <Text style={styles.hint}>Leave out sites you are not assigned to.</Text>
              </View>
              <Switch
                value={bag.onlyMySites === true}
                disabled={saving}
                onValueChange={(v) => void save({ onlyMySites: v })}
                trackColor={{ true: colors.primary, false: colors.neutral }}
                accessibilityLabel="Only my sites"
              />
            </View>
          </Card>
        </>
      )}

      <Text style={styles.section}>Quiet hours</Text>
      <Card style={styles.card}>
        <View style={[styles.row, !pushOn && styles.dim]}>
          <View style={styles.copy}>
            <Text style={styles.label}>Hold phone alerts overnight</Text>
            <Text style={styles.hint}>They still wait in the notifications bell.</Text>
          </View>
          <Switch
            value={quiet.enabled === true}
            disabled={saving || !pushOn}
            onValueChange={(v) =>
              void save({
                quietHours: v
                  ? {
                      enabled: true,
                      from: quiet.from ?? "22:00",
                      to: quiet.to ?? "06:00",
                    }
                  : { ...quiet, enabled: false },
              })
            }
            trackColor={{ true: colors.primary, false: colors.neutral }}
            accessibilityLabel="Quiet hours"
          />
        </View>
        {quiet.enabled === true && (
          <View style={styles.chips}>
            {QUIET_PRESETS.map((preset) => {
              const active = quiet.from === preset.from && quiet.to === preset.to;
              return (
                <Pressable
                  key={preset.label}
                  disabled={saving || !pushOn}
                  onPress={() =>
                    void save({
                      quietHours: {
                        enabled: true,
                        from: preset.from,
                        to: preset.to,
                      },
                    })
                  }
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Quiet hours ${preset.label}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Text style={styles.section}>Pause phone alerts</Text>
      <Card style={styles.card}>
        <View style={[styles.row, !pushOn && styles.dim]}>
          <View style={styles.copy}>
            <Text style={styles.label}>Take a break</Text>
            <Text style={styles.hint}>
              {paused
                ? `Paused until ${new Date(String(prefs.pausedUntil)).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
                : "Pause without changing your settings."}
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          {PAUSE_CHOICES.map((choice) => (
            <Pressable
              key={choice.label}
              disabled={saving || !pushOn}
              onPress={() => void save({ pausedUntil: pauseEnd(choice.hours) })}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel={`Pause for ${choice.label}`}
            >
              <Text style={styles.chipText}>{choice.label}</Text>
            </Pressable>
          ))}
          {paused && (
            <Pressable
              disabled={saving}
              onPress={() => void save({ pausedUntil: null })}
              style={styles.chip}
              accessibilityRole="button"
              accessibilityLabel="Resume alerts now"
            >
              <Text style={styles.chipText}>Resume now</Text>
            </Pressable>
          )}
        </View>
      </Card>

      <Text style={styles.footnote}>
        Security and account notices, password resets and invites always come through, whatever you choose here.
      </Text>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { paddingVertical: spacing.xs },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
    },
    divider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dim: { opacity: 0.5 },
    child: { paddingLeft: spacing.lg },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    chip: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: typography.small,
      fontWeight: "600",
      color: colors.foreground,
    },
    chipTextActive: { color: colors.primaryForeground },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    label: {
      fontSize: typography.body,
      fontWeight: "500",
      color: colors.foreground,
    },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    section: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.small,
      fontWeight: "700",
      textTransform: "uppercase",
      color: colors.mutedForeground,
    },
    footnote: {
      marginTop: spacing.md,
      fontSize: typography.small,
      color: colors.mutedForeground,
    },
  }),
);
