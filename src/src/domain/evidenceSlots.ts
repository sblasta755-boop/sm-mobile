// The photos a task asks for, as ordered "slots" the evidence screen shows.
// Mirrored in the web app at
// smart-property-operations/src/src/lib/smartclean/evidenceSlots.ts - keep both in sync.
//
// A slot is one thing to photograph. A checklist item that needs photos has
// its OWN slot with the number of photos it asks for, and a photo taken
// there is sent with that item's id - so the images always map to the item
// they prove and the number taken is the number required. The server
// enforces the same rule (TaskController.add_evidence).

import type { TaskStage } from "./status";

export type SlotKind = "before" | "after" | "evidence" | "issue";

export interface EvidenceSlot {
  /** Stable key: the kind, or `item:<checklist item id>`. */
  key: string;
  kind: SlotKind;
  /** "Before", "After", "Evidence", "Issue", or the checklist item's label. */
  label: string;
  description: string;
  /** Set for a checklist item's own photos. */
  checklistItemId?: string;
  /** Section the item sits in, for context under the label. */
  sectionName?: string;
  /** How many photos this slot asks for; null when any number is fine. */
  required: number | null;
  taken: number;
  unlocked: boolean;
  lockedReason: string | null;
}

interface SlotTask {
  requiresBeforeAfter?: boolean;
  checklist: {
    id: string;
    label: string;
    type: string;
    photoCount?: number;
    sectionName?: string;
  }[];
  evidence: { kind: string; checklistItemId?: string | null }[];
}

export function evidenceSlots(task: SlotTask, stage: TaskStage): EvidenceSlot[] {
  const itemsWithPhotos = task.checklist.filter((item) => item.type === "photo_required" && item.photoCount);
  const before = !!task.requiresBeforeAfter;
  const started = stage !== "scan";
  const slots: EvidenceSlot[] = [];

  if (before) {
    slots.push({
      key: "before",
      kind: "before",
      label: "Before",
      description: "Show the area as you found it",
      required: null,
      taken: task.evidence.filter((e) => e.kind === "before").length,
      unlocked: started,
      lockedReason: started ? null : "Start the task first",
    });
  }

  for (const item of itemsWithPhotos) {
    // With a Before photo, the checklist (and so its photo items) opens once
    // that is taken; without one, as soon as the task is started.
    const open = before ? stage !== "scan" && stage !== "before" : started;
    slots.push({
      key: `item:${item.id}`,
      kind: "evidence",
      label: item.label,
      description:
        item.photoCount === 1 ? "Take 1 photo for this item" : `Take ${item.photoCount} photos for this item`,
      checklistItemId: item.id,
      sectionName: item.sectionName,
      required: item.photoCount ?? 1,
      taken: task.evidence.filter((e) => e.checklistItemId === item.id).length,
      unlocked: open,
      lockedReason: open ? null : before ? "Take a Before photo first" : "Start the task first",
    });
  }

  if (before) {
    slots.push({
      key: "after",
      kind: "after",
      label: "After",
      description: "Show the finished, cleaned area",
      required: null,
      taken: task.evidence.filter((e) => e.kind === "after").length,
      unlocked: stage === "finish",
      lockedReason: stage === "finish" ? null : "Unlocks once the checklist is complete",
    });
  } else if (itemsWithPhotos.length === 0) {
    // No Before/After and no per-item photos: one task-level photo, called Evidence.
    slots.push({
      key: "evidence",
      kind: "evidence",
      label: "Evidence",
      description: "Take a photo as proof the work was done",
      required: 1,
      taken: task.evidence.filter((e) => e.kind === "evidence" && !e.checklistItemId).length,
      unlocked: started,
      lockedReason: started ? null : "Start the task first",
    });
  }

  slots.push({
    key: "issue",
    kind: "issue",
    label: "Issue",
    description: "Anything that needs a supervisor's attention",
    required: null,
    taken: task.evidence.filter((e) => e.kind === "issue").length,
    unlocked: stage === "finish" || (!before && started),
    lockedReason: stage === "finish" || (!before && started) ? null : "Unlocks once the checklist is complete",
  });

  return slots;
}

/** The photos a slot owns, in capture order. */
export function evidenceForSlot<T extends { kind: string; checklistItemId?: string | null }>(
  evidence: T[],
  slot: EvidenceSlot,
): T[] {
  if (slot.checklistItemId) return evidence.filter((e) => e.checklistItemId === slot.checklistItemId);
  if (slot.kind === "evidence") return evidence.filter((e) => e.kind === "evidence" && !e.checklistItemId);
  return evidence.filter((e) => e.kind === slot.kind);
}

/** "1 of 2 photos" for a slot that asks for a number; "" otherwise. */
export function slotProgress(slot: EvidenceSlot): string {
  if (slot.required === null) return "";
  return `${Math.min(slot.taken, slot.required)} of ${slot.required} photo${slot.required === 1 ? "" : "s"}`;
}
