const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Splits the `totalDays` ending on `end` into consecutive [start, end] day
 * keys no longer than `maxSpanDays` each (the server refuses a longer span),
 * oldest first, with no gap and no overlap between them.
 */
export function dateWindows(end: Date, totalDays: number, maxSpanDays: number): { start: string; end: string }[] {
  const windows: { start: string; end: string }[] = [];
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const first = new Date(last.getFullYear(), last.getMonth(), last.getDate() - totalDays);
  let from = first;
  while (from <= last) {
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + maxSpanDays);
    const clipped = to > last ? last : to;
    windows.push({ start: key(from), end: key(clipped) });
    from = new Date(clipped.getFullYear(), clipped.getMonth(), clipped.getDate() + 1);
  }
  return windows;
}
