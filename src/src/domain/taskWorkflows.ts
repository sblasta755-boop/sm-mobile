// Working a task made from a workflow, on the phone. Pure, so it is tested. Mirrors the web app's
// lib/smartclean/taskWorkflows.ts (the building side is web-only) and the rules the server enforces in
// backend app/services/task_workflows.py: this only says them up front, so a person is told what is missing
// before they press the button.

import {
  type SignoffMode,
  signaturePayload,
  signoffProblems,
  wantsName,
} from "./signoff";
import { type VerificationAnswerDraft, type VerificationStep, photoLimits } from "./verification";
import type {
  Task,
  TaskSignoffMode,
  TaskWorkflowItem,
  TaskWorkflowItemType,
  TaskWorkflowSettings,
  WorkflowItemState,
  WorkflowReplacement,
  WorkflowSignPayload,
} from "@/types/smartclean";

/** Who can replace a person on a workflow task (the server decides; this shows the buttons). */
export const SUPERVISOR_AND_ABOVE = ["supervisor", "site_manager", "operations_manager", "org_admin", "system_admin"] as const;

export const isSupervisorOrAbove = (role: string | undefined | null): boolean =>
  !!role && (SUPERVISOR_AND_ABOVE as readonly string[]).includes(role);

/** The task's own supervisor, or a manager who can step in: the people who can send an item back or sign off. */
export const canReviewTask = (
  user: { id: string; role: string } | undefined | null,
  task: Pick<Task, "supervisorId">,
): boolean => !!user && isSupervisorOrAbove(user.role) && (user.id === task.supervisorId || user.role !== "supervisor");

export interface WorkflowSnapshot {
  id: string;
  name: string;
  version: number;
  items: TaskWorkflowItem[];
  settings: TaskWorkflowSettings;
}

export const isWorkflowTask = (task: Pick<Task, "metadata">): boolean => task.metadata?.kind === "workflow";

export const workflowSnapshot = (task: Pick<Task, "metadata">): WorkflowSnapshot | null => {
  const raw = task.metadata?.workflow as WorkflowSnapshot | undefined;
  return isWorkflowTask(task) && raw ? raw : null;
};

/** The task's items with who has them and whether they are signed. */
export const workflowItems = (task: Pick<Task, "checklist">): WorkflowItemState[] =>
  (task.checklist as unknown as { type?: string }[]).filter(
    (entry): entry is WorkflowItemState & { type: "workflow_item" } => entry.type === "workflow_item",
  ) as WorkflowItemState[];

/** The people who have an item on a workflow task, or signed one (the server lists them on the task). */
const holders = (task: Pick<Task, "metadata">): string[] => (task.metadata?.workflowAssigneeIds as string[] | undefined) ?? [];

/**
 * Whether a task is this person's to do: it is assigned to them, or it is a workflow task where one of the
 * items is theirs. A person holding only one item is not the task's own assignee but must still see it on
 * their home and task lists.
 */
export const isMyTask = (task: Pick<Task, "assigneeId" | "metadata">, userId: string | undefined | null): boolean =>
  !!userId && (task.assigneeId === userId || holders(task).includes(userId));

export const replacementsOf = (task: Pick<Task, "metadata">): WorkflowReplacement[] =>
  (task.metadata?.replacements as WorkflowReplacement[] | undefined) ?? [];

export const WAITING_FOR_SUPERVISOR = ["submitted", "resubmitted"];
/** Statuses in which items can still be signed. */
export const WORKING = ["assigned", "not_started", "in_progress", "rework_required"];

export const signedCount = (items: WorkflowItemState[]) => items.filter((i) => i.signedAt).length;

export const progressPercent = (items: WorkflowItemState[]) =>
  items.length === 0 ? 0 : Math.round((signedCount(items) / items.length) * 100);

export const allSigned = (items: WorkflowItemState[]) => items.length > 0 && items.every((i) => i.signedAt);

/** Someone who did or has any part of a task cannot be the one who signs it off. */
export const tookPart = (userId: string, items: WorkflowItemState[]) =>
  items.some((i) => i.assigneeId === userId || i.signedBy === userId);

export interface ItemRule {
  mode: TaskSignoffMode;
  requireNameMatch: boolean;
}

/** The sign-off rule for an item: its own override, else the workflow's. */
export function itemRule(item: TaskWorkflowItem | undefined, settings: TaskWorkflowSettings): ItemRule {
  if (item?.signoff) return { mode: item.signoff.mode, requireNameMatch: item.signoff.requireNameMatch };
  return { mode: settings.itemSignoffMode, requireNameMatch: settings.requireNameMatch };
}

/** The design's item behind a task's checklist entry (the design is copied onto the task). */
export const designItem = (task: Pick<Task, "metadata">, itemId: string) =>
  workflowSnapshot(task)?.items.find((i) => i.id === itemId);

/** Whether the item can be shown with the order-verification inputs (photo, text, note, confirm, scan). */
export function asVerificationStep(
  item: Pick<WorkflowItemState, "id" | "itemType" | "label" | "helpText" | "required" | "config">,
): VerificationStep | null {
  if (!["photo", "text", "note", "confirm", "scan"].includes(item.itemType)) return null;
  return {
    id: item.id,
    type: item.itemType as VerificationStep["type"],
    label: item.label,
    helpText: item.helpText,
    required: item.required,
    config: item.config,
  };
}

export type ItemDraft = VerificationAnswerDraft;

const hasText = (draft: ItemDraft | undefined) => typeof draft?.value === "string" && draft.value.trim() !== "";

/** What is still missing from the sign-off part (typed name, drawn signature) for a rule. A tick needs nothing. */
export function ruleProblems(rule: ItemRule, draft: ItemDraft | undefined, accountName: string): string[] {
  if (rule.mode === "tick") return [];
  return signoffProblems({
    mode: rule.mode as SignoffMode,
    requireNameMatch: rule.requireNameMatch && accountName !== "",
    accountName,
    typedName: draft?.signoff?.name ?? "",
    strokes: draft?.signoff?.strokes ?? [],
  });
}

/** The sign-off to send for a rule, or undefined for a tick. */
export function signoffPayload(rule: ItemRule, draft: ItemDraft | undefined): WorkflowSignPayload["signoff"] | undefined {
  const given = draft?.signoff;
  if (rule.mode === "tick" || !given) return undefined;
  return {
    ...(wantsName(rule.mode as SignoffMode) ? { name: given.name.trim() } : {}),
    ...(given.strokes.length > 0 ? { signature: signaturePayload(given.strokes, given.width, given.height) } : {}),
  };
}

/** What is still missing before this item can be signed, in plain words. */
export function itemProblems(
  item: WorkflowItemState,
  draft: ItemDraft | undefined,
  rule: ItemRule,
  accountName: string,
): string[] {
  const problems: string[] = [];
  switch (item.itemType) {
    case "photo": {
      const step = asVerificationStep(item);
      const { min } = step ? photoLimits(step) : { min: 0 };
      if ((draft?.filePaths?.length ?? 0) < min) problems.push(min === 1 ? "Add a photo" : `Add at least ${min} photos`);
      break;
    }
    case "confirm":
      if (item.required && draft?.value !== true) problems.push("Switch on to confirm");
      break;
    case "scan":
      if (item.required && !draft?.scan?.value) problems.push("Scan the code");
      break;
    case "measurement": {
      const raw = typeof draft?.value === "string" ? draft.value.trim() : "";
      if (!raw) {
        if (item.required) problems.push("Enter a value");
        break;
      }
      const number = Number(raw);
      const { min, max } = item.config as { min?: number | null; max?: number | null };
      if (!Number.isFinite(number)) problems.push("Enter a number");
      else if (typeof min === "number" && number < min) problems.push(`It must be at least ${min}`);
      else if (typeof max === "number" && number > max) problems.push(`It must be at most ${max}`);
      break;
    }
    case "text":
    case "note":
      if (item.required && !hasText(draft)) problems.push("This is required");
      break;
    default:
      break;
  }
  problems.push(...ruleProblems(rule, draft, accountName));
  return problems;
}

/** The request body for signing an item. Blanks are dropped; a tick sends no sign-off. */
export function buildSignPayload(item: WorkflowItemState, draft: ItemDraft | undefined, rule: ItemRule): WorkflowSignPayload {
  const out: WorkflowSignPayload = {};
  if (item.itemType === "photo" && draft?.filePaths?.length) out.filePaths = draft.filePaths;
  else if (item.itemType === "scan" && draft?.scan?.value) out.scan = draft.scan;
  else if (item.itemType === "confirm") out.value = draft?.value === true;
  else if (["text", "note", "measurement"].includes(item.itemType) && hasText(draft)) out.value = (draft!.value as string).trim();
  const signoff = signoffPayload(rule, draft);
  if (signoff) out.signoff = signoff;
  return out;
}

/** Photos have to be uploaded before they can be named in a sign-off, so a photo item needs a connection to
 * be signed. Everything else can be signed offline and is sent when the connection returns. */
export const needsConnection = (itemType: TaskWorkflowItemType): boolean => itemType === "photo";

// ---------------------------------------------------------------- showing it

/** "07:00 to 15:00" / "All day" for a booking. */
export function bookingHours(start: string | null, end: string | null): string {
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  return "All day";
}

/** The shown value of a signed item's content. */
export function contentSummary(item: WorkflowItemState): string {
  const content = item.content;
  if (!content) return "";
  if (content.filePaths?.length) return `${content.filePaths.length} photo${content.filePaths.length === 1 ? "" : "s"}`;
  if (content.scan) return content.scan.name ?? content.scan.value;
  if (typeof content.value === "boolean") return content.value ? "Confirmed" : "";
  if (content.value === undefined || content.value === null) return "";
  const unit = typeof item.config.unit === "string" && item.config.unit ? ` ${item.config.unit}` : "";
  return item.itemType === "measurement" ? `${content.value}${unit}` : String(content.value);
}

export const ITEM_TYPE_NAMES: Record<TaskWorkflowItemType, string> = {
  check: "Check",
  photo: "Photo",
  measurement: "Measurement",
  confirm: "Confirm",
  text: "Short text",
  note: "Notes",
  scan: "Scan",
};
