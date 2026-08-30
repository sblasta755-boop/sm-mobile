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
import { toneForTask, humanStatus, taskSubmissionBlocked, taskStage, isChecklistUnlocked } from "@/domain/status";
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

  // Blocks the whole screen, not just Submit — matches the backend's own
  // hard enforcement (TaskController._assert_clocked_in) and the web
  // app's mobile.tasks.$taskId.tsx, and README.md's stated order: clock
  // in (Attendance) is step 1, task work is step 2.
  const taskIsWorkable = ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status);
  if (taskIsWorkable && task.clockedIn === false) {
    return (
      <Screen title={task.title}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="scan-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Clock in to start this task</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            Scan your site&apos;s QR code to clock in before working on checklist items or capturing evidence.
          </Text>
          <Button style={styles.clockInPromptButton} icon={<Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />} onPress={() => router.push("/scan")}>
            Scan to clock in
          </Button>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push("/home")}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  const doneCount = task.checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / task.checklist.length) * 100);
  const submission = taskSubmissionBlocked(task);
  const stage = taskStage(task);
  const checklistUnlocked = isChecklistUnlocked(stage);

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

      {stage === "before" && (
        <Card style={styles.beforePromptCard}>
          <View style={styles.beforePromptRow}>
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <View style={styles.beforePromptText}>
              <Text style={styles.beforePromptTitle}>Take a Before photo to start</Text>
              <Text style={styles.mutedSmall}>
                The checklist unlocks once you&apos;ve captured a Before photo in Evidence.
              </Text>
            </View>
          </View>
          <Button
            style={styles.beforePromptButton}
            icon={<Ionicons name="camera-outline" size={16} color={colors.primaryForeground} />}
            onPress={() => router.push(`/tasks/${task.id}/evidence`)}
          >
            Open camera
          </Button>
        </Card>
      )}

      {stage === "finish" && !task.evidence.some((e) => e.kind === "after") && (
        <Card style={styles.beforePromptCard}>
          <View style={styles.beforePromptRow}>
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <View style={styles.beforePromptText}>
              <Text style={styles.beforePromptTitle}>Checklist done — take an After photo</Text>
              <Text style={styles.mutedSmall}>
                Capture an After photo (and an Issue photo if anything needs flagging) to finish up.
              </Text>
            </View>
          </View>
          <Button
            style={styles.beforePromptButton}
            icon={<Ionicons name="camera-outline" size={16} color={colors.primaryForeground} />}
            onPress={() => router.push(`/tasks/${task.id}/evidence`)}
          >
            Open camera
          </Button>
        </Card>
      )}

      <View style={styles.checklist}>
        {task.checklist.map((item) => (
          <Card key={item.id} style={item.done ? styles.checklistItemDone : styles.checklistItem}>
            <View style={styles.checklistRow}>
              {item.type !== "note" && (
                <Checkbox
                  checked={Boolean(item.done)}
                  // photo_required auto-ticks itself once both before/after
                  // photos exist (see the backend's add_evidence) — it's
                  // evidence-driven, not something to check by hand.
                  disabled={item.type === "photo_required" || !checklistUnlocked}
                  onChange={(value) => toggleCheck(item.id, value)}
                />
              )}
              <View style={styles.checklistBody}>
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <View style={styles.checklistBadges}>
                  {item.risk === "high" && <StatusBadge tone="destructive" label="High risk" />}
                  {item.risk === "medium" && <StatusBadge tone="warning" label="Attention" />}
                  {item.type === "photo_required" && (
                    <StatusBadge
                      tone={item.done ? "success" : "info"}
                      label={item.done ? "Photo captured" : "Auto-completes with before & after photos"}
                      icon="camera-outline"
                    />
                  )}
                  {item.type === "declaration" && <StatusBadge tone="muted" label="Declaration" />}
                </View>
                {item.type === "note" && (
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Notes for supervisor"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    editable={checklistUnlocked}
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

      {submission.alreadySubmitted ? (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={14} color={colors.info} />
          <Text style={styles.infoLine}>
            Already submitted — this task is{" "}
            {task.status === "submitted" || task.status === "resubmitted"
              ? "awaiting supervisor inspection"
              : humanStatus(task.status)}
            .
          </Text>
        </View>
      ) : (
        submission.blocked && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={14} color={colors.warningForeground} />
            <View style={styles.warningText}>
              {submission.missingQr && <Text style={styles.warningLine}>Scan the room QR before starting.</Text>}
              {submission.missingChecks && <Text style={styles.warningLine}>Complete all checklist items.</Text>}
              {submission.missingEvidence && <Text style={styles.warningLine}>Capture required before / after evidence.</Text>}
            </View>
          </View>
        )
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
  beforePromptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.accent,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  beforePromptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  beforePromptText: {
    flex: 1,
    gap: 2,
  },
  beforePromptTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  beforePromptButton: {},
  clockInPromptCard: {
    marginTop: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  clockInPromptIcon: {
    marginBottom: spacing.xs,
  },
  clockInPromptTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  clockInPromptText: {
    textAlign: "center",
  },
  clockInPromptButton: {
    marginTop: spacing.sm,
    alignSelf: "stretch",
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
  infoBox: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  infoLine: {
    flex: 1,
    fontSize: typography.tiny,
    color: colors.info,
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
