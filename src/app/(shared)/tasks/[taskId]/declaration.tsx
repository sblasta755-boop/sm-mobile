import { useState } from "react";
import { useDraft } from "@/features/drafts";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { useHomePath } from "@/features/roles";
import { useWorkflowPolicy } from "@/features/modules";
import { drainQueue } from "@/features/evidenceUploader";
import { enqueueMutation } from "@/features/outbox";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { appAlert } from "@/components/Dialog";
import { SignatureDrawer, type SignatureResult } from "@/components/SignatureDrawer";
import {
  signaturePayload,
  nameFieldCopy,
  signoffProblems,
  strokesToPath,
  wantsName,
  wantsSignature,
} from "@/domain/signoff";

export default function DeclarationScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const policy = useWorkflowPolicy();
  const task = state.tasks.find((t) => t.id === taskId);
  const [agree, setAgree] = useState(false);
  // The typed name is kept on the phone, so a lock or a closed app does not lose it.
  const [signature, setSignature, clearSignature] = useDraft(`declaration:${taskId}:name`, "");
  const [busy, setBusy] = useState(false);
  const [drawn, setDrawn] = useState<SignatureResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
      </Screen>
    );
  }

  const mode = policy?.tasks.signoffMode ?? "name";
  const requireNameMatch = policy?.tasks.signoffRequireNameMatch ?? true;
  const nameCopy = nameFieldCopy({ mode, requireNameMatch, accountName: currentUser?.name });
  const problems = signoffProblems({
    mode,
    requireNameMatch,
    accountName: currentUser?.name ?? "",
    typedName: signature,
    strokes: drawn?.strokes ?? [],
  });
  const signedOk = problems.length === 0;

  async function submit() {
    if (!task || !currentUser) return;
    setBusy(true);
    try {
      // Saved on the phone and sent after this task's photos, in order, as soon
      // as there is a connection. The task shows as submitted straight away.
      await enqueueMutation({
        userId: currentUser.id,
        kind: "task.submit",
        taskId: task.id,
        payload: {
          submittedAt: new Date().toISOString(),
          ...(wantsName(mode) ? { signerName: signature.trim() } : {}),
          ...(wantsSignature(mode) && drawn ? { signature: signaturePayload(drawn.strokes, drawn.width, drawn.height) } : {}),
        },
      });
      void drainQueue();
      clearSignature();
      if (state.connectivity === "offline") {
        appAlert(
          "Submitted on this phone",
          "There is no connection right now. Your submission and photos are saved and will be sent automatically.",
        );
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
            Started: {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("en-ZA") : "-"}
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
        {wantsName(mode) && (
          <View style={styles.signatureField}>
            <Text style={styles.signatureLabel}>{nameCopy.label}</Text>
            <TextInput
              style={styles.signatureInput}
              placeholder={nameCopy.placeholder}
              placeholderTextColor={colors.mutedForeground}
              value={signature}
              onChangeText={setSignature}
            />
            {signature.trim().length > 0 && problems.includes("The name must match your account name") && (
              <Text style={styles.signatureError}>
                Type your name exactly as it appears on your account to sign.
              </Text>
            )}
          </View>
        )}
        {wantsSignature(mode) && (
          <View style={styles.signatureField}>
            <Text style={styles.signatureLabel}>Signature</Text>
            <Pressable accessibilityRole="button" style={styles.signatureBox} onPress={() => setDrawerOpen(true)}>
              {drawn && drawn.strokes.length > 0 ? (
                <Svg width="100%" height={90} viewBox={`0 0 ${drawn.width} ${drawn.height}`}>
                  <Path d={strokesToPath(drawn.strokes)} stroke={colors.foreground} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              ) : (
                <View style={styles.signatureEmpty}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <Text style={styles.signatureAdd}>Tap to sign</Text>
                </View>
              )}
            </Pressable>
          </View>
        )}
        {agree && !signedOk && <Text style={styles.mutedSmall}>{problems.join(". ")} to enable submission.</Text>}
        {!agree && signedOk && <Text style={styles.mutedSmall}>Tick the box above to enable submission.</Text>}
      </Card>

      <Button disabled={busy || !agree || !signedOk} onPress={submit}>
        Submit task
      </Button>

      <SignatureDrawer
        visible={drawerOpen}
        initial={drawn}
        onClose={() => setDrawerOpen(false)}
        onDone={(result) => {
          setDrawn(result);
          setDrawerOpen(false);
        }}
      />
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
  signatureBox: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  signatureEmpty: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  signatureAdd: { fontSize: typography.body, fontWeight: "600", color: colors.primary },
  signatureError: {
    fontSize: typography.tiny,
    color: colors.destructive,
  },
}));
