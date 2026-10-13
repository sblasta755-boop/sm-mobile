import type { StatusTone } from "@/theme";
import type { CAStatus, InspectionStatus, TaskStatus } from "@/types/smartclean";

export function humanStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function toneForTask(status: TaskStatus): StatusTone {
  switch (status) {
    case "approved":
    case "closed":
      return "success";
    case "in_progress":
    case "submitted":
    case "awaiting_inspection":
    case "resubmitted":
      return "info";
    case "rework_required":
      return "warning";
    case "cancelled":
      return "destructive";
    default:
      return "neutral";
  }
}

export function toneForInspection(status: InspectionStatus): StatusTone {
  switch (status) {
    case "passed":
    case "closed":
      return "success";
    case "in_progress":
    case "pending":
      return "info";
    case "failed":
    case "reinspection_required":
      return "warning";
    default:
      return "neutral";
  }
}

export function toneForCA(status: CAStatus): StatusTone {
  switch (status) {
    case "closed":
      return "success";
    case "in_progress":
    case "resubmitted":
    case "awaiting_reinspection":
      return "info";
    case "overdue":
      return "destructive";
    default:
      return "warning";
  }
}

// Mirrors the backend's TaskController._SUBMITTABLE_STATUSES - once a
// task has actually been submitted, it can't be submitted again until a
// supervisor sends it back (rework_required). Previously nothing here
// checked task.status at all, so Submit stayed enabled for as long as the
// checklist/evidence/QR conditions were satisfied - a second tap (or a
// retry after a slow request) silently created a duplicate Inspection row
// for the same task on the backend, showing up as a phantom entry in the
// supervisor's "Recent inspections" alongside the real one.
const SUBMITTABLE_STATUSES = new Set(["assigned", "not_started", "in_progress", "rework_required"]);

/** Whether the cleaner has "started" the task: scanned the room, or - where
 * the organisation allows it - started it manually. Mirrors the backend,
 * which records the method on the task (startMethod) and never reports a
 * manual start as QR-verified. */
function hasStarted(task: { qrVerified?: boolean; startMethod?: string | null }): boolean {
  return !!task.qrVerified || task.startMethod === "manual";
}

export function taskSubmissionBlocked(
  task: {
  status: string;
  qrVerified?: boolean;
  startMethod?: string | null;
  requiresBeforeAfter: boolean;
  /** False for a task set up as needing no photo evidence. */
  evidenceRequired?: boolean;
  checklist: { type: string; done?: boolean; photoCount?: number }[];
  evidence: { kind: string }[];
  },
  /** The organisation's tasks.requireAreaScan; true (the original rule)
   * unless its policy says otherwise. */
  requireAreaScan = true,
  /** The organisation's single-Evidence mode (no Before photo) requires at
   * least one photo; the server enforces it, this just says so up front. */
  requireEvidencePhoto = false,
) {
  const alreadySubmitted = !SUBMITTABLE_STATUSES.has(task.status);
  // Photo items that name a photoCount own their photos: they are done when
  // they have exactly that many, which missingChecks already covers. Older
  // photo items keep the task-level rule below.
  const photoItemsOwnTheirPhotos = task.checklist.some((item) => item.type === "photo_required" && item.photoCount);
  const legacyPhotoItem = task.checklist.some((item) => item.type === "photo_required" && !item.photoCount);
  const missingEvidence =
    // A task set up as needing no evidence skips every task-level photo rule.
    (task.evidenceRequired !== false &&
      task.requiresBeforeAfter &&
      !photoItemsOwnTheirPhotos &&
      (!task.evidence.some((e) => e.kind === "before") ||
        !task.evidence.some((e) => e.kind === "after"))) ||
    (legacyPhotoItem &&
      // An investigation task (requiresBeforeAfter: false) just needs
      // any one photo taken - see TaskController.add_evidence; a
      // before/after task additionally needs an "after", covered above.
      (task.requiresBeforeAfter
        ? !task.evidence.some((e) => e.kind === "after")
        : task.evidence.length === 0)) ||
    (requireEvidencePhoto &&
      task.evidenceRequired !== false &&
      !task.requiresBeforeAfter &&
      !photoItemsOwnTheirPhotos &&
      task.evidence.length === 0);
  const missingChecks = task.checklist.some((item) => item.type !== "note" && !item.done);
  // Not started at all, or - only when the policy demands an area scan -
  // started without one. Without that demand a manual start is enough.
  const missingQr = requireAreaScan ? !task.qrVerified : !hasStarted(task);
  return {
    blocked: alreadySubmitted || missingQr || missingEvidence || missingChecks,
    alreadySubmitted,
    missingQr,
    missingEvidence,
    missingChecks,
  };
}

/**
 * The gamified task-progression stage: scan the room QR, take the Before
 * photo, work through the checklist, then take After/Issue at the end.
 * Each stage only unlocks once the one before it is satisfied - this is
 * UI-level gating (nothing here is re-checked server-side beyond the
 * existing final-submission checks in _submission_issues on the backend,
 * same as the pre-existing qrVerified gate this extends), so it shapes
 * the flow rather than being a hard security boundary.
 */
export type TaskStage = "scan" | "before" | "working" | "finish";

export function taskStage(task: {
  requiresBeforeAfter?: boolean;
  qrVerified?: boolean;
  startMethod?: string | null;
  checklist: { type: string; done?: boolean; photoCount?: number }[];
  evidence: { kind: string }[];
}): TaskStage {
  if (!hasStarted(task)) return "scan";
  // The Before-photo gate only applies to a task that actually wants a
  // before/after pair (requiresBeforeAfter - the normal cleaning-task
  // shape). An investigation task (see IncidentController.
  // assign_investigation) has no such concept - one plain "take a photo
  // of what you found" item, no categorisation - so it skips straight to
  // "working" instead of getting stuck waiting for a "Before" photo the
  // task was never designed to ask for. Mirrors the web app's own
  // taskStage.ts - keep both in sync.
  // When photo items own their photos, Before / After belong to each item and
  // are taken as that item is worked, so there is no task-level Before gate.
  const itemOwnedPhotos = task.checklist.some((item) => item.type === "photo_required" && !!item.photoCount);
  if (task.requiresBeforeAfter && !itemOwnedPhotos && !task.evidence.some((e) => e.kind === "before")) return "before";
  // "photo_required" items don't count toward this gate - they can only
  // ever become done by the backend auto-ticking them once the task's
  // own evidence bar is met (before+after for a requiresBeforeAfter
  // task, any one photo otherwise - see TaskController.add_evidence), so
  // requiring them here alongside gating After's capture button on this
  // same stage was a deadlock: the checklist could never "complete"
  // without an After photo, and the After button could never unlock
  // without the checklist "completing" first. Every other checkbox item
  // must be done; photo_required items are excluded the same way note
  // items already are.
  const otherItemsComplete = task.checklist.every(
    (item) => item.type === "note" || item.type === "photo_required" || item.done,
  );
  if (!otherItemsComplete) return "working";
  return "finish";
}

/** Whether the checklist (checkboxes/notes) should be interactive yet -
 * true from the "working" stage onward, i.e. once the Before photo is in. */
export function isChecklistUnlocked(stage: TaskStage): boolean {
  return stage === "working" || stage === "finish";
}
