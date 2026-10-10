import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useWorkflowPolicy } from "@/features/modules";
import { submitTask } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import { appAlert } from "@/components/Dialog";

// A typed name is the whole "signature" here (no drawn/canvas capture),
// so the only thing actually worth enforcing is that it's genuinely the
// signer's own name, not just any string ≥3 characters - previously
// "vvvvvcc" passed the same as "Jane Cleaner" would have, since nothing
// ever compared what was typed against who was actually signing (the
// typed value isn't even sent to the backend - only declarationAccepted
// is, see submitTask - so the check exists purely to stop a meaningless
// scribble from satisfying what's presented as a real attestation).
// Case/whitespace-insensitive so "jane cleaner" or "Jane  Cleaner"
// still matches the account's real display name.
function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function DeclarationScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, currentUser, dispatch, refreshBackendData } = useSmartClean();
  const homePath = useHomePath();
  const policy = useWorkflowPolicy();
  const task = state.tasks.find((t) => t.id === taskId);
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
      </Screen>
    );
  }

  const signatureMatches =
    Boolean(currentUser?.name) && normalizeName(signature) === normalizeName(currentUser!.name);

  async function submit() {
    if (!task || !state.accessToken) return;
    setBusy(true);
    try {
      const updatedTask = await submitTask(state.accessToken, task.id);
      dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: updatedTask });
      await refreshBackendData();
      // A supervisor task in an organisation that does not review them is
      // closed by the server on submit - say so, rather than leaving a task
      // that quietly shows "approved" with no inspection behind it.
      if (updatedTask.status === "approved" && updatedTask.isSupervisorTask) {
        appAlert("Task closed", "Submitted and closed - your organisation doesn't review supervisor tasks.");
      }
      router.push(homePath as never);
    } catch (error) {
      appAlert("Could not submit task", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const doneCount = task.checklist.filter((c) => c.done).length;

  return (
    <Screen
      title={
        task.isSupervisorTask && policy?.tasks.supervisorTaskReview === "none"
          ? "Submit task"
          : "Submit for inspection"
      }
      backTo={`/tasks/${task.id}`}
    >
      <Card style={styles.summaryCard}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.mutedSmall}>{task.locationName}</Text>
        <View style={styles.summaryList}>
          <Text style={styles.summaryLine}>
            Checklist: {doneCount}/{task.checklist.length} complete
          </Text>
          <Text style={styles.summaryLine}>Evidence: {task.evidence.length} items captured</Text>
          <Text style={styles.summaryLine}>
            Started: {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("en-ZA") : "—"}
          </Text>
          {task.qrVerified && <VerifiedBadge label="QR + geofence verified" />}
          {!task.qrVerified && task.startMethod === "manual" && <StatusBadge tone="neutral" label="Started manually" />}
        </View>
      </Card>

      <Card style={styles.declarationCard}>
        <Text style={styles.declarationText}>
          I confirm that I completed the listed tasks and that the submitted evidence accurately represents the
          condition of this area.
        </Text>
        <View style={styles.agreeRow}>
          <Checkbox checked={agree} onChange={setAgree} />
          <Text style={styles.agreeLabel}>I agree to the declaration above.</Text>
        </View>
        <View style={styles.signatureField}>
          <Text style={styles.signatureLabel}>Signature</Text>
          <TextInput
            style={styles.signatureInput}
            placeholder={currentUser?.name ? `Type "${currentUser.name}" to sign` : "Type your full name"}
            placeholderTextColor={colors.mutedForeground}
            value={signature}
            onChangeText={setSignature}
          />
          {signature.trim().length > 0 && !signatureMatches && (
            <Text style={styles.signatureError}>
              Type your name exactly as it appears on your account to sign.
            </Text>
          )}
        </View>
        {agree && !signature.trim() && (
          <Text style={styles.mutedSmall}>Sign above to enable submission.</Text>
        )}
        {!agree && signatureMatches && (
          <Text style={styles.mutedSmall}>Tick the box above to enable submission.</Text>
        )}
      </Card>

      <Button disabled={busy || !agree || !signatureMatches} onPress={submit}>
        Submit task
      </Button>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  summaryCard: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  taskTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  summaryList: {
    marginTop: spacing.sm,
    gap: 4,
  },
  summaryLine: {
    fontSize: typography.small,
    color: colors.foreground,
  },
  declarationCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  declarationText: {
    fontSize: typography.body,
    color: colors.foreground,
    lineHeight: 20,
  },
  agreeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  agreeLabel: {
    flex: 1,
    fontSize: typography.small,
    color: colors.foreground,
  },
  signatureField: {
    gap: spacing.xs,
  },
  signatureLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
  },
  signatureInput: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  signatureError: {
    fontSize: typography.tiny,
    color: colors.destructive,
  },
}));
