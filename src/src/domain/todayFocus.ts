// What to put in front of someone on the home screen: the tasks they can act on
// right now, in the order they should do them. Done work and work that is not
// due yet stay off it (the full list is one tap away). Mirrored in the web app
// at smart-property-operations/src/src/lib/smartclean/todayFocus.ts.

export interface FocusTask {
  id: string;
  status: string;
  priority?: string;
  scheduledAt?: string | null;
  dueAt?: string | null;
  /** True when scheduledAt..dueAt is a work window rather than only a deadline. */
  hasTimeRange?: boolean;
}

/** Statuses where there is still something for the person to do. */
const OPEN = new Set(["assigned", "not_started", "scheduled", "in_progress", "rework_required"]);
const UNDER_WAY = new Set(["in_progress", "rework_required"]);

/** A task with a time range shows up this long before it begins. */
export const LEAD_MS = 60 * 60 * 1000;

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 0, medium: 1, low: 2 };

export type FocusGroup = "under_way" | "overdue" | "now" | "soon";

const GROUP_RANK: Record<FocusGroup, number> = { under_way: 0, overdue: 1, now: 2, soon: 3 };

const time = (value?: string | null) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

function isSameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * Where a task sits for someone looking at their screen at `now`, or null when it
 * does not belong on it (finished, for another day, or not due for a while).
 */
export function focusGroup(task: FocusTask, now: number): FocusGroup | null {
  if (!OPEN.has(task.status)) return null;
  // Work already under way stays until it is handed in, whatever day it began.
  if (UNDER_WAY.has(task.status)) return "under_way";

  const start = time(task.scheduledAt);
  const due = time(task.dueAt);

  // A time range is judged by its window, so one that runs past midnight
  // (20:00 to 02:00) is on the list the whole time it is open.
  if (task.hasTimeRange && start !== null) {
    if (now < start - LEAD_MS) return null;
    if (now < start) return "soon";
    if (due !== null && now > due) return isSameLocalDay(due, now) ? "overdue" : null;
    return "now";
  }

  const anchor = due ?? start;
  if (anchor === null || !isSameLocalDay(anchor, now)) return null;
  // Only a deadline: it can be done any time today, and is late once that passes.
  if (due !== null && now > due) return "overdue";
  return "now";
}

/** The tasks to show, most pressing first. */
export function focusTasks<T extends FocusTask>(tasks: T[], now: number = Date.now()): T[] {
  const placed = tasks.flatMap((task) => {
    const group = focusGroup(task, now);
    return group ? [{ task, group }] : [];
  });
  const dueOf = (t: FocusTask) => time(t.dueAt) ?? time(t.scheduledAt) ?? Number.MAX_SAFE_INTEGER;
  placed.sort(
    (a, b) =>
      GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
      (PRIORITY_RANK[a.task.priority ?? ""] ?? 1) - (PRIORITY_RANK[b.task.priority ?? ""] ?? 1) ||
      dueOf(a.task) - dueOf(b.task),
  );
  return placed.map((entry) => entry.task);
}
