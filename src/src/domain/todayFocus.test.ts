import { focusGroup, focusTasks, type FocusTask } from "./todayFocus";

const at = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00`).getTime();
const iso = (hhmm: string) => new Date(`2026-10-15T${hhmm}:00`).toISOString();
const task = (id: string, over: Partial<FocusTask> = {}): FocusTask => ({
  id,
  status: "assigned",
  scheduledAt: iso("06:00"),
  dueAt: iso("17:00"),
  ...over,
});

describe("focusGroup", () => {
  const now = at("10:00");
  it("drops finished and handed-in work", () => {
    for (const status of ["approved", "closed", "submitted", "awaiting_inspection", "cancelled"]) {
      expect(focusGroup(task("a", { status }), now)).toBeNull();
    }
  });
  it("keeps work under way", () => {
    expect(focusGroup(task("a", { status: "in_progress", dueAt: iso("09:00") }), now)).toBe("under_way");
    expect(focusGroup(task("a", { status: "rework_required" }), now)).toBe("under_way");
  });
  it("shows a deadline task today, and as overdue once it has passed", () => {
    expect(focusGroup(task("a"), now)).toBe("now");
    expect(focusGroup(task("a", { dueAt: iso("09:30") }), now)).toBe("overdue");
  });
  it("hides tasks for another day", () => {
    const tomorrow = new Date("2026-10-16T09:00:00").toISOString();
    expect(focusGroup(task("a", { scheduledAt: tomorrow, dueAt: tomorrow }), now)).toBeNull();
  });
  it("follows a time range: soon within an hour, now inside it, overdue after it", () => {
    const range = { hasTimeRange: true, scheduledAt: iso("14:00"), dueAt: iso("15:00") };
    expect(focusGroup(task("a", range), at("11:00"))).toBeNull();
    expect(focusGroup(task("a", range), at("13:30"))).toBe("soon");
    expect(focusGroup(task("a", range), at("14:30"))).toBe("now");
    expect(focusGroup(task("a", range), at("15:30"))).toBe("overdue");
  });
});

describe("focusTasks", () => {
  it("orders under way, overdue, now, then soon, by priority then time", () => {
    const now = at("10:00");
    const list = [
      task("later-now", { dueAt: iso("16:00") }),
      task("soon", { hasTimeRange: true, scheduledAt: iso("10:30"), dueAt: iso("11:30") }),
      task("overdue", { dueAt: iso("09:00") }),
      task("going", { status: "in_progress" }),
      task("urgent-now", { dueAt: iso("17:00"), priority: "high" }),
      task("done", { status: "approved" }),
    ];
    expect(focusTasks(list, now).map((t) => t.id)).toEqual([
      "going",
      "overdue",
      "urgent-now",
      "later-now",
      "soon",
    ]);
  });
});
