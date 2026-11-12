import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { appAlert } from "@/components/Dialog";
import { StepBody } from "@/components/verification/VerificationSteps";
import {
  listAvailableVerificationWorkflows,
  submitVerificationRun,
  type VerificationWorkflow,
} from "@/api/client";
import {
  buildAnswers,
  firstIncomplete,
  newIdempotencyKey,
  progressPercent,
  referenceOf,
  stepComplete,
  type AnswerMap,
  type VerificationAnswerDraft,
  type VerificationStep,
} from "@/domain/verification";
import { useDraft } from "@/features/drafts";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

interface RunDraft {
  key: string;
  startedAt: string;
  index: number;
  answers: AnswerMap;
}

/**
 * One workflow, one step at a time, then a review and Send. Progress (including photos already uploaded)
 * is kept on the phone, so a lock or a closed app does not lose it. Sending needs a connection; the
 * retry key makes a second tap or a retry after a dropped signal safe.
 */
export default function VerificationRunScreen() {
  useThemeVersion();
  const { workflowId } = useLocalSearchParams<{ workflowId: string }>();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const [workflow, setWorkflow] = useState<VerificationWorkflow | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let live = true;
    listAvailableVerificationWorkflows(token)
      .then((all) => live && setWorkflow(all.find((w) => w.id === workflowId) ?? null))
      .catch(() => live && setWorkflow(null));
    return () => {
      live = false;
    };
  }, [token, workflowId]);

  if (workflow === undefined || !token) {
    return (
      <Screen title="Verify an order">
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (workflow === null) {
    return (
      <Screen title="Verify an order">
        <Card>
          <Text style={styles.title}>This check is not available</Text>
          <Text style={styles.muted}>It may have been switched off, or you are offline.</Text>
        </Card>
      </Screen>
    );
  }
  return <Runner workflow={workflow} token={token} siteId={workflow.siteId ?? currentUser?.siteIds?.[0] ?? null} />;
}

function Runner({
  workflow,
  token,
  siteId,
}: {
  workflow: VerificationWorkflow;
  token: string;
  siteId: string | null;
}) {
  const steps = workflow.steps;
  const [initial] = useState<RunDraft>(() => ({
    key: newIdempotencyKey(),
    startedAt: new Date().toISOString(),
    index: 0,
    answers: {},
  }));
  const [run, setRun, clearRun] = useDraft<RunDraft>(`verification:${workflow.id}:v${workflow.version}`, initial);
  const [busy, setBusy] = useState(false);

  const reviewing = run.index >= steps.length;
  const step: VerificationStep | undefined = steps[Math.min(run.index, steps.length - 1)];
  const percent = progressPercent(steps, run.answers);
  const reference = useMemo(() => referenceOf(steps, run.answers), [steps, run.answers]);

  const setAnswer = (stepId: string, next: VerificationAnswerDraft) =>
    setRun((prev) => ({ ...prev, answers: { ...prev.answers, [stepId]: next } }));
  const go = (index: number) => setRun((prev) => ({ ...prev, index }));

  async function send() {
    const missing = firstIncomplete(steps, run.answers);
    if (missing >= 0) {
      appAlert("Not finished", `${steps[missing].label} still needs doing.`);
      go(missing);
      return;
    }
    setBusy(true);
    try {
      const receipt = await submitVerificationRun(token, {
        workflowId: workflow.id,
        idempotencyKey: run.key,
        siteId,
        startedAt: run.startedAt,
        answers: buildAnswers(steps, run.answers),
      });
      clearRun();
      const query = new URLSearchParams({ workflow: receipt.workflowName });
      if (receipt.reference) query.set("reference", receipt.reference);
      router.replace(`/verification/done?${query}` as never);
    } catch (error) {
      appAlert(
        "Not sent",
        error instanceof Error ? error.message : "Check your connection and try again. Nothing has been lost.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={workflow.name}>
      <View style={styles.progress}>
        <ProgressBar value={percent} />
        <Text style={styles.muted}>
          {reviewing ? "Review" : `Step ${run.index + 1} of ${steps.length}`}
        </Text>
      </View>

      {!reviewing && step ? (
        <>
          <Card>
            <StepBody
              key={step.id}
              step={step}
              token={token}
              answer={run.answers[step.id]}
              onChange={(next) => setAnswer(step.id, next)}
            />
          </Card>
          <View style={styles.nav}>
            <Button
              variant="outline"
              fullWidth={false}
              style={styles.navButton}
              disabled={run.index === 0}
              onPress={() => go(run.index - 1)}
            >
              Back
            </Button>
            <Button
              fullWidth={false}
              style={styles.navButton}
              disabled={!stepComplete(step, run.answers[step.id])}
              onPress={() => go(run.index + 1)}
            >
              {run.index === steps.length - 1 ? "Review" : "Next"}
            </Button>
          </View>
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.title}>{reference ? `Order ${reference}` : "Ready to send"}</Text>
            <View style={styles.summary}>
              {steps.map((s, i) => (
                <Pressable key={s.id} accessibilityRole="button" onPress={() => go(i)} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text style={stepComplete(s, run.answers[s.id]) ? styles.summaryDone : styles.summaryTodo}>
                    {summaryOf(s, run.answers[s.id])}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>
          <View style={styles.nav}>
            <Button
              variant="outline"
              fullWidth={false}
              style={styles.navButton}
              disabled={busy}
              onPress={() => go(steps.length - 1)}
            >
              Back
            </Button>
            <Button fullWidth={false} style={styles.navButton} loading={busy} disabled={busy} onPress={send}>
              Send
            </Button>
          </View>
        </>
      )}
    </Screen>
  );
}

function summaryOf(step: VerificationStep, answer: VerificationAnswerDraft | undefined): string {
  if (step.type === "photo") {
    const n = answer?.filePaths?.length ?? 0;
    return n === 0 ? "Missing" : `${n} photo${n === 1 ? "" : "s"}`;
  }
  if (step.type === "scan") return answer?.scan ? (answer.scan.name ?? answer.scan.value) : "Not scanned";
  if (step.type === "confirm") return answer?.value === true ? "Yes" : "Not confirmed";
  const text = typeof answer?.value === "string" ? answer.value.trim() : "";
  return text || (step.required ? "Missing" : "Skipped");
}

const styles = themedStyles(() =>
  StyleSheet.create({
    progress: { gap: spacing.xs, marginBottom: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    nav: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    navButton: { flex: 1 },
    summary: { marginTop: spacing.sm },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryLabel: { flex: 1, fontSize: typography.small, color: colors.foreground },
    summaryDone: { fontSize: typography.small, color: colors.foreground, fontWeight: "600", maxWidth: "50%" },
    summaryTodo: { fontSize: typography.small, color: colors.destructive, fontWeight: "600" },
  }),
);
