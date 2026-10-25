// Showing one section of a task's photos at a time on the evidence screen. Mirrored in the web
// app at smart-property-operations/src/src/lib/smartclean/evidenceSections.ts - keep both in sync.

import type { EvidenceSlot } from "./evidenceSlots";

/** The standing preference (Settings): show every section, or focus on the one a person opened. */
export type EvidenceViewMode = "all" | "focus";

export const ALL = "all";
/** Photos that belong to the task as a whole rather than to a section. */
export const TASK_PHOTOS = "__task__";

export interface SectionOption {
  key: string;
  label: string;
}

/** The sections a task's photos fall into, in the order they appear. Empty when the task has
 * fewer than two - with nothing to choose between there is nothing to filter. */
export function sectionOptions(
  slots: Pick<EvidenceSlot, "kind" | "checklistItemId" | "sectionName">[],
): SectionOption[] {
  const photoSlots = slots.filter((slot) => slot.kind !== "issue");
  const names: string[] = [];
  for (const slot of photoSlots) {
    if (
      slot.checklistItemId &&
      slot.sectionName &&
      !names.includes(slot.sectionName)
    )
      names.push(slot.sectionName);
  }
  const hasTaskPhotos = photoSlots.some((slot) => !slot.checklistItemId);
  const options: SectionOption[] = names.map((name) => ({
    key: name,
    label: name,
  }));
  if (hasTaskPhotos && options.length > 0)
    options.push({ key: TASK_PHOTOS, label: "Task photos" });
  return options.length >= 2 ? options : [];
}

/** Which section a slot belongs to, as a filter key. */
export function sectionKeyOf(
  slot: Pick<EvidenceSlot, "checklistItemId" | "sectionName">,
): string {
  if (!slot.checklistItemId) return TASK_PHOTOS;
  return slot.sectionName ?? TASK_PHOTOS;
}

/** Only the slots in the chosen section; "all" (or a section that no longer exists) shows everything. */
export function filterBySection<
  T extends Pick<EvidenceSlot, "kind" | "checklistItemId" | "sectionName">,
>(slots: T[], filter: string): T[] {
  if (filter === ALL) return slots;
  const known = sectionOptions(slots).some((option) => option.key === filter);
  if (!known) return slots;
  return slots.filter(
    (slot) => slot.kind === "issue" || sectionKeyOf(slot) === filter,
  );
}

/** Where the screen starts: with the standing preference on "focus", the section of the item the
 * person came from; otherwise everything. */
export function initialSection(
  mode: EvidenceViewMode,
  requestedItem: string | null | undefined,
  slots: Pick<EvidenceSlot, "kind" | "checklistItemId" | "sectionName">[],
): string {
  if (mode !== "focus" || !requestedItem) return ALL;
  const slot = slots.find((s) => s.checklistItemId === requestedItem);
  if (!slot) return ALL;
  const key = sectionKeyOf(slot);
  return sectionOptions(slots).some((option) => option.key === key) ? key : ALL;
}
