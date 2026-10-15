import { useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { Checkbox } from "@/components/Checkbox";
import { ProgressBar } from "@/components/ProgressBar";
import { TaskNote } from "@/components/TaskNote";
import { ItemNote } from "@/components/ItemNote";
import { useEvidenceQueue } from "@/features/evidenceQueue";
import { enqueueMutation } from "@/features/outbox";
import { drainQueue } from "@/features/evidenceUploader";
import { mergeQueuedEvidence, waitingCount } from "@/domain/evidenceQueue";
import { FINISHED_VIEW_STATUSES, TaskSummary } from "@/components/TaskSummary";
import { TagChips } from "@/components/TagChip";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { useHomePath, useScanPath } from "@/features/roles";
import { fileUrl } from "@/api/client";
import { useHasCapability, useHasModule, useWorkflowPolicy } from "@/features/modules";
import { firstIncompleteKey, groupChecklist, isSectioned } from "@/domain/checklistSections";
import { itemPhotoProgress } from "@/domain/evidenceSlots";
import { taskDestination } from "@/domain/inspections";
import { toneForTask, humanStatus, taskSubmissionBlocked, taskStage, isChecklistUnlocked } from "@/domain/status";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// steps_required checklist items store their value as a single
// newline-joined string (same shape as a "note" item's value) so the
// backend needs no schema change - this splits/joins it into the same
// per-step input + "Add step" UI used for suggested steps elsewhere (see
// app/(app)/incidents/new.tsx).
function StepsField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const steps = value ? value.split("\n") : [""];

  const updateStep = (index: number, text: string) => {
    onChange(steps.map((s, i) => (i === index ? text : s)).join("\n"));
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index).join("\n"));
  };

  const addStep = () => {
    onChange([...steps, ""].join("\n"));
  };

  return (
    <View style={styles.stepsField}>
      {steps.map((step, index) => (
        <View key={index} style={styles.stepRow}>
          <TextInput
            value={step}
            onChangeText={(text) => updateStep(index, text)}
            placeholder={`Step ${index + 1}`}
            placeholderTextColor={colors.mutedForeground}
            editable={!disabled}
            style={[styles.noteInput, styles.stepInput]}
          />
          <Pressable
            accessibilityLabel="Remove step"
            disabled={disabled}
            onPress={() => removeStep(index)}
            style={styles.stepRemoveButton}
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addStepButton} disabled={disabled} onPress={addStep}>
        <Ionicons name="add" size={16} color={colors.foreground} />
        <Text style={styles.addStepText}>Add step</Text>
      </Pressable>
    </View>
  );
}

export default function TaskDetailScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, currentUser, dispatch } = useSmartClean();
  const homePath = useHomePath();
  const scanPath = useScanPath();
  // Sections opened/closed by hand; otherwise only the first incomplete one is open.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const queue = useEvidenceQueue();
  const stored = state.tasks.find((t) => t.id === taskId);
  // Photos still on the phone count as taken, so the screen behaves the same offline.
  const task = stored ? mergeQueuedEvidence(stored, queue) : undefined;
  const waitingPhotos = stored ? waitingCount(queue, stored.id) : 0;
  // Organisation workflow (see useHasCapability: QR fails open, manual
  // fails closed). Presentation only - the server authorises every start.
  const hasAttendance = useHasModule("attendance");
  const canScanStart = useHasCapability("qr_task_start");
  const canManualStart = useHasCapability("manual_task_start");
  const policy = useWorkflowPolicy();
  const requireAreaScan = policy?.tasks.requireAreaScan ?? true;

  // Changes are saved on the phone first (shown at once, sent when there is a
  // connection), so none of this needs a signal. See features/outbox.
  async function startManually() {
    if (!task || !currentUser) return;
    await enqueueMutation({
      userId: currentUser.id,
      kind: "task.start",
      taskId: task.id,
      payload: { startedAt: new Date().toISOString() },
    });
    void drainQueue();
  }

  // The optional note on one checklist item (hidden until opened).
  async function saveItemNote(itemId: string, text: string) {
    if (!task || !currentUser) return;
    await enqueueMutation({
      userId: currentUser.id,
      kind: "task.checklist",
      taskId: task.id,
      payload: { itemId, note: text },
    });
    void drainQueue();
  }

  async function toggleCheck(itemId: string, value: boolean | string) {
    if (!task || !currentUser) return;
    await enqueueMutation({
      userId: currentUser.id,
      kind: "task.checklist",
      taskId: task.id,
      payload: {
        itemId,
        ...(typeof value === "boolean" ? { done: value } : { value }),
      },
    });
    void drainQueue();
  }

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
        <Button variant="outline" style={styles.backButton} onPress={() => router.push(homePath as never)}>
          Back home
        </Button>
      </Screen>
    );
  }

  // Someone reviewing a submitted task came here to INSPECT it, not to see the
  // cleaner's view of it - send them to the inspection.
  const destination = taskDestination(task, currentUser, state.inspections);
  if (destination.startsWith("/inspections/")) {
    return <Redirect href={destination as never} />;
  }

  // A finished task opens as a read-only record (details, checklist, notes and
  // the photos that prove each item), never as a worksheet.
  if (FINISHED_VIEW_STATUSES.includes(task.status)) {
    return (
      <TaskSummary
        task={task}
        doerName={state.users.find((u) => u.id === task.assigneeId)?.name}
        inspection={state.inspections.find((i) => i.taskId === task.id)}
        backTo={homePath}
      />
    );
  }

  // An hourly-compliance round this user was named a candidate for but
  // isn't the current assignee of - either already claimed by someone
  // else, or still on the placeholder first-candidate assignment and
  // this user isn't them. The backend's own _assert_task_access already
  // rejects every write this screen could attempt (checklist/evidence/
  // submit all require assigneeId === this user), so this is a
  // read-only "here's what's going on" screen instead of letting them
  // tap around into API errors - mirrors the web app's
  // mobile.tasks.$taskId.tsx.
  const isUnclaimedCandidate =
    task.isHourlyCompliance &&
    task.assigneeId !== currentUser?.id &&
    (task.hourlyComplianceCandidateIds ?? []).includes(currentUser?.id ?? "");
  if (isUnclaimedCandidate) {
    return (
      <Screen title={task.title} backTo={homePath}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="people-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>
            {task.hourlyComplianceClaimed ? "This round was taken" : "Not yet claimed"}
          </Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            {task.hourlyComplianceClaimed
              ? "Someone else scanned the room QR first and claimed this round - no action needed from you."
              : "You're one of several cleaners eligible for this round. Scan the room's QR code to claim it before someone else does."}
          </Text>
          <Button
            style={styles.clockInPromptButton}
            icon={<Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />}
            onPress={() => router.push(scanPath as never)}
          >
            Scan room QR
          </Button>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(homePath as never)}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  // Blocks the whole screen, not just Submit - matches the backend's own
  // hard enforcement (TaskController._assert_hourly_compliance_window_
  // open) on every write (checklist/evidence/submit), same reasoning as
  // the clock-in gate below: this stops a doomed request before it
  // starts rather than letting a cleaner tap around into a rejected
  // one. A round's window closing is the whole point of a *timed*
  // compliance check - completing it hours late with nothing to show
  // it wasn't on time would defeat that entirely.
  if (task.hourlyComplianceLocked) {
    return (
      <Screen title={task.title} backTo={homePath}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.destructive} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>This round&apos;s window has closed</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            {task.hourlyComplianceSlot
              ? `The ${task.hourlyComplianceSlot} round's time window has passed - it's locked and can no longer be recorded.`
              : "This round's time window has passed - it's locked and can no longer be recorded."}
          </Text>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(homePath as never)}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  // Blocks the whole screen, not just Submit - matches the backend's own
  // hard enforcement (TaskController._assert_clocked_in) and the web
  // app's mobile.tasks.$taskId.tsx, and README.md's stated order: clock
  // in (Attendance) is step 1, task work is step 2.
  const taskIsWorkable = ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status);
  // Each day is its own: a task scheduled for another day is view-only
  // (the backend rejects every write against it - _assert_task_day_open).
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  if (taskIsWorkable && !isToday(task.scheduledAt)) {
    return (
      <Screen title={task.title} backTo={homePath}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.destructive} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>This task is locked</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            It was scheduled for{" "}
            {new Date(task.scheduledAt).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
            . Tasks can only be worked on their own day - this one is view-only.
          </Text>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(homePath as never)}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }
  // No attendance module = no clock-in to demand (the backend skips the
  // same check), so this gate only applies when attendance is in use.
  if (hasAttendance && taskIsWorkable && task.clockedIn === false) {
    return (
      <Screen title={task.title}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="scan-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Clock in to start this task</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            {canScanStart
              ? "Scan your site's QR code to clock in before working on checklist items or capturing evidence."
              : "Clock in from Home before working on checklist items or capturing evidence."}
          </Text>
          {canScanStart && (
            <Button style={styles.clockInPromptButton} icon={<Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />} onPress={() => router.push(scanPath as never)}>
              Scan to clock in
            </Button>
          )}
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(homePath as never)}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  // Mirrors the backend's own hard enforcement
  // (TaskController._assert_no_other_task_in_progress): a cleaner can
  // only have one task in progress at a time, so opening a different,
  // not-yet-started task while one is already in progress blocks the
  // whole screen the same way the clock-in gate above does, rather than
  // letting them tick a box and only finding out from an API error.
  const otherTaskInProgress =
    task.status !== "in_progress" &&
    !task.qrVerified &&
    state.tasks.find(
      (t) =>
        t.id !== task.id &&
        t.assigneeId === currentUser?.id &&
        isToday(t.scheduledAt) &&
        (t.status === "in_progress" ||
          (t.qrVerified && ["assigned", "not_started"].includes(t.status) && !t.hourlyComplianceLocked)),
    );
  if (taskIsWorkable && otherTaskInProgress) {
    return (
      <Screen title={task.title}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Finish your current task first</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            You&apos;re still working on &quot;{otherTaskInProgress.title}&quot;. Submit it before starting this one.
          </Text>
          <Button
            style={styles.clockInPromptButton}
            onPress={() => router.push(`/tasks/${otherTaskInProgress.id}`)}
          >
            Go to that task
          </Button>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(homePath as never)}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  const doneCount = task.checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / task.checklist.length) * 100);
  const submission = taskSubmissionBlocked(
    task,
    requireAreaScan,
    policy?.tasks.evidenceMode === "single" && policy.tasks.requireEvidence,
  );
  const stage = taskStage(task);
  const checklistUnlocked = isChecklistUnlocked(stage) && task.status !== "failed";

  const renderItem = (item: (typeof task.checklist)[number]) => (
      <Card key={item.id} style={item.done ? styles.checklistItemDone : styles.checklistItem}>
        <View style={styles.checklistRow}>
          {item.type !== "note" && item.type !== "steps_required" && (
            <Checkbox
              checked={Boolean(item.done)}
              // photo_required auto-ticks itself once both before/after
              // photos exist (see the backend's add_evidence) - it's
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
                  label={
                    item.photoCount
                      ? // Photos are tied to this item: show exactly how many it needs.
                        itemPhotoProgress(task, item).label
                      : item.done
                        ? "Photo captured"
                        : task.requiresBeforeAfter
                          ? "Auto-completes with before & after photos"
                          : "Auto-completes once you take a photo"
                  }
                  icon="camera-outline"
                />
              )}
              {item.type === "declaration" && <StatusBadge tone="muted" label="Declaration" />}
              {item.type === "steps_required" && (
                <StatusBadge
                  tone={item.done ? "success" : "warning"}
                  label={item.done ? "Steps written" : "Required to submit"}
                />
              )}
            </View>
            {item.type === "photo_required" && item.photoCount && checklistUnlocked && (
              <Button
                variant="outline"
                fullWidth={false}
                style={styles.scanChip}
                icon={<Ionicons name="camera-outline" size={14} color={colors.foreground} />}
                onPress={() => router.push(`/tasks/${task.id}/evidence?item=${item.id}`)}
              >
                {item.done ? "Retake photo" : "Take photo"}
              </Button>
            )}
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
            {item.type === "steps_required" && (
              <StepsField
                value={item.value ?? ""}
                disabled={!checklistUnlocked}
                onChange={(text) => toggleCheck(item.id, text)}
              />
            )}
            {item.type !== "declaration" && (
              <ItemNote
                note={item.note}
                editable={
                  task.assigneeId === currentUser?.id &&
                  ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status)
                }
                onSave={(text) => void saveItemNote(item.id, text)}
              />
            )}
          </View>
        </View>
      </Card>
  );

  return (
    <Screen title={task.title}>
      {task.incidentId && (
        <Card style={styles.incidentCard}>
          <BrokenGlassIcon size={16} color={colors.destructive} />
          <Text style={styles.incidentText}>
            {task.isInvestigation ? (
              <>
                This task is an <Text style={styles.incidentTextStrong}>incident investigation</Text>.
                Your findings and photos go straight to your supervisor for review.
              </>
            ) : (
              <>
                This task was created from an <Text style={styles.incidentTextStrong}>incident report</Text>.
                Completing it resolves that incident once your supervisor approves it.
              </>
            )}
          </Text>
        </Card>
      )}
      {task.status === "failed" && (
        <Card style={styles.failedCard}>
          <Ionicons name="close-circle" size={20} color={colors.destructive} />
          <View style={styles.failedText}>
            <Text style={styles.failedTitle}>Not completed in time</Text>
            <Text style={styles.mutedSmall}>
              This task passed its due time and was marked failed. It can no longer be worked on. Your supervisor can
              reopen it with a new due time.
            </Text>
          </View>
        </Card>
      )}
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.mutedSmall}>
            {task.locationName} • Due {task.dueTime}
          </Text>
          <StatusBadge tone={toneForTask(task.status)} label={humanStatus(task.status)} />
        </View>
        {task.isSupervisorTask && (
          // What makes this different from a cleaner's task, and who (if
          // anyone) signs it off - so nobody wonders why there is no inspection.
          <View style={styles.supervisorNote}>
            <StatusBadge tone="info" label="Supervisor task" />
            <Text style={[styles.mutedSmall, styles.supervisorNoteText]}>
              {policy?.tasks.supervisorTaskReview === "none"
                ? "Closes when you submit - your organisation doesn't review supervisor tasks."
                : "A site manager reviews this after you submit it."}
            </Text>
          </View>
        )}
        {task.qrVerified ? (
          <VerifiedBadge label="Room QR verified" />
        ) : task.startMethod === "manual" ? (
          <StatusBadge tone="neutral" label="Started manually" />
        ) : (
          <>
            {canScanStart && (
              <Button
                variant="outline"
                fullWidth={false}
                style={styles.scanChip}
                icon={<Ionicons name="scan-outline" size={14} color={colors.foreground} />}
                onPress={() => router.push(scanPath as never)}
              >
                {task.isSiteWide ? "Scan site QR to start" : "Scan room QR to start"}
              </Button>
            )}
            {canManualStart && !requireAreaScan && (
              <Button variant="outline" fullWidth={false} style={styles.scanChip} onPress={startManually}>
                Start task
              </Button>
            )}
          </>
        )}
        <TagChips tags={task.tags} max={8} />
        <View style={styles.progressRow}>
          <View style={styles.progressBarWrap}>
            <ProgressBar value={pct} />
          </View>
          <Text style={styles.progressPct}>{pct}%</Text>
        </View>
      </Card>

      {/* Reference material a supervisor attached when assigning this
      task (a manual, a reference photo) - read-only, and deliberately
      separate from the checklist/evidence flow below: this is context
      to consult, not proof of work to capture. See TaskAttachment on
      the backend. */}
      {!!task.attachments?.length && (
        <Card style={styles.attachmentsCard}>
          <View style={styles.attachmentsHeader}>
            <Ionicons name="attach-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.attachmentsHeaderText}>Attachments</Text>
          </View>
          {task.attachments.map((attachment) => {
            const url = fileUrl(attachment.filePath);
            return (
              <Pressable
                key={attachment.id}
                style={styles.attachmentRow}
                onPress={() => url && Linking.openURL(url)}
              >
                <Ionicons
                  name={attachment.kind === "image" ? "image-outline" : "document-text-outline"}
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text style={styles.attachmentLabel} numberOfLines={1}>
                  {attachment.label.trim() || attachment.fileName}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      )}

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

      {stage === "finish" &&
        task.evidenceRequired !== false &&
        (task.requiresBeforeAfter
          ? !task.evidence.some((e) => e.kind === "after")
          : task.evidence.length === 0) && (
          <Card style={styles.beforePromptCard}>
            <View style={styles.beforePromptRow}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <View style={styles.beforePromptText}>
                <Text style={styles.beforePromptTitle}>
                  {task.requiresBeforeAfter ? "Checklist done - take an After photo" : "Take your Evidence photo"}
                </Text>
                <Text style={styles.mutedSmall}>
                  {task.requiresBeforeAfter
                    ? "Capture an After photo (and an Issue photo if anything needs flagging) to finish up."
                    : "Capture a photo as proof the work was done to finish up."}
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

      {(() => {
        const groups = groupChecklist(task.checklist);
        // An old or simple checklist has no sections: render it flat, as before.
        if (!isSectioned(task.checklist)) {
          return <View style={styles.checklist}>{task.checklist.map(renderItem)}</View>;
        }
        const firstOpen = firstIncompleteKey(groups);
        return (
          <View style={styles.checklist}>
            {groups.map((group) => {
              const open = openSections[group.key] ?? group.key === firstOpen;
              return (
                <View key={group.key || "general"}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    style={styles.sectionHeader}
                    onPress={() => setOpenSections((current) => ({ ...current, [group.key]: !open }))}
                  >
                    <View style={styles.sectionTitleRow}>
                      <Ionicons
                        name={open ? "chevron-down" : "chevron-forward"}
                        size={16}
                        color={colors.foreground}
                      />
                      <Text style={styles.sectionTitle}>{group.name ?? "General"}</Text>
                    </View>
                    <Text style={group.complete ? styles.sectionDone : styles.mutedSmall}>
                      {group.complete ? "Complete" : `${group.done}/${group.total} complete`}
                    </Text>
                  </Pressable>
                  {open && <View style={styles.checklist}>{group.items.map(renderItem)}</View>}
                </View>
              );
            })}
          </View>
        );
      })()}

      {/* Optional, and closed until the person doing the task opens it. */}
      <TaskNote
        task={task}
        editable={task.assigneeId === currentUser?.id && ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status)}
      />

      {waitingPhotos > 0 && (
        <View style={styles.infoBox}>
          <Ionicons name="cloud-upload-outline" size={14} color={colors.info} />
          <Text style={styles.infoLine}>
            {waitingPhotos} photo{waitingPhotos === 1 ? "" : "s"} saved on this phone. They upload by themselves when
            there is a connection.
          </Text>
        </View>
      )}

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
            Already submitted - this task is{" "}
            {task.status === "submitted" || task.status === "resubmitted"
              ? "awaiting supervisor inspection"
              : task.isSupervisorTask && task.status === "approved"
                ? "closed - review isn't required for supervisor tasks"
                : humanStatus(task.status)}
            .
          </Text>
        </View>
      ) : (
        submission.blocked && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={14} color={colors.warningForeground} />
            <View style={styles.warningText}>
              {submission.missingQr && (
                <Text style={styles.warningLine}>
                  {requireAreaScan ? "Scan the room QR before starting." : "Start the task before submitting."}
                </Text>
              )}
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

const styles = themedStyles(() => StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  sectionDone: { fontSize: 12, fontWeight: "600", color: colors.success },
  failedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderColor: colors.destructive,
    borderWidth: 1,
  },
  failedText: { flex: 1, gap: 2 },
  failedTitle: { fontSize: typography.body, fontWeight: "700", color: colors.destructive },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  backButton: {
    marginTop: spacing.md,
  },
  incidentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.destructiveSoft,
    borderColor: "#f3c9c4",
  },
  incidentText: {
    flex: 1,
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  incidentTextStrong: {
    fontWeight: "700",
    color: colors.foreground,
  },
  headerCard: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  supervisorNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  supervisorNoteText: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scanChip: {
    alignSelf: "flex-start",
  },
  attachmentsCard: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  attachmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  attachmentsHeaderText: {
    fontSize: typography.small,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  attachmentLabel: {
    flex: 1,
    fontSize: typography.small,
    color: colors.foreground,
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
  stepsField: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepInput: {
    flex: 1,
    marginTop: 0,
    minHeight: 40,
  },
  stepRemoveButton: {
    padding: 4,
  },
  addStepButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addStepText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
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
}));
