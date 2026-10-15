// Files a task's photos under the checklist item each one proves, so a
// reviewer reads "item, then its photos" instead of one undifferentiated grid.
// Mirrored in the web app at smart-property-operations/src/src/lib/smartclean/evidenceByItem.ts.

export interface ItemPhoto {
  id: string;
  kind: string;
  checklistItemId?: string | null;
  capturedAt?: string;
}

const KIND_RANK: Record<string, number> = { before: 0, after: 1 };

function compare(a: ItemPhoto, b: ItemPhoto): number {
  const kind = (KIND_RANK[a.kind] ?? 2) - (KIND_RANK[b.kind] ?? 2);
  if (kind !== 0) return kind;
  return (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "");
}

/**
 * `byItem` holds each checklist item's photos (before, then after, then the
 * rest, oldest first). `loose` is everything else: photos taken for the whole
 * task, or for an item no longer on the checklist, in the order they were taken.
 */
export function evidenceByItem<T extends ItemPhoto>(
  checklist: { id: string }[],
  evidence: T[],
): { byItem: Record<string, T[]>; loose: T[] } {
  const known = new Set(checklist.map((item) => item.id));
  const byItem: Record<string, T[]> = {};
  const loose: T[] = [];
  for (const photo of evidence) {
    const itemId = photo.checklistItemId;
    if (itemId && known.has(itemId)) (byItem[itemId] ??= []).push(photo);
    else loose.push(photo);
  }
  for (const list of Object.values(byItem)) list.sort(compare);
  loose.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
  return { byItem, loose };
}
