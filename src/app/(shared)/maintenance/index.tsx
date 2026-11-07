import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { MaintenancePill } from "@/components/MaintenancePill";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  MAINTENANCE_QUEUES,
  MAINTENANCE_STATE_LABEL,
  maintenanceSeverityTone,
  maintenanceStateTone,
  nextStep,
  sortJobs,
  type NextTone,
} from "@/domain/maintenance";
import {
  getMaintenanceMe,
  getMaintenanceSummary,
  listMaintenanceJobs,
  type MaintenanceCapabilities,
  type MaintenanceJob,
  type MaintenanceQueue,
  type MaintenanceSummary,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const NEXT_ICON: Record<NextTone, keyof typeof Ionicons.glyphMap> = {
  yours: "arrow-forward-circle",
  waiting: "time-outline",
  blocked: "pause-circle",
  done: "checkmark-circle",
};
// A function so the colours follow the theme (light, dark, an organisation's brand) when it changes.
const NEXT_COLOR = (): Record<NextTone, string> => ({
  yours: colors.primary,
  waiting: colors.mutedForeground,
  blocked: colors.destructive,
  done: colors.success,
});

export default function MaintenanceListScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [queue, setQueue] = useState<MaintenanceQueue>("open");
  const [jobs, setJobs] = useState<MaintenanceJob[] | null>(null);
  const [counts, setCounts] = useState<MaintenanceSummary | null>(null);
  const [caps, setCaps] = useState<MaintenanceCapabilities | undefined>(undefined);

  const load = useCallback(
    async (which: MaintenanceQueue) => {
      if (!token) return;
      try {
        const [list, summary, me] = await Promise.all([
          listMaintenanceJobs(token, which),
          getMaintenanceSummary(token),
          getMaintenanceMe(token),
        ]);
        setJobs(list);
        setCounts(summary);
        setCaps(me.capabilities);
      } catch (error) {
        setJobs([]);
        appAlert("Could not load jobs", error instanceof Error ? error.message : "Try again in a moment.");
      }
    },
    [token],
  );

  // Reload whenever the screen is shown again, so a job just reported or moved is up to date.
  useFocusEffect(
    useCallback(() => {
      void load(queue);
    }, [load, queue]),
  );

  const siteName = (id: string) => state.sites.find((s) => s.id === id)?.name ?? "Site";

  return (
    <Screen title="Maintenance">
      <View style={styles.body}>
        <Button icon={<Ionicons name="add" size={18} color={colors.primaryForeground} />} onPress={() => router.push("/maintenance/new" as never)}>
          Report a fault
        </Button>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {MAINTENANCE_QUEUES.filter(
            (q) => ["open", "mine", "closed"].includes(q.value) || q.value === queue || !counts || counts[q.value] > 0,
          ).map((q) => (
            <Pressable
              key={q.value}
              onPress={() => {
                setJobs(null);
                setQueue(q.value);
              }}
              style={[styles.chip, queue === q.value && styles.chipOn]}
            >
              <Text style={[styles.chipText, queue === q.value && styles.chipTextOn]}>
                {counts && counts[q.value] > 0 ? `${q.label}  ${counts[q.value]}` : q.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {jobs === null ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : jobs.length === 0 ? (
          <Card>
            <Text style={styles.muted}>Nothing here.</Text>
          </Card>
        ) : (
          sortJobs(jobs, caps).map((job) => {
            const step = nextStep(job, caps);
            return (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              accessibilityLabel={`${job.title}. ${MAINTENANCE_STATE_LABEL[job.state]}. ${step.text}`}
              onPress={() => router.push(`/maintenance/${job.id}` as never)}
            >
              <Card style={styles.job}>
                <Text style={styles.title}>{job.title}</Text>
                <Text style={styles.sub}>
                  {siteName(job.siteId)}
                  {job.assetLabel ? ` · ${job.assetLabel}` : ""}
                </Text>
                {step.text ? (
                  <View style={styles.next}>
                    <Ionicons name={NEXT_ICON[step.tone]} size={15} color={NEXT_COLOR()[step.tone]} />
                    <Text style={[styles.nextText, { color: NEXT_COLOR()[step.tone] }, step.tone === "yours" && styles.bold]}>{step.text}</Text>
                  </View>
                ) : null}
                <View style={styles.pills}>
                  <MaintenancePill label={job.severity} tone={maintenanceSeverityTone(job.severity)} />
                  <MaintenancePill label={MAINTENANCE_STATE_LABEL[job.state]} tone={maintenanceStateTone(job.state)} />
                  {job.activeHolds > 0 && <MaintenancePill label="On hold" tone="danger" />}
                </View>
              </Card>
            </Pressable>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.md },
    chips: { gap: spacing.xs, paddingVertical: 2 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    chipTextOn: { color: colors.primaryForeground },
    job: { gap: spacing.xs },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    next: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
    nextText: { flex: 1, fontSize: typography.small },
    bold: { fontWeight: "700" },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
