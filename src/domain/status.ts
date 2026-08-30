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

// Mirrors the backend's TaskController._SUBMITTABLE_STATUSES — once a
// task has actually been submitted, it can't be submitted again until a
// supervisor sends it back (rework_required). Previously nothing here
// checked task.status at all, so Submit stayed enabled for as long as the
// checklist/evidence/QR conditions were satisfied — a second tap (or a
// retry after a slow request) silently created a duplicate Inspection row
// for the same task on the backend, showing up as a phantom entry in the
// supervisor's "Recent inspections" alongside the real one.
const SUBMITTABLE_STATUSES = new Set(["assigned", "not_started", "in_progress", "rework_required"]);

export function taskSubmissionBlocked(task: {
  status: string;
  qrVerified?: boolean;
  requiresBeforeAfter: boolean;
  checklist: { type: string; done?: boolean }[];
  evidence: { kind: string }[];
}) {
  const alreadySubmitted = !SUBMITTABLE_STATUSES.has(task.status);
  const missingEvidence =
    (task.requiresBeforeAfter &&
      (!task.evidence.some((e) => e.kind === "before") ||
        !task.evidence.some((e) => e.kind === "after"))) ||
    task.checklist.some(
      (item) => item.type === "photo_required" && !task.evidence.some((e) => e.kind === "after"),
    );
  const missingChecks = task.checklist.some((item) => item.type !== "note" && !item.done);
  return {
    blocked: alreadySubmitted || !task.qrVerified || missingEvidence || missingChecks,
    alreadySubmitted,
    missingQr: !task.qrVerified,
    missingEvidence,
    missingChecks,
  };
}

/**
 * The gamified task-progression stage: scan the room QR, take the Before
 * photo, work through the checklist, then take After/Issue at the end.
 * Each stage only unlocks once the one before it is satisfied — this is
 * UI-level gating (nothing here is re-checked server-side beyond the
 * existing final-submission checks in _submission_issues on the backend,
 * same as the pre-existing qrVerified gate this extends), so it shapes
 * the flow rather than being a hard security boundary.
 */
export type TaskStage = "scan" | "before" | "working" | "finish";

export function taskStage(task: {
  qrVerified?: boolean;
  checklist: { type: string; done?: boolean }[];
  evidence: { kind: string }[];
}): TaskStage {
  if (!task.qrVerified) return "scan";
  if (!task.evidence.some((e) => e.kind === "before")) return "before";
  // "photo_required" items don't count toward this gate — they can only
  // ever become done by the backend auto-ticking them once both before
  // and after evidence exist (see TaskController.add_evidence), so
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

/** Whether the checklist (checkboxes/notes) should be interactive yet —
 * true from the "working" stage onward, i.e. once the Before photo is in. */
export function isChecklistUnlocked(stage: TaskStage): boolean {
  return stage === "working" || stage === "finish";
}
