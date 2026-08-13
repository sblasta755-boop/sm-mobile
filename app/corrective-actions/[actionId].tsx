import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { humanStatus } from "@/domain/status";
import { nowIso } from "@/services/ids";
import { colors, spacing, typography } from "@/theme";

export default function CorrectiveActionDetailScreen() {
  const { actionId } = useLocalSearchParams<{ actionId: string }>();
  const { state, dispatch, currentUser } = useSmartClean();
  const ca = state.correctiveActions.find((c) => c.id === actionId);

  if (!ca) {
    return (
      <Screen title="Not found">
        <Text style={styles.mutedSmall}>This corrective action does not exist.</Text>
      </Screen>
    );
  }

  const task = state.tasks.find((t) => t.id === ca.taskId);

  function resubmit() {
    if (!ca) return;
    dispatch({ type: "UPDATE_CA", id: ca.id, patch: { status: "awaiting_reinspection", resubmittedAt: nowIso() } });
    dispatch({
      type: "APPEND_CA_TIMELINE",
      id: ca.id,
      entry: { at: nowIso(), actor: currentUser?.name ?? "Cleaner", text: "Rework resubmitted with fresh evidence" },
    });
    dispatch({ type: "UPDATE_TASK", taskId: ca.taskId, patch: { status: "resubmitted" } });
    const insp = state.inspections.find((i) => i.taskId === ca.taskId);
    if (insp) dispatch({ type: "UPDATE_INSPECTION", id: insp.id, patch: { status: "reinspection_required" } });
    router.push("/home");
  }

  return (
    <Screen title="Corrective action">
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.reason} numberOfLines={2}>
            {ca.reason}
          </Text>
          <StatusBadge tone={ca.status === "closed" ? "success" : "warning"} label={humanStatus(ca.status)} />
        </View>
        <Text style={styles.mutedSmall}>
          Task: {task?.title} @ {task?.locationName}
        </Text>
        <Text style={styles.mutedSmall}>
          Deadline: {new Date(ca.deadline).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button variant="outline" icon={<Ionicons name="scan-outline" size={16} color={colors.foreground} />} onPress={() => router.push("/scan")}>
          Rescan room QR
        </Button>
        <Button
          variant="outline"
          icon={<Ionicons name="camera-outline" size={16} color={colors.foreground} />}
          onPress={() => router.push(`/tasks/${ca.taskId}/evidence`)}
        >
          Capture new evidence
        </Button>
        <Button disabled={ca.status === "closed"} onPress={resubmit}>
          Resubmit for reinspection
        </Button>
      </View>

      <View style={styles.timelineSection}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.timeline}>
          {ca.timeline.map((t, i) => (
            <View key={i} style={styles.timelineItem}>
              <Text style={styles.timelineAt}>{new Date(t.at).toLocaleString("en-ZA")}</Text>
              <Text style={styles.timelineText}>
                <Text style={styles.timelineActor}>{t.actor}: </Text>
                {t.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  reason: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  actions: {
    gap: spacing.sm,
  },
  timelineSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  timeline: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  timelineItem: {
    gap: 2,
  },
  timelineAt: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  timelineText: {
    fontSize: typography.small,
    color: colors.foreground,
  },
  timelineActor: {
    fontWeight: "700",
  },
});
