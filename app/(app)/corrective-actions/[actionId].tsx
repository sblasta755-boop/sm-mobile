import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { updateCorrectiveAction } from "@/api/client";
import { humanStatus } from "@/domain/status";
import { colors, spacing, typography } from "@/theme";
import { formatDateTime } from "@/services/formatDateTime";

export default function CorrectiveActionDetailScreen() {
  const { actionId } = useLocalSearchParams<{ actionId: string }>();
  const { state, dispatch, refreshBackendData } = useSmartClean();
  const ca = state.correctiveActions.find((c) => c.id === actionId);

  if (!ca) {
    return (
      <Screen title="Not found">
        <Text style={styles.mutedSmall}>This corrective action does not exist.</Text>
      </Screen>
    );
  }

  const task = state.tasks.find((t) => t.id === ca.taskId);

  async function resubmit() {
    if (!ca || !state.accessToken) return;
    try {
      const updated = await updateCorrectiveAction(state.accessToken, ca.id, {
        status: "awaiting_reinspection",
        note: "Rework resubmitted with fresh evidence",
      });
      dispatch({ type: "UPDATE_CA", id: ca.id, patch: updated });
      await refreshBackendData();
      router.push("/home");
    } catch {
      // best-effort — UI stays on this screen so the cleaner can retry
    }
  }

  return (
    <Screen title="Corrective action" backTo="/corrective-actions">
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
              <Text style={styles.timelineAt}>{formatDateTime(t.at)}</Text>
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
