// What the Home screen lists, once the person's saved filters are applied.
//
// Home is "what do I do now", so a filter left on from earlier (say Opening, set at 7am) must never be
// able to hide tonight's Closing tasks without saying so. The tasks passed in are already the ones that
// are due now (domain/todayFocus.ts); a filter can narrow them, but if it would leave nothing the
// person sees the due-now tasks anyway, flagged, with a way to clear the filter.

import { filterTasks, filtersActive, NO_FILTERS, sortTasks, type BoardTask, type TaskFilters } from "./taskBoard";
import { focusGroup, type FocusTask } from "./todayFocus";

export interface HomeTaskView<T> {
  /** What to list. */
  list: T[];
  /** Due-now tasks the filter is hiding while other tasks are shown. */
  hiddenCount: number;
  /** The filter matched nothing, so everything due now is listed instead. */
  relaxed: boolean;
}

export function homeTaskView<T extends BoardTask>(due: T[], filters: TaskFilters, now: Date = new Date()): HomeTaskView<T> {
  if (!filtersActive(filters) || due.length === 0) return { list: filterTasks(due, filters, undefined, now), hiddenCount: 0, relaxed: false };
  const kept = filterTasks(due, filters, undefined, now);
  if (kept.length === 0) {
    // Show them, in the order the person chose, but not narrowed.
    return { list: sortTasks(due, filters.sort), hiddenCount: 0, relaxed: true };
  }
  return { list: kept, hiddenCount: due.length - kept.length, relaxed: false };
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "21:00 - 02:00" for a task with a work window, or null for one with only a deadline. */
export function timeWindowLabel(task: { hasTimeRange?: boolean; scheduledAt?: string | null; dueAt?: string | null }): string | null {
  if (!task.hasTimeRange || !task.scheduledAt || !task.dueAt) return null;
  if (Number.isNaN(Date.parse(task.scheduledAt)) || Number.isNaN(Date.parse(task.dueAt))) return null;
  return `${clock(task.scheduledAt)} - ${clock(task.dueAt)}`;
}

/** "Starts at 21:00" while a windowed task is listed ahead of its start, otherwise null. */
export function startsAtLabel(task: FocusTask, now: number = Date.now()): string | null {
  if (!task.scheduledAt || focusGroup(task, now) !== "soon") return null;
  return `Starts at ${clock(task.scheduledAt)}`;
}

export { NO_FILTERS };
