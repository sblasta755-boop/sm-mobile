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

export function taskSubmissionBlocked(task: {
  qrVerified?: boolean;
  requiresBeforeAfter: boolean;
  checklist: { type: string; done?: boolean }[];
  evidence: { kind: string }[];
}) {
  const missingEvidence =
    (task.requiresBeforeAfter &&
      (!task.evidence.some((e) => e.kind === "before") ||
        !task.evidence.some((e) => e.kind === "after"))) ||
    task.checklist.some(
      (item) => item.type === "photo_required" && !task.evidence.some((e) => e.kind === "after"),
    );
  const missingChecks = task.checklist.some((item) => item.type !== "note" && !item.done);
  return {
    blocked: !task.qrVerified || missingEvidence || missingChecks,
    missingQr: !task.qrVerified,
    missingEvidence,
    missingChecks,
  };
}
