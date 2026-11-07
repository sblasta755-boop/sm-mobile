import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCanMakeReports } from "@/features/roles";
import { useHasModule } from "@/features/modules";
import { useEvidenceViewMode } from "@/features/evidenceView";
import { useCanUsePayroll } from "@/features/payroll";
import { useScheduleOn } from "@/features/schedule";
import { useOutbox } from "@/features/outbox";
import { useEvidenceQueue } from "@/features/evidenceQueue";
import { syncHeadline, syncSummary } from "@/domain/syncStatus";
import type { EvidenceViewMode } from "@/domain/evidenceSections";
import { useSmartClean } from "@/features/store";
import { startTour, useTourTarget } from "@/features/tour";
import { RowSegment, SettingsRow } from "@/components/SettingsKit";
import { colors, radius, spacing, themedStyles, typography, useTheme, type ThemePreference } from "@/theme";

/**
 * The preference rows on every role's profile screen. They are SettingsRow rows, so they share one look with
 * the rest of the screen (see SettingsKit). AppearanceBlock is the older full-width selector, kept for the
 * profile menu sheet, which has no list around it.
 */

const EVIDENCE_OPTIONS: {
  value: EvidenceViewMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "focus",
    label: "Section",
    hint: "Opens on the section you tapped Take photo on",
  },
  {
    value: "all",
    label: "All",
    hint: "Shows every photo the task asks for",
  },
];

/** What the evidence screen shows first. A person can still switch section on the screen itself. */
export function EvidenceViewRow() {
  const [mode, setMode] = useEvidenceViewMode();
  return (
    <SettingsRow
      icon="camera-outline"
      title="Evidence photos"
      sub={EVIDENCE_OPTIONS.find((o) => o.value === mode)?.hint}
      right={
        <RowSegment
          label="Evidence photos"
          value={mode}
          options={EVIDENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={setMode}
        />
      }
    />
  );
}

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
];

/** Light / Dark / System, as a row with a small selector. */
export function AppearanceRow() {
  const { preference, setPreference } = useTheme();
  const tourTarget = useTourTarget("profile:appearance");
  return (
    <SettingsRow
      icon="contrast-outline"
      title="Appearance"
      right={
        <RowSegment
          label="Appearance"
          value={preference}
          options={OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
          onChange={setPreference}
        />
      }
      {...tourTarget}
    />
  );
}

/** Light / Dark / System, full width. Used in the profile menu sheet. */
export function AppearanceBlock() {
  const { preference, setPreference } = useTheme();
  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Ionicons name="contrast-outline" size={18} color={colors.foreground} />
        <Text style={styles.title}>Appearance</Text>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setPreference(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Ionicons
                name={option.icon}
                size={15}
                color={selected ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A row that opens the report screen, for the roles that may make reports. */
export function ReportsRow() {
  const { currentUser } = useSmartClean();
  const canMakeReports = useCanMakeReports();
  if (!currentUser || !canMakeReports) return null;
  return (
    <SettingsRow
      icon="document-text-outline"
      title="Reports"
      sub="Download management reports as PDF"
      onPress={() => router.push("/management-report")}
    />
  );
}

/** A row that opens Pay runs - only for the people allowed to use them, and only when it is switched on. */
export function PayRunsRow() {
  const allowed = useCanUsePayroll();
  if (!allowed) return null;
  return (
    <SettingsRow
      icon="cash-outline"
      title="Pay runs"
      sub="Work out pay from attendance, with PDF and spreadsheet"
      onPress={() => router.push("/pay-runs" as never)}
    />
  );
}

/** A row that opens the schedule: when and where the person is booked. Only when Staff scheduling is switched on. */
export function ScheduleRow() {
  const on = useScheduleOn();
  if (!on) return null;
  return (
    <SettingsRow
      icon="calendar-outline"
      title="My schedule"
      sub="Where and when you are booked, with a map"
      onPress={() => router.push("/schedule" as never)}
    />
  );
}

/** A row that opens the Sync screen, with a live line on whether this phone's work has reached the server. */
export function SyncRow() {
  const { state, currentUser } = useSmartClean();
  const summary = syncSummary({
    outbox: useOutbox(),
    photos: useEvidenceQueue(),
    userId: currentUser?.id,
    offline: state.connectivity === "offline",
  });
  return (
    <SettingsRow
      icon={summary.state === "synced" ? "checkmark-circle-outline" : "sync-outline"}
      title="Sync status"
      sub={syncHeadline(summary)}
      onPress={() => router.push("/sync" as never)}
    />
  );
}

/** A row that opens the feedback screen (a message and photos to the Šoma360 team). */
export function FeedbackRow() {
  // Switched off for an organisation by the platform: then there is nothing to send it to.
  const feedbackOn = useHasModule("feedback");
  if (!feedbackOn) return null;
  return (
    <SettingsRow
      icon="chatbubble-ellipses-outline"
      title="Send feedback"
      sub="Report a problem or share an idea"
      onPress={() => router.push("/feedback")}
    />
  );
}

/** Replays the guided tour. On every role's profile screen. */
export function TourRow() {
  const tourTarget = useTourTarget("profile:tutorial");
  return (
    <SettingsRow
      icon="compass-outline"
      title="App tutorial"
      sub="Replay the guided tour"
      onPress={() => startTour(true)}
      {...tourTarget}
    />
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    block: { paddingVertical: spacing.sm, gap: spacing.sm },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    title: { fontSize: typography.body, color: colors.foreground, fontWeight: "500" },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.secondary,
      borderRadius: radius.lg,
      padding: 3,
      gap: 3,
    },
    option: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    optionSelected: { backgroundColor: colors.primary },
    optionText: { fontSize: typography.small, color: colors.mutedForeground, fontWeight: "600" },
    optionTextSelected: { color: colors.primaryForeground },
    linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
    linkText: { flex: 1 },
  }),
);

