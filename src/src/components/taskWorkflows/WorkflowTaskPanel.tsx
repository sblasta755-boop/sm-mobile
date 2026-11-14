import { useState } from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { ReplacePersonSheet } from "@/components/taskWorkflows/ReplacePersonSheet";
import { SignoffBlock, SignoffView } from "@/components/taskWorkflows/SignoffBlock";
import { TextPromptSheet } from "@/components/taskWorkflows/TextPromptSheet";
import { StepBody } from "@/components/verification/VerificationSteps";
import { fileUrl, returnWorkflowItem, signOffWorkflowTask } from "@/api/client";
import { friendlyWhen } from "@/domain/verification";
import { signItemOrQueue } from "@/features/workflowSign";
import { useSmartClean } from "@/features/store";
import {
  type ItemDraft,
  ITEM_TYPE_NAMES,
  WAITING_FOR_SUPERVISOR,
  WORKING,
  allSigned,
  asVerificationStep,
  buildSignPayload,
  canReviewTask,
  contentSummary,
  designItem,
  isSupervisorOrAbove,
  itemProblems,
  itemRule,
  needsConnection,
  progressPercent,
  replacementsOf,
  ruleProblems,
  signedCount,
  signoffPayload,
  tookPart,
  workflowItems,
  workflowSnapshot,
} from "@/domain/taskWorkflows";
import type { Task, WorkflowItemState } from "@/types/smartclean";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

const MISMATCH = "The name must match your account name";

/**
 * A workflow task, item by item: who has each one, who signed it, and what is left. The person whose item it
 * is signs it here (with no signal it is kept on the phone and sent later); a supervisor, or anyone above,
 * can swap a person who cannot come; the task's supervisor (or a manager) can send a signed item back and
 * sign the whole task off once every item is signed. The server decides who may do each; this only shows the
 * buttons that apply.
 */
export function WorkflowTaskPanel({ task }: { task: Task }) {
  useThemeVersion();
  const { state, currentUser, dispatch } = useSmartClean();
  const [signingId, setSigningId] = useState<string | null>(null);
  const [replace, setReplace] = useState<{ open: boolean; itemId?: string }>({ open: false });
  const [sendingBack, setSendingBack] = useState<WorkflowItemState | null>(null);

  const items = workflowItems(task);
  const snapshot = workflowSnapshot(task);
  if (!snapshot || !currentUser) return null;

  const me = currentUser;
  const working = WORKING.includes(task.status);
  const waiting = WAITING_FOR_SUPERVISOR.includes(task.status);
  const finished = task.status === "approved";
  const canSwap = isSupervisorOrAbove(me.role) && (working || waiting);
  const canReview = canReviewTask(me, task);
  const offline = state.connectivity === "offline";
  const accept = (updated: Task) => dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: updated });
  const needsOnline = () => {
    if (!offline) return false;
    appAlert("You are offline", "This needs a connection. Try again when you are back online.");
    return true;
  };

  const sendBack = async (item: WorkflowItemState, note: string) => {
    if (!state.accessToken || needsOnline()) return;
    try {
      accept(await returnWorkflowItem(state.accessToken, task.id, item.id, note));
      setSendingBack(null);
    } catch (error) {
      appAlert("Could not send it back", error instanceof Error ? error.message : undefined);
    }
  };

  const replacements = replacementsOf(task);

  return (
    <View style={styles.stack}>
      <View style={styles.gapSmall}>
        <View style={styles.rowBetween}>
          <Text style={styles.strong}>
            {signedCount(items)} of {items.length} signed
          </Text>
          <Text style={styles.muted}>
            {snapshot.name} | version {snapshot.version}
          </Text>
        </View>
        <ProgressBar value={progressPercent(items)} />
      </View>

      {canSwap && !finished && (
        <Button variant="outline" onPress={() => setReplace({ open: true })}>
          Someone cannot come
        </Button>
      )}

      {items.map((item) => {
        const mine = item.assigneeId === me.id;
        const signing = signingId === item.id;
        const planned = item.plannedAssigneeId !== item.assigneeId;
        return (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={styles.muted}>
                  {ITEM_TYPE_NAMES[item.itemType]}
                  {!item.required && item.itemType !== "check" ? " | optional" : ""}
                </Text>
                {item.helpText ? <Text style={styles.muted}>{item.helpText}</Text> : null}
                <Text style={styles.muted}>
                  {mine ? "Yours" : item.assigneeName}
                  {planned ? " (replaced someone)" : ""}
                </Text>
              </View>
              {item.signedAt ? (
                <StatusBadge tone="success" label="Signed" icon="checkmark-circle" />
              ) : item.returned ? (
                <StatusBadge tone="destructive" label="Sent back" icon="arrow-undo" />
              ) : (
                <StatusBadge tone="muted" label="To do" icon="time-outline" />
              )}
            </View>

            {item.returned && item.returnNote && !item.signedAt ? (
              <Text style={styles.returnNote}>{item.returnNote}</Text>
            ) : null}

            {item.signedAt && item.signoff ? (
              <View style={styles.signed}>
                <Text style={styles.body}>
                  {item.signedByName ?? "Someone"}
                  {item.signoff.name && item.signoff.name !== item.signedByName ? ` (signed as ${item.signoff.name})` : ""}
                  <Text style={styles.muted}> | {friendlyWhen(item.signedAt)}</Text>
                </Text>
                {item.pendingSign ? <Text style={styles.waiting}>Saved on this phone. It will be sent when you are online.</Text> : null}
                {contentSummary(item) ? <Text style={styles.muted}>{contentSummary(item)}</Text> : null}
                {item.content?.filePaths?.length ? (
                  <View style={styles.photos}>
                    {item.content.filePaths.map((path) => (
                      <Image key={path} source={{ uri: fileUrl(path) }} style={styles.photo} accessibilityLabel={`Photo for ${item.label}`} />
                    ))}
                  </View>
                ) : null}
                <SignoffView signoff={item.signoff} />
              </View>
            ) : item.signedAt && item.pendingSign ? (
              // Signed on this phone and not yet sent: the details come back from the server once it has them.
              <View style={styles.signed}>
                <Text style={styles.body}>
                  {item.signedByName ?? "You"}
                  <Text style={styles.muted}> | {friendlyWhen(item.signedAt)}</Text>
                </Text>
                <Text style={styles.waiting}>Saved on this phone. It will be sent when you are online.</Text>
              </View>
            ) : null}

            {!item.signedAt && mine && working && !signing ? (
              <Button style={styles.gapTop} onPress={() => setSigningId(item.id)}>
                Sign off
              </Button>
            ) : null}

            {signing ? (
              <ItemSigner task={task} item={item} onCancel={() => setSigningId(null)} onDone={() => setSigningId(null)} onTask={accept} />
            ) : null}

            {(working || waiting) && !signing && ((canSwap && !item.signedAt) || (canReview && item.signedAt)) ? (
              <View style={styles.actions}>
                {!item.signedAt && canSwap ? (
                  <Button variant="outline" fullWidth={false} style={styles.half} onPress={() => setReplace({ open: true, itemId: item.id })}>
                    Replace
                  </Button>
                ) : null}
                {item.signedAt && canReview ? (
                  <Button variant="outline" fullWidth={false} style={styles.half} onPress={() => setSendingBack(item)}>
                    Send back
                  </Button>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {(waiting || finished) && canReview && !finished && allSigned(items) ? <SupervisorSignoff task={task} onTask={accept} /> : null}

      {finished ? <TaskSignedOff task={task} /> : null}

      {replacements.length > 0 && (
        <View style={styles.gapSmall}>
          <Text style={styles.heading}>People swapped</Text>
          {replacements.map((r) => (
            <Card key={r.at + r.toUserId + r.itemIds.join()} style={styles.itemCard}>
              <Text style={styles.body}>
                {r.fromNames.join(", ")} replaced by <Text style={styles.strong}>{r.toName}</Text> on {r.itemIds.length} item
                {r.itemIds.length === 1 ? "" : "s"}
                {r.booked ? "" : " (not booked that day)"}
              </Text>
              <Text style={styles.muted}>
                {r.reason} | by {r.byName} | {friendlyWhen(r.at)}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <ReplacePersonSheet
        task={task}
        visible={replace.open}
        itemId={replace.itemId}
        onClose={() => setReplace({ open: false })}
        onDone={accept}
      />
      <TextPromptSheet
        visible={sendingBack !== null}
        title={sendingBack ? `Send back "${sendingBack.label}"` : ""}
        description={sendingBack ? `${sendingBack.signedByName ?? sendingBack.assigneeName} will be told and has to sign it again.` : undefined}
        label="What needs to be redone"
        confirmLabel="Send back"
        onCancel={() => setSendingBack(null)}
        onSubmit={(note) => (sendingBack ? sendBack(sendingBack, note) : undefined)}
      />
    </View>
  );
}

/** The input for one item and the sign-off, with what is still missing spelled out. */
function ItemSigner({
  task,
  item,
  onCancel,
  onDone,
  onTask,
}: {
  task: Task;
  item: WorkflowItemState;
  onCancel: () => void;
  onDone: () => void;
  onTask: (task: Task) => void;
}) {
  const { state, currentUser } = useSmartClean();
  const [draft, setDraft] = useState<ItemDraft | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const snapshot = workflowSnapshot(task)!;
  const rule = itemRule(designItem(task, item.id), snapshot.settings);
  const accountName = currentUser?.name ?? "";
  const problems = itemProblems(item, draft, rule, accountName);
  const step = asVerificationStep(item);
  const offline = state.connectivity === "offline";
  const unit = typeof item.config.unit === "string" ? item.config.unit : "";

  const submit = async () => {
    if (!state.accessToken || !currentUser || problems.length > 0) return;
    setBusy(true);
    try {
      const outcome = await signItemOrQueue({
        token: state.accessToken,
        userId: currentUser.id,
        userName: currentUser.name,
        taskId: task.id,
        itemId: item.id,
        body: buildSignPayload(item, draft, rule),
        online: !offline,
      });
      if (outcome.queued) appAlert("Saved on this phone", "It will be sent when you are back online.");
      else onTask(outcome.task);
      onDone();
    } catch (error) {
      appAlert("Could not sign this off", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.signer}>
      {step ? (
        <StepBody
          step={{ ...step, label: ITEM_TYPE_NAMES[item.itemType], helpText: "" }}
          answer={draft}
          token={state.accessToken ?? ""}
          accountName={accountName}
          onChange={setDraft}
        />
      ) : null}
      {item.itemType === "measurement" ? (
        <View style={styles.reading}>
          <TextInput
            value={typeof draft?.value === "string" ? draft.value : ""}
            onChangeText={(value) => setDraft({ ...draft, value })}
            keyboardType="decimal-pad"
            placeholder="Enter the reading"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.flex]}
            accessibilityLabel={`${item.label} reading`}
          />
          {unit ? <Text style={styles.muted}>{unit}</Text> : null}
        </View>
      ) : null}
      {offline && needsConnection(item.itemType) ? (
        <Text style={styles.waiting}>Photos need a connection. Take them when you are back online.</Text>
      ) : null}
      <SignoffBlock
        rule={rule}
        accountName={accountName}
        draft={draft}
        mismatch={(draft?.signoff?.name ?? "").trim() !== "" && problems.includes(MISMATCH)}
        onChange={setDraft}
      />
      {problems.length > 0 ? <Text style={styles.muted}>Still needed: {problems.join(", ").toLowerCase()}.</Text> : null}
      <View style={styles.actions}>
        <Button fullWidth={false} style={styles.half} disabled={problems.length > 0} loading={busy} onPress={submit}>
          Sign off
        </Button>
        <Button variant="outline" fullWidth={false} style={styles.half} disabled={busy} onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

/** The supervisor's final sign-off, once every item is signed. */
function SupervisorSignoff({ task, onTask }: { task: Task; onTask: (task: Task) => void }) {
  const { state, currentUser } = useSmartClean();
  const [draft, setDraft] = useState<ItemDraft | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const snapshot = workflowSnapshot(task)!;
  const items = workflowItems(task);
  const rule = { mode: snapshot.settings.supervisorSignoffMode, requireNameMatch: snapshot.settings.requireNameMatch };
  const accountName = currentUser?.name ?? "";
  const problems = ruleProblems(rule, draft, accountName);
  const conflict = !!currentUser && tookPart(currentUser.id, items);

  const submit = async () => {
    if (!state.accessToken || problems.length > 0 || conflict) return;
    if (state.connectivity === "offline") {
      appAlert("You are offline", "Signing the task off needs a connection. Try again when you are back online.");
      return;
    }
    setBusy(true);
    try {
      onTask(await signOffWorkflowTask(state.accessToken, task.id, { signoff: signoffPayload(rule, draft) }));
      appAlert("Task signed off");
    } catch (error) {
      appAlert("Could not sign the task off", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.finalCard}>
      <Text style={styles.strong}>Every item is signed</Text>
      <Text style={styles.muted}>Check the work, then sign the task off.</Text>
      {conflict ? (
        <Text style={styles.conflict}>
          You did part of this task, so someone else has to sign it off. Ask another supervisor or a manager.
        </Text>
      ) : (
        <>
          <SignoffBlock
            rule={rule}
            accountName={accountName}
            draft={draft}
            mismatch={(draft?.signoff?.name ?? "").trim() !== "" && problems.includes(MISMATCH)}
            onChange={setDraft}
          />
          {problems.length > 0 ? <Text style={styles.muted}>Still needed: {problems.join(", ").toLowerCase()}.</Text> : null}
          <Button disabled={problems.length > 0} loading={busy} onPress={submit}>
            Sign the task off
          </Button>
        </>
      )}
    </Card>
  );
}

function TaskSignedOff({ task }: { task: Task }) {
  const { state } = useSmartClean();
  const signoff = task.signoff ?? (task.metadata?.signoff as Task["signoff"]);
  const signer = (task.metadata?.signoff as { signedBy?: string } | undefined)?.signedBy;
  const name = state.users.find((u) => u.id === signer)?.name;
  return (
    <Card style={styles.itemCard}>
      <Text style={styles.strong}>Signed off by the supervisor</Text>
      <Text style={styles.muted}>
        {name ?? signoff?.name ?? "Supervisor"}
        {signoff?.signedAt ? ` | ${friendlyWhen(signoff.signedAt)}` : ""}
      </Text>
      {signoff?.path && signoff.width && signoff.height ? (
        <SignoffView signoff={{ path: signoff.path, width: signoff.width, height: signoff.height }} />
      ) : null}
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    stack: { gap: spacing.md },
    gapSmall: { gap: spacing.sm },
    gapTop: { marginTop: spacing.sm },
    flex: { flex: 1 },
    rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
    strong: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    heading: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    itemCard: { gap: spacing.sm },
    itemTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    returnNote: {
      fontSize: typography.body,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.destructive,
      borderRadius: radius.md,
      backgroundColor: colors.destructiveSoft,
      padding: spacing.sm,
    },
    signed: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
    waiting: { fontSize: typography.small, color: colors.warning },
    photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    photo: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    signer: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
    reading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    half: { flex: 1 },
    finalCard: { gap: spacing.sm, borderWidth: 2, borderColor: colors.primary },
    conflict: {
      fontSize: typography.small,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: radius.md,
      backgroundColor: colors.warningSoft,
      padding: spacing.sm,
    },
  }),
);
