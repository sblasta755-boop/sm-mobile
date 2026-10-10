import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { useSmartClean } from "@/features/store";
import { getMyAttendanceDays, type AttendanceDay } from "@/api/client";
import { useTenantBranding } from "@/services/branding";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import { buildPerformanceProfileHtml } from "@/domain/performanceProfilePdf";

const SECTIONS = [
  {
    key: "tasks" as const,
    label: "Task history",
    description: "Every task you've completed, with quality scores where inspected.",
  },
  {
    key: "inspections" as const,
    label: "Inspection results",
    description: "Scores and comments from every inspection of your work.",
  },
  {
    key: "correctiveActions" as const,
    label: "Corrective actions",
    description: "Any rework raised against your tasks, and how it was resolved.",
  },
  {
    key: "attendance" as const,
    label: "Attendance history",
    description: "Your worked days over the last 3 months, from clock-in records.",
  },
];

type SectionKey = (typeof SECTIONS)[number]["key"];

// Attendance is opt-in by default, unlike the other three: it's the one
// section that needs an extra network round-trip (getMyAttendanceDays)
// before generation can start, so a cleaner who only wants their task/
// inspection record isn't made to wait on it unless they ask for it.
const DEFAULT_SELECTED: Record<SectionKey, boolean> = {
  tasks: true,
  inspections: true,
  correctiveActions: true,
  attendance: false,
};

const ATTENDANCE_WINDOW_DAYS = 90;

export default function PerformanceProfileScreen() {
  const { state, currentUser } = useSmartClean();
  const branding = useTenantBranding();
  const [selected, setSelected] = useState(DEFAULT_SELECTED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));

  const myTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.assigneeId === currentUser?.id && ["approved", "closed"].includes(t.status))
        .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? "")),
    [state.tasks, currentUser],
  );
  const myTaskIds = useMemo(() => new Set(state.tasks.filter((t) => t.assigneeId === currentUser?.id).map((t) => t.id)), [state.tasks, currentUser]);
  const myInspections = useMemo(
    () => state.inspections.filter((i) => myTaskIds.has(i.taskId) && i.status !== "pending" && i.status !== "in_progress"),
    [state.inspections, myTaskIds],
  );
  const myCorrectiveActions = useMemo(
    () => state.correctiveActions.filter((c) => c.assigneeId === currentUser?.id),
    [state.correctiveActions, currentUser],
  );

  const noSelection = !SECTIONS.some((s) => selected[s.key]);

  function toggle(key: SectionKey) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function generate() {
    if (!currentUser || noSelection || busy) return;
    setBusy(true);
    setError(null);
    try {
      let attendanceDays: AttendanceDay[] = [];
      if (selected.attendance && state.accessToken) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - ATTENDANCE_WINDOW_DAYS);
        attendanceDays = await getMyAttendanceDays(
          state.accessToken,
          start.toISOString().slice(0, 10),
          end.toISOString().slice(0, 10),
        );
      }

      const html = buildPerformanceProfileHtml({
        user: currentUser,
        site,
        tenantName: branding.name,
        primaryColor: branding.primaryColor,
        sections: selected,
        tasks: selected.tasks ? myTasks : [],
        inspections: selected.inspections ? myInspections : [],
        correctiveActions: selected.correctiveActions ? myCorrectiveActions : [],
        attendanceDays: selected.attendance ? attendanceDays : [],
      });

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Your performance profile",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate your performance profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Performance profile">
      <ScrollView showsVerticalScrollIndicator={false}>
        <Card style={styles.introCard}>
          <Text style={styles.introTitle}>Build your performance profile</Text>
          <Text style={styles.introText}>
            A CV-style summary of your work on {branding.name} - choose what to include, then
            download it as a PDF to keep or share.
          </Text>
        </Card>

        <View style={styles.sections}>
          {SECTIONS.map((section) => (
            <Card key={section.key} style={styles.sectionRow}>
              <Checkbox checked={selected[section.key]} onChange={() => toggle(section.key)} />
              <View style={styles.sectionText}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                <Text style={styles.sectionDescription}>{section.description}</Text>
              </View>
            </Card>
          ))}
        </View>

        {noSelection && (
          <Text style={styles.hint}>Select at least one section to enable Download.</Text>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Button
          icon={busy ? undefined : <Ionicons name="download-outline" size={18} color={colors.primaryForeground} />}
          disabled={noSelection || busy}
          onPress={generate}
        >
          {busy ? "Preparing your PDF…" : "Download PDF"}
        </Button>
        {busy && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.mutedForeground} size="small" />
            <Text style={styles.busyText}>This can take a moment for a long work history.</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  introCard: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  introTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  introText: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 19,
  },
  sections: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  sectionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionLabel: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  sectionDescription: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  hint: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.destructiveSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.small,
    color: colors.destructive,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  busyText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
}));
