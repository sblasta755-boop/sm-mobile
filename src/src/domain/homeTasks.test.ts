import { homeTaskView, startsAtLabel, timeWindowLabel } from "./homeTasks";
import { NO_FILTERS, type TaskFilters } from "./taskBoard";

const task = (id: string, tags: string[], extra: Record<string, unknown> = {}) => ({
  id, title: id, status: "assigned", tags, ...extra,
});
const closing = [task("Bar closing", ["Closing"]), task("Kitchen closing", ["Closing"])];
const opening = task("Bar opening", ["Opening"]);
const filter = (patch: Partial<TaskFilters>): TaskFilters => ({ ...NO_FILTERS, ...patch });

test("no filter lists everything and hides nothing", () => {
  const v = homeTaskView([...closing, opening], NO_FILTERS);
  expect(v.list).toHaveLength(3);
  expect(v.hiddenCount).toBe(0);
  expect(v.relaxed).toBe(false);
});

test("the reported case: an Opening filter left on in the evening, with only Closing tasks due", () => {
  const v = homeTaskView(closing, filter({ tags: ["Opening"] }));
  expect(v.relaxed).toBe(true);
  expect(v.list.map((t) => t.id)).toEqual(["Bar closing", "Kitchen closing"]);
  expect(v.hiddenCount).toBe(0);
});

test("a filter that keeps some tasks shows those and counts the ones it hides", () => {
  const v = homeTaskView([...closing, opening], filter({ tags: ["Opening"] }));
  expect(v.relaxed).toBe(false);
  expect(v.list.map((t) => t.id)).toEqual(["Bar opening"]);
  expect(v.hiddenCount).toBe(2);
});

test("every kind of hiding filter is covered, not only tags", () => {
  expect(homeTaskView(closing, filter({ query: "nothing like this" })).relaxed).toBe(true);
  expect(homeTaskView(closing, filter({ priority: "high" })).relaxed).toBe(true);
  expect(homeTaskView(closing, filter({ overdueOnly: true })).relaxed).toBe(true);
});

test("sort alone hides nothing and is applied", () => {
  const v = homeTaskView([task("b", []), task("a", [])], filter({ sort: "title_asc" }));
  expect(v.list.map((t) => t.id)).toEqual(["a", "b"]);
  expect(v.hiddenCount).toBe(0);
  expect(v.relaxed).toBe(false);
});

test("when relaxed, the person's chosen sort order is kept", () => {
  const v = homeTaskView([task("b", ["Closing"]), task("a", ["Closing"])], filter({ tags: ["Opening"], sort: "title_asc" }));
  expect(v.relaxed).toBe(true);
  expect(v.list.map((t) => t.id)).toEqual(["a", "b"]);
});

test("nothing due and a filter set is simply empty, not relaxed", () => {
  const v = homeTaskView([], filter({ tags: ["Opening"] }));
  expect(v).toEqual({ list: [], hiddenCount: 0, relaxed: false });
});

test("a window reads as start - end, and a deadline-only task has none", () => {
  const range = { hasTimeRange: true, scheduledAt: new Date(2026, 9, 26, 21, 0).toISOString(), dueAt: new Date(2026, 9, 27, 2, 0).toISOString() };
  expect(timeWindowLabel(range)).toBe("21:00 - 02:00");
  expect(timeWindowLabel({ hasTimeRange: false, scheduledAt: range.scheduledAt, dueAt: range.dueAt })).toBeNull();
});

test("a task listed before its window opens says when it starts", () => {
  const start = new Date(2026, 9, 26, 21, 0);
  const t = { id: "x", status: "assigned", hasTimeRange: true, scheduledAt: start.toISOString(), dueAt: new Date(2026, 9, 27, 2, 0).toISOString() };
  expect(startsAtLabel(t, new Date(2026, 9, 26, 20, 15).getTime())).toBe("Starts at 21:00");
  expect(startsAtLabel(t, new Date(2026, 9, 26, 21, 30).getTime())).toBeNull();
});
