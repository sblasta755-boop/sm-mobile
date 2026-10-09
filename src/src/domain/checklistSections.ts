// Grouping of a task's checklist into sections. Mirrored in the web app
// at smart-property-operations/src/src/lib/smartclean/checklistSections.ts - keep both in sync.
//
// A checklist item may carry sectionId / sectionName / sectionOrder (a
// snapshot taken when the task was assigned - see the backend's
// checklist_sections service). Items with none of them belong to the
// ungrouped default, which is the whole checklist for any task that
// predates sections.

export interface SectionedItem {
  id: string;
  type: string;
  done?: boolean;
  sectionId?: string;
  sectionName?: string;
  sectionOrder?: number;
}

export interface ChecklistGroup<T extends SectionedItem> {
  /** Stable key: the section id, `custom:<name>` for a task-only section, "" for ungrouped. */
  key: string;
  /** Null for the ungrouped default. */
  name: string | null;
  items: T[];
  done: number;
  total: number;
  complete: boolean;
}

/** Notes never block completion, matching the backend's submission rule. */
const counts = (item: SectionedItem) => item.type !== "note";

export function sectionKeyOf(item: SectionedItem): string {
  if (item.sectionId) return item.sectionId;
  if (item.sectionName) return `custom:${item.sectionName}`;
  return "";
}

/**
 * Groups by section, ordered by sectionOrder, then first appearance.
 * Ungrouped items form one group, shown first only when it is the sole
 * group (an old checklist); alongside sections it sorts last as "General".
 */
export function groupChecklist<T extends SectionedItem>(items: T[]): ChecklistGroup<T>[] {
  const groups = new Map<string, { name: string | null; order: number; first: number; items: T[] }>();
  items.forEach((item, index) => {
    const key = sectionKeyOf(item);
    let group = groups.get(key);
    if (!group) {
      group = {
        name: key === "" ? null : (item.sectionName ?? null),
        order: key === "" ? Number.MAX_SAFE_INTEGER : (item.sectionOrder ?? Number.MAX_SAFE_INTEGER - 1),
        first: index,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  });
  return [...groups.entries()]
    .sort(([, a], [, b]) => a.order - b.order || a.first - b.first)
    .map(([key, group]) => {
      const countable = group.items.filter(counts);
      const done = countable.filter((item) => item.done).length;
      return {
        key,
        name: group.name,
        items: group.items,
        done,
        total: countable.length,
        complete: done === countable.length,
      };
    });
}

/** True when any item carries section data - otherwise render the flat list as before. */
export function isSectioned(items: SectionedItem[]): boolean {
  return items.some((item) => sectionKeyOf(item) !== "");
}

/** The section a person should open first: the first incomplete one. */
export function firstIncompleteKey<T extends SectionedItem>(groups: ChecklistGroup<T>[]): string | null {
  return groups.find((group) => !group.complete)?.key ?? null;
}
