import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { updateChecklistItem } from "@/api/client";
import { toneForTask, humanStatus, taskSubmissionBlocked } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, dispatch } = useSmartClean();
  const task = state.tasks.find((t) => t.id === taskId);

  async function toggleCheck(itemId: string, value: boolean | string) {
    if (!task || !state.accessToken) return;
    dispatch({
      type: "UPDATE_TASK",
      taskId: task.id,
      patch: {
        checklist: task.checklist.map((item) =>
          item.id === itemId
            ? { ...item, done: typeof value === "boolean" ? value : item.done, value: typeof value === "string" ? value : item.value }
            : item,
        ),
      },
    });
    try {
      await updateChecklistItem(state.accessToken, task.id, itemId, {
        done: typeof value === "boolean" ? value : undefined,
        value: typeof value === "string" ? value : undefined,
      });
    } catch {
      // best-effort — local optimistic update stands; next refresh will reconcile
    }
  }

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
        <Button variant="outline" style={styles.backButton} onPress={() => router.push("/home")}>
          Back home
        </Button>
      </Screen>
    );
  }

  const doneCount = task.checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / task.checklist.length) * 100);
  const submission = taskSubmissionBlocked(task);

  return (
    <Screen title={task.title}>
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.mutedSmall}>
            {task.locationName} • Due {task.dueTime}
          </Text>
          <StatusBadge tone={toneForTask(task.status)} label={humanStatus(task.status)} />
        </View>
        {task.qrVerified ? (
          <VerifiedBadge label="Room QR verified" />
        ) : (
          <Button
            variant="outline"
            fullWidth={false}
            style={styles.scanChip}
            icon={<Ionicons name="scan-outline" size={14} color={colors.foreground} />}
            onPress={() => router.push("/scan")}
          >
            Scan room QR to start
          </Button>
        )}
        <View style={styles.progressRow}>
          <View style={styles.progressBarWrap}>
            <ProgressBar value={pct} />
          </View>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
      </Card>

      <View style={styles.checklist}>
        {task.checklist.map((item) => (
          <Card key={item.id} style={item.done ? styles.checklistItemDone : styles.checklistItem}>
            <View style={styles.checklistRow}>
              {item.type !== "note" && (
                <Checkbox
                  checked={Boolean(item.done)}
                  disabled={!task.qrVerified}
                  onChange={(value) => toggleCheck(item.id, value)}
                />
              )}
              <View style={styles.checklistBody}>
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <View style={styles.checklistBadges}>
                  {item.risk === "high" && <StatusBadge tone="destructive" label="High risk" />}
                  {item.risk === "medium" && <StatusBadge tone="warning" label="Attention" />}
                  {item.type === "photo_required" && <StatusBadge tone="info" label="Photo required" icon="camera-outline" />}
                  {item.type === "declaration" && <StatusBadge tone="muted" label="Declaration" />}
                </View>
                {item.type === "note" && (
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Notes for supervisor"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    value={item.value ?? ""}
                    onChangeText={(text) => toggleCheck(item.id, text)}
                  />
                )}
              </View>
            </View>
          </Card>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <Button
          variant="outline"
          style={styles.actionButton}
          icon={<Ionicons name="camera-outline" size={16} color={colors.foreground} />}
          onPress={() => router.push(`/tasks/${task.id}/evidence`)}
        >
          {`Evidence (${task.evidence.length})`}
        </Button>
        <Button style={styles.actionButton} disabled={submission.blocked} onPress={() => router.push(`/tasks/${task.id}/declaration`)}>
          Submit
        </Button>
      </View>

      {submission.blocked && (
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={14} color={colors.warningForeground} />
          <View style={styles.warningText}>
            {submission.missingQr && <Text style={styles.warningLine}>Scan the room QR before starting.</Text>}
            {submission.missingChecks && <Text style={styles.warningLine}>Complete all checklist items.</Text>}
            {submission.missingEvidence && <Text style={styles.warningLine}>Capture required before / after evidence.</Text>}
          </View>
        </View>
      )}

      <View style={styles.footerRow}>
        <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
        <Text style={styles.mutedSmall}>Autosaved locally</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  backButton: {
    marginTop: spacing.md,
  },
  headerCard: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scanChip: {
    alignSelf: "flex-start",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressBarWrap: {
    flex: 1,
  },
  progressPct: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  checklist: {
    gap: spacing.sm,
  },
  checklistItem: {},
  checklistItemDone: {
    backgroundColor: colors.successSoft,
    borderColor: "#a8ddc5",
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  checklistBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  checklistLabel: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  checklistBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  noteInput: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 64,
    fontSize: typography.small,
    color: colors.foreground,
    textAlignVertical: "top",
  },
  actionsRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  warningBox: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  warningText: {
    flex: 1,
    gap: 2,
  },
  warningLine: {
    fontSize: typography.tiny,
    color: colors.warningForeground,
  },
  footerRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
