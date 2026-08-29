import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { submitTask } from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";

export default function DeclarationScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, dispatch, refreshBackendData } = useSmartClean();
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

  async function submit() {
    if (!task || !state.accessToken) return;
    setBusy(true);
    try {
      const updatedTask = await submitTask(state.accessToken, task.id);
      dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: updatedTask });
      await refreshBackendData();
      router.push("/home");
    } finally {
      setBusy(false);
    }
  }

  const doneCount = task.checklist.filter((c) => c.done).length;

  return (
    <Screen title="Submit for inspection">
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
            placeholder="Type your full name"
            placeholderTextColor={colors.mutedForeground}
            value={signature}
            onChangeText={setSignature}
          />
        </View>
      </Card>

      <Button disabled={busy || !agree || signature.trim().length < 3} onPress={submit}>
        Submit task
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
