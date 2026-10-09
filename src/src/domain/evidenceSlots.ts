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

/** Does any photo item own its photos? Then Before / After / Evidence are
 * taken FOR EACH ITEM, not once for the task. */
export function hasItemPhotos(task: Pick<SlotTask, "checklist">): boolean {
  return task.checklist.some((item) => item.type === "photo_required" && !!item.photoCount);
}

const kindCount = (
  evidence: SlotTask["evidence"],
  itemId: string,
  kind: SlotKind | null,
): number => evidence.filter((e) => e.checklistItemId === itemId && (kind === null || e.kind === kind)).length;

export function evidenceSlots(task: SlotTask, stage: TaskStage): EvidenceSlot[] {
  const itemsWithPhotos = task.checklist.filter((item) => item.type === "photo_required" && item.photoCount);
  const before = !!task.requiresBeforeAfter;
  const itemOwned = itemsWithPhotos.length > 0;
  const started = stage !== "scan";
  const slots: EvidenceSlot[] = [];

  // A task with no photo items takes one Before and one After for the whole
  // task, as it always did.
  if (before && !itemOwned) {
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
    const needed = item.photoCount ?? 1;
    const plural = needed === 1 ? "photo" : "photos";
    if (before) {
      // Each photo item has its own Before and its own After.
      const beforeTaken = kindCount(task.evidence, item.id, "before");
      slots.push({
        key: `item:${item.id}:before`,
        kind: "before",
        label: `${item.label} - Before`,
        description: `Take ${needed} Before ${plural} for this item`,
        checklistItemId: item.id,
        sectionName: item.sectionName,
        required: needed,
        taken: beforeTaken,
        unlocked: started,
        lockedReason: started ? null : "Start the task first",
      });
      const beforeDone = beforeTaken >= needed;
      slots.push({
        key: `item:${item.id}:after`,
        kind: "after",
        label: `${item.label} - After`,
        description: `Take ${needed} After ${plural} for this item`,
        checklistItemId: item.id,
        sectionName: item.sectionName,
        required: needed,
        taken: kindCount(task.evidence, item.id, "after"),
        unlocked: started && beforeDone,
        lockedReason: !started ? "Start the task first" : beforeDone ? null : "Take the Before photo first",
      });
    } else {
      slots.push({
        key: `item:${item.id}`,
        kind: "evidence",
        label: item.label,
        description: `Take ${needed} ${plural} for this item`,
        checklistItemId: item.id,
        sectionName: item.sectionName,
        required: needed,
        taken: kindCount(task.evidence, item.id, null),
        unlocked: started,
        lockedReason: started ? null : "Start the task first",
      });
    }
  }

  if (before && !itemOwned) {
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
  } else if (!before && !itemOwned) {
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

  const issueOpen = stage === "finish" || (started && (!before || itemOwned));
  slots.push({
    key: "issue",
    kind: "issue",
    label: "Issue",
    description: "Anything that needs a supervisor's attention",
    required: null,
    taken: task.evidence.filter((e) => e.kind === "issue").length,
    unlocked: issueOpen,
    lockedReason: issueOpen ? null : "Unlocks once the checklist is complete",
  });

  return slots;
}

/** The slot to open for a checklist item's "Take photo" button: its first
 * one that is not yet full (Before, then After), else its last. */
export function slotKeyForItem(slots: EvidenceSlot[], itemId: string): string | undefined {
  const mine = slots.filter((slot) => slot.checklistItemId === itemId);
  return (mine.find((slot) => slot.required !== null && slot.taken < slot.required) ?? mine[mine.length - 1])?.key;
}

/** How far a photo item is: "1 of 2 photos" (a before-and-after item counts
 * its Before and its After), plus the finished flag. */
export function itemPhotoProgress(
  task: Pick<SlotTask, "requiresBeforeAfter" | "evidence">,
  item: { id: string; photoCount?: number },
): { taken: number; required: number; label: string } {
  const needed = item.photoCount ?? 1;
  const beforeAfter = !!task.requiresBeforeAfter;
  const required = beforeAfter ? needed * 2 : needed;
  const taken = beforeAfter
    ? Math.min(kindCount(task.evidence, item.id, "before"), needed) +
      Math.min(kindCount(task.evidence, item.id, "after"), needed)
    : Math.min(kindCount(task.evidence, item.id, null), needed);
  return {
    taken,
    required,
    label: `${taken} of ${required} photo${required === 1 ? "" : "s"}${beforeAfter ? " (Before + After)" : ""}`,
  };
}

/** The photos a slot owns, in capture order. */
export function evidenceForSlot<T extends { kind: string; checklistItemId?: string | null }>(
  evidence: T[],
  slot: EvidenceSlot,
): T[] {
  if (slot.checklistItemId) {
    return evidence.filter(
      (e) => e.checklistItemId === slot.checklistItemId && (slot.kind === "evidence" || e.kind === slot.kind),
    );
  }
  if (slot.kind === "evidence") return evidence.filter((e) => e.kind === "evidence" && !e.checklistItemId);
  return evidence.filter((e) => e.kind === slot.kind);
}

/** "1 of 2 photos" for a slot that asks for a number; "" otherwise. */
export function slotProgress(slot: EvidenceSlot): string {
  if (slot.required === null) return "";
  return `${Math.min(slot.taken, slot.required)} of ${slot.required} photo${slot.required === 1 ? "" : "s"}`;
}
