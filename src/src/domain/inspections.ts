// Inspection rules shared by the screens that start or run one. The pass mark
// and rubrics mirror the web inspector (supervisor.inspections.$inspectionId.tsx)
// and the backend (InspectionController.PASS_SCORE_THRESHOLD).

import type { Inspection } from "@/types/smartclean";

export const PASS_SCORE = 80;

/** Inspection statuses that still await a decision. */
const OPEN = new Set(["pending", "in_progress", "reinspection_required"]);

/** Roles that may decide an inspection. */
const INSPECTOR_ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin"];
/** Roles that may decide the inspection of a task a supervisor did themselves. */
const MANAGER_ROLES = ["site_manager", "operations_manager", "org_admin"];

export const TASK_CATEGORIES = [
  "Cleanliness",
  "Completeness",
  "Safety compliance",
  "Presentation",
  "Evidence quality",
];

// An investigation is not cleaning work, so it is graded on how well it
// assessed the reported problem, not on how clean the room is.
export const INVESTIGATION_CATEGORIES = [
  "Thoroughness",
  "Findings documented clearly",
  "Evidence quality",
  "Proposed steps quality",
];

export function canInspectRole(role: string | undefined): boolean {
  return !!role && INSPECTOR_ROLES.includes(role);
}

/** May this role decide an inspection of a supervisor's own task? */
export function canReviewSupervisorTask(role: string | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}

/** The inspection of this task that is waiting for a decision, if any (newest first). */
export function openInspectionFor(inspections: Inspection[], taskId: string): Inspection | undefined {
  return inspections
    .filter((inspection) => inspection.taskId === taskId && OPEN.has(inspection.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** The latest inspection of this task, decided or not. */
export function latestInspectionFor(inspections: Inspection[], taskId: string): Inspection | undefined {
  return inspections
    .filter((inspection) => inspection.taskId === taskId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function overallScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  return values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Where tapping a task should go. A reviewer opening someone else's
 * submitted task wants to INSPECT it, not see the cleaner's view of it, so
 * that goes straight to the inspection; everything else opens the task.
 */
export function taskDestination(
  task: { id: string; status: string; assigneeId: string },
  user: { id: string; role: string } | null | undefined,
  inspections: Inspection[],
): string {
  const awaitingReview = ["submitted", "resubmitted", "awaiting_inspection"].includes(task.status);
  if (user && awaitingReview && task.assigneeId !== user.id && canInspectRole(user.role)) {
    const inspection = openInspectionFor(inspections, task.id);
    if (inspection) return `/inspections/${inspection.id}`;
  }
  return `/tasks/${task.id}`;
}
