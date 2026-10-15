import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ScoreControl } from "@/components/ScoreControl";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { fileUrl } from "@/api/client";
import { drainQueue } from "@/features/evidenceUploader";
import { enqueueMutation } from "@/features/outbox";
import { groupChecklist, isSectioned } from "@/domain/checklistSections";
import {
  canInspectRole,
  canReviewSupervisorTask,
  INVESTIGATION_CATEGORIES,
  overallScore,
  PASS_SCORE,
  TASK_CATEGORIES,
} from "@/domain/inspections";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { ChecklistItem } from "@/types/smartclean";
import { appAlert } from "@/components/Dialog";

/**
 * The inspection itself, on the phone: look at what was done (checklist,
 * photos), score it, then approve or send it back with a reason. Mirrors the
 * web inspector. Reached from the supervisor's inspection list and from a
 * submitted task - opening a task that awaits review lands here, not on the
 * cleaner's view of it.
 */
export default function InspectionScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { inspectionId } = useLocalSearchParams<{ inspectionId: string }>();
  const { state, currentUser, refreshBackendData } = useSmartClean();
  const homePath = useHomePath();
  const insp = state.inspections.find((i) => i.id === inspectionId);
  const task = insp ? state.tasks.find((t) => t.id === insp.taskId) : undefined;
  const doer = task ? state.users.find((u) => u.id === task.assigneeId) : undefined;
  const categories = task?.isInvestigation ? INVESTIGATION_CATEGORIES : TASK_CATEGORIES;
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(categories.map((c) => [c, 85])),
  );
  const [comments, setComments] = useState("");
  const [reason, setReason] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(null);

  const overall = useMemo(() => overallScore(scores), [scores]);
  const backToList = currentUser?.role === "supervisor" ? "/supervise-inspections" : homePath;

  if (!insp || !task) {
    return (
      <Screen title="Inspection" backTo={backToList}>
        <Text style={styles.muted}>This inspection isn&apos;t available. It may have been decided already.</Text>
      </Screen>
    );
  }

  const decided = !["pending", "in_progress", "reinspection_required"].includes(insp.status);
  const selfApproval = currentUser?.id === task.assigneeId;
  // A task a supervisor did themselves is reviewed above them.
  const needsManager = !!task.isSupervisorTask && !canReviewSupervisorTask(currentUser?.role);
  const allowed = canInspectRole(currentUser?.role) && !selfApproval && !needsManager;

  const finish = async (decision: "approve" | "reject") => {
    if (!currentUser) return;
    setDeciding(decision);
    try {
      // Saved on the phone first and sent when there is a connection, so the
      // decision is never lost to a dead signal (see features/outbox).
      await enqueueMutation({
        userId: currentUser.id,
        kind: "inspection.decide",
        taskId: task.id,
        payload: {
          inspectionId: insp.id,
          decision,
          score: overall,
          scores,
          comments: comments.trim() || undefined,
          reason: decision === "reject" ? reason.trim() : undefined,
        },
      });
      void drainQueue();
      appAlert(
        decision === "approve" ? "Approved" : "Sent back",
        decision === "approve"
          ? `${task.title} passed with a score of ${overall}.`
          : `${task.title} was sent back. A corrective action was created.`,
      );
      router.replace(backToList as never);
    } catch (error) {
      appAlert("Could not save the inspection", error instanceof Error ? error.message : "Please try again.");
      setDeciding(null);
    }
  };

  const confirm = (decision: "approve" | "reject") =>
    appAlert(
      decision === "approve" ? "Approve this task?" : "Send this task back?",
      decision === "approve"
        ? `It will be recorded as passed with a score of ${overall}.`
        : "The cleaner will be asked to redo it, and a corrective action is created.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: decision === "approve" ? "Approve" : "Send back",
          style: decision === "approve" ? "default" : "destructive",
          onPress: () => void finish(decision),
        },
      ],
    );

  const row = (item: ChecklistItem) => (
    <View key={item.id} style={styles.checkRow}>
      <Ionicons
        name={item.done ? "checkmark-circle" : "ellipse-outline"}
        size={16}
        color={item.done ? colors.success : colors.mutedForeground}
      />
      <View style={styles.flex}>
        <Text style={[styles.checkLabel, !item.done && styles.muted]}>{item.label}</Text>
        {!!item.value && <Text style={styles.checkValue}>&ldquo;{item.value}&rdquo;</Text>}
      </View>
    </View>
  );

  return (
    <Screen title="Inspection" backTo={backToList}>
      <Card style={styles.card}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.muted}>
          {task.locationName ?? "Whole site"}
          {doer ? ` • ${doer.name}` : ""}
        </Text>
        <View style={styles.badges}>
          {task.qrVerified && <VerifiedBadge label="Room QR" />}
          {!task.qrVerified && task.startMethod === "manual" && (
            <StatusBadge tone="neutral" label="Started manually - no area scan" />
          )}
          {task.isSupervisorTask && <StatusBadge tone="info" label="Supervisor task" />}
          {task.evidence.some((e) => e.offlineOriginated) && <StatusBadge tone="warning" label="Offline-originated" />}
        </View>
        {task.startedAt && (
          <Text style={styles.muted}>Started {new Date(task.startedAt).toLocaleString("en-ZA")}</Text>
        )}
        {task.submittedAt && (
          <Text style={styles.muted}>Submitted {new Date(task.submittedAt).toLocaleString("en-ZA")}</Text>
        )}
      </Card>

      {!!task.note && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Note from {doer?.name ?? "the cleaner"}</Text>
          <Text style={styles.noteText}>{task.note}</Text>
        </Card>
      )}

      <Text style={styles.sectionTitle}>Checklist</Text>
      <Card style={styles.card}>
        {isSectioned(task.checklist)
          ? groupChecklist(task.checklist).map((group) => (
              <View key={group.key || "general"} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.name ?? "General"}</Text>
                  <Text style={group.complete ? styles.done : styles.muted}>
                    {group.complete ? "Complete" : `${group.done} of ${group.total} complete`}
                  </Text>
                </View>
                {group.items.map(row)}
              </View>
            ))
          : task.checklist.map(row)}
      </Card>

      <Text style={styles.sectionTitle}>Evidence ({task.evidence.length})</Text>
      {task.evidence.length === 0 ? (
        <Text style={styles.muted}>No evidence was captured.</Text>
      ) : (
        <View style={styles.thumbs}>
          {task.evidence.map((e) => {
            const uri = fileUrl(e.filePath) ?? e.uri;
            return (
              <Pressable
                key={e.id}
                disabled={!uri}
                accessibilityLabel={`View ${e.label} full size`}
                onPress={() => uri && setViewing({ uri, label: e.label })}
                style={styles.thumbWrap}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <Text style={styles.thumbLabel} numberOfLines={2}>
                  {e.label}
                </Text>
                {e.duplicateOf && <Text style={styles.dup}>Possible duplicate</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {decided ? (
        <>
          <Text style={styles.sectionTitle}>Decision</Text>
          <Card style={styles.card}>
            <View style={styles.badges}>
              <StatusBadge
                tone={insp.status === "passed" ? "success" : "destructive"}
                label={insp.status === "passed" ? "Passed" : "Sent back"}
              />
              {insp.score !== undefined && <Text style={styles.taskTitle}>{insp.score}</Text>}
            </View>
            {insp.comments ? <Text style={styles.checkLabel}>{insp.comments}</Text> : null}
            {insp.decidedAt && (
              <Text style={styles.muted}>Decided {new Date(insp.decidedAt).toLocaleString("en-ZA")}</Text>
            )}
          </Card>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Score</Text>
          <Card style={styles.card}>
            {categories.map((category) => (
              <ScoreControl
                key={category}
                label={category}
                value={scores[category] ?? 0}
                onChange={(next) => setScores((current) => ({ ...current, [category]: next }))}
              />
            ))}
            <View style={styles.overall}>
              <Text style={styles.muted}>Overall (pass ≥ {PASS_SCORE})</Text>
              <Text style={[styles.overallValue, overall < PASS_SCORE && { color: colors.destructive }]}>{overall}</Text>
            </View>
          </Card>

          <TextInput
            value={comments}
            onChangeText={setComments}
            placeholder="Comments"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={styles.input}
          />
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for sending it back (required to send back)"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={styles.input}
          />

          {selfApproval && (
            <Text style={styles.warning}>
              You did this task, so you can&apos;t inspect it - another person has to.
            </Text>
          )}
          {needsManager && !selfApproval && (
            <Text style={styles.warning}>
              This is a supervisor&apos;s own task, so a site manager (or above) has to review it.
            </Text>
          )}
          {allowed && overall < PASS_SCORE && (
            <Text style={styles.hint}>
              Approve needs an overall score of {PASS_SCORE} or more. Raise the scores, or send it back.
            </Text>
          )}
          {allowed && !reason.trim() && (
            <Text style={styles.hint}>Add a reason above to send it back.</Text>
          )}

          <View style={styles.actions}>
            <Button
              style={styles.action}
              disabled={!allowed || overall < PASS_SCORE || deciding !== null}
              loading={deciding === "approve"}
              onPress={() => confirm("approve")}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              style={styles.action}
              disabled={!allowed || !reason.trim() || deciding !== null}
              loading={deciding === "reject"}
              onPress={() => confirm("reject")}
            >
              Send back
            </Button>
          </View>
        </>
      )}

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(null)}>
          {viewing && <Image source={{ uri: viewing.uri }} style={styles.viewerImage} resizeMode="contain" />}
          <Text style={styles.viewerLabel}>{viewing?.label}</Text>
          <Text style={styles.viewerHint}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, marginBottom: spacing.md },
  muted: { fontSize: typography.small, color: colors.mutedForeground },
  noteText: { fontSize: typography.body, color: colors.foreground, lineHeight: 20 },
  taskTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  sectionTitle: {
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  group: { gap: spacing.xs, marginBottom: spacing.xs },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  groupTitle: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
  done: { fontSize: typography.small, fontWeight: "600", color: colors.success },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  checkLabel: { fontSize: typography.small, color: colors.foreground },
  checkValue: { fontSize: typography.small, fontStyle: "italic", color: colors.mutedForeground },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  thumbWrap: { width: 96, gap: 2 },
  thumb: { width: 96, height: 96, borderRadius: radius.md },
  thumbEmpty: { backgroundColor: colors.neutral },
  thumbLabel: { fontSize: typography.tiny, color: colors.foreground },
  dup: { fontSize: typography.tiny, color: colors.warningForeground },
  scoreRow: { gap: 6 },
  scoreHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { minWidth: 28, textAlign: "center", fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  overall: {
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: "center",
  },
  overallValue: { fontSize: 28, fontWeight: "800", color: colors.foreground },
  input: {
    minHeight: 72,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    fontSize: typography.body,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  warning: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    fontSize: typography.small,
    color: colors.warningForeground,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xl },
  action: { flex: 1 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  viewerImage: { width: "100%", height: "75%" },
  viewerLabel: { color: colors.white, marginTop: spacing.md, fontSize: typography.body, fontWeight: "600" },
  viewerHint: { color: "rgba(255,255,255,0.6)", marginTop: 4, fontSize: typography.tiny },
}));
