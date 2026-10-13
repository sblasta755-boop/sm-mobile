// Search, filtering and Kanban columns for task lists. Mirrored in the web
// app at smart-property-operations/src/src/lib/smartclean/taskBoard.ts - keep both in sync.

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  locationName?: string | null;
  dueAt?: string | null;
  isSupervisorTask?: boolean;
  isSiteWide?: boolean;
  tags?: string[];
}

export type PriorityFilter = "all" | "high" | "medium" | "low";

export interface TaskFilters {
  query: string;
  priority: PriorityFilter;
  /** Only tasks past their due time that are not finished. */
  overdueOnly: boolean;
  /** Tasks carrying ANY of these tags (compared ignoring case); empty means all. */
  tags: string[];
}

export const NO_FILTERS: TaskFilters = { query: "", priority: "all", overdueOnly: false, tags: [] };

export function filtersActive(filters: TaskFilters): boolean {
  return filters.query.trim() !== "" || filters.priority !== "all" || filters.overdueOnly || filters.tags.length > 0;
}

const FINISHED = new Set(["approved", "closed", "cancelled"]);

export function isOverdue(task: BoardTask, now: Date = new Date()): boolean {
  if (!task.dueAt || FINISHED.has(task.status)) return false;
  return new Date(task.dueAt).getTime() < now.getTime();
}

/** Every word typed must appear somewhere in the task's searchable text, in any order. */
export function matchesQuery(task: BoardTask, query: string, extra = ""): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    task.title,
    task.locationName ?? (task.isSiteWide ? "whole site" : ""),
    task.priority ?? "",
    task.status.replace(/_/g, " "),
    task.isSupervisorTask ? "supervisor task" : "",
    (task.tags ?? []).join(" "),
    extra,
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function hasAnyTag(task: BoardTask, wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const have = new Set((task.tags ?? []).map((t) => t.toLowerCase()));
  return wanted.some((t) => have.has(t.toLowerCase()));
}

/** Every tag used by these tasks, once each (first spelling wins), in name order. */
export function tagsOf(tasks: BoardTask[]): string[] {
  const seen = new Map<string, string>();
  for (const task of tasks) for (const tag of task.tags ?? []) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function filterTasks<T extends BoardTask>(
  tasks: T[],
  filters: TaskFilters,
  /** Extra searchable text per task, e.g. the assignee's name. */
  extra: (task: T) => string = () => "",
  now: Date = new Date(),
): T[] {
  return tasks.filter(
    (task) =>
      matchesQuery(task, filters.query, extra(task)) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (!filters.overdueOnly || isOverdue(task, now)) &&
      hasAnyTag(task, filters.tags),
  );
}

export interface BoardColumn {
  key: string;
  label: string;
  statuses: string[];
}

/** The Kanban columns, left to right - the life of a task. */
export const BOARD_COLUMNS: BoardColumn[] = [
  { key: "todo", label: "To do", statuses: ["assigned", "not_started", "scheduled"] },
  { key: "doing", label: "In progress", statuses: ["in_progress"] },
  { key: "review", label: "In review", statuses: ["submitted", "resubmitted", "awaiting_inspection"] },
  { key: "rework", label: "Rework", statuses: ["rework_required"] },
  { key: "done", label: "Done", statuses: ["approved", "closed"] },
];

export function boardColumns<T extends BoardTask>(tasks: T[]): { column: BoardColumn; items: T[] }[] {
  return BOARD_COLUMNS.map((column) => ({
    column,
    items: tasks.filter((task) => column.statuses.includes(task.status)),
  }));
}
