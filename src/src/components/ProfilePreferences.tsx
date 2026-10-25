import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCanMakeReports } from "@/features/roles";
import { useEvidenceViewMode } from "@/features/evidenceView";
import { useCanUsePayroll } from "@/features/payroll";
import { useScheduleOn } from "@/features/schedule";
import { useOutbox } from "@/features/outbox";
import { useEvidenceQueue } from "@/features/evidenceQueue";
import { syncHeadline, syncSummary } from "@/domain/syncStatus";
import type { EvidenceViewMode } from "@/domain/evidenceSections";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, themedStyles, typography, useTheme, type ThemePreference } from "@/theme";

const EVIDENCE_OPTIONS: {
  value: EvidenceViewMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "focus",
    label: "Section I opened",
    hint: "Start on the section of the item you tapped Take photo on. This is the default.",
  },
  {
    value: "all",
    label: "All sections",
    hint: "Show every photo the task asks for.",
  },
];

/** What the evidence screen shows first. A person can still switch section on the screen itself. */
export function EvidenceViewRow() {
  const [mode, setMode] = useEvidenceViewMode();
  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Ionicons name="camera-outline" size={18} color={colors.foreground} />
        <Text style={styles.title}>Evidence photos</Text>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {EVIDENCE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setMode(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sub}>
        {EVIDENCE_OPTIONS.find((o) => o.value === mode)?.hint}
      </Text>
    </View>
  );
}

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
];

/** Light / Dark / System. Used on every role's profile screen and in the profile menu. */
export function AppearanceRow() {
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
    <Pressable style={styles.linkRow} onPress={() => router.push("/management-report")}>
      <Ionicons name="document-text-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.sub}>Download management reports as PDF</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A row that opens Pay runs - only for the people allowed to use them, and only when it is switched on. */
export function PayRunsRow() {
  const allowed = useCanUsePayroll();
  if (!allowed) return null;
  return (
    <Pressable style={styles.linkRow} onPress={() => router.push("/pay-runs" as never)}>
      <Ionicons name="cash-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Pay runs</Text>
        <Text style={styles.sub}>Work out pay from attendance, with PDF and spreadsheet</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A row that opens the schedule: when and where the person is booked. Only when Staff scheduling is switched on. */
export function ScheduleRow() {
  const on = useScheduleOn();
  if (!on) return null;
  return (
    <Pressable style={styles.linkRow} onPress={() => router.push("/schedule" as never)}>
      <Ionicons name="calendar-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>My schedule</Text>
        <Text style={styles.sub}>Where and when you are booked, with a map</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
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
    <Pressable style={styles.linkRow} onPress={() => router.push("/sync" as never)}>
      <Ionicons name={summary.state === "synced" ? "checkmark-circle-outline" : "sync-outline"} size={18} color={summary.state === "refused" ? colors.destructive : colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Sync status</Text>
        <Text style={[styles.sub, summary.state === "refused" && { color: colors.destructive }]}>{syncHeadline(summary)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A row that opens the feedback screen (a message and photos to the Šoma360 team). */
export function FeedbackRow() {
  return (
    <Pressable style={styles.linkRow} onPress={() => router.push("/feedback")}>
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Send feedback</Text>
        <Text style={styles.sub}>Report a problem or share an idea</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
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
