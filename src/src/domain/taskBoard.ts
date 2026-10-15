// Search, filtering and Kanban columns for task lists. Mirrored in the web
// app at smart-property-operations/src/src/lib/smartclean/taskBoard.ts - keep both in sync.

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  locationName?: string | null;
  dueAt?: string | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  isSupervisorTask?: boolean;
  isSiteWide?: boolean;
  tags?: string[];
}

export type TaskSort =
  | "default"
  | "due_asc"
  | "due_desc"
  | "created_desc"
  | "created_asc"
  | "title_asc"
  | "title_desc"
  | "priority";

/** The orders a task list can be put in; "default" keeps the list as it came. */
export const TASK_SORT_OPTIONS: { value: TaskSort; label: string }[] = [
  { value: "default", label: "Default order" },
  { value: "due_asc", label: "Due soonest" },
  { value: "due_desc", label: "Due latest" },
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "title_asc", label: "A to Z" },
  { value: "title_desc", label: "Z to A" },
  { value: "priority", label: "Priority" },
];

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function time(value?: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** A sorted copy. Tasks missing the sorted-on value go last; ties keep their order. */
export function sortTasks<T extends BoardTask>(tasks: T[], sort: TaskSort): T[] {
  if (sort === "default") return tasks;
  const due = (t: T) => time(t.dueAt ?? t.scheduledAt);
  const created = (t: T) => time(t.createdAt);
  const withNullsLast = (get: (t: T) => number | null, dir: 1 | -1) => (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  };
  const byTitle = (dir: 1 | -1) => (a: T, b: T) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) * dir;
  const compare: Record<Exclude<TaskSort, "default">, (a: T, b: T) => number> = {
    due_asc: withNullsLast(due, 1),
    due_desc: withNullsLast(due, -1),
    created_desc: withNullsLast(created, -1),
    created_asc: withNullsLast(created, 1),
    title_asc: byTitle(1),
    title_desc: byTitle(-1),
    priority: (a, b) =>
      (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3) ||
      withNullsLast(due, 1)(a, b),
  };
  // Array.sort is stable, so equal tasks keep the order they had.
  return [...tasks].sort(compare[sort]);
}

export type PriorityFilter = "all" | "high" | "medium" | "low";

export interface TaskFilters {
  query: string;
  priority: PriorityFilter;
  /** Only tasks past their due time that are not finished. */
  overdueOnly: boolean;
  /** Tasks carrying ANY of these tags (compared ignoring case); empty means all. */
  tags: string[];
  /** How the list is ordered. */
  sort: TaskSort;
}

export const NO_FILTERS: TaskFilters = { query: "", priority: "all", overdueOnly: false, tags: [], sort: "default" };

export function filtersActive(filters: TaskFilters): boolean {
  return filters.query.trim() !== "" || filters.priority !== "all" || filters.overdueOnly || filters.tags.length > 0 || filters.sort !== "default";
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
  const matching = tasks.filter(
    (task) =>
      matchesQuery(task, filters.query, extra(task)) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (!filters.overdueOnly || isOverdue(task, now)) &&
      hasAnyTag(task, filters.tags),
  );
  return sortTasks(matching, filters.sort);
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
