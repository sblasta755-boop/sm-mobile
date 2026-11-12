import type { TimesheetDay } from "@/api/client";
import { addDays, dateKey, dayLabel, formatDuration, groupPeople, isIncomplete, needsCheck, startOfWeek, weekLabel } from "./timesheet";

const day = (over: Partial<TimesheetDay>): TimesheetDay => ({
  id: "d1",
  userId: "u1",
  siteId: "s1",
  workDate: "2026-11-09",
  clockInAt: "2026-11-09T07:00:00Z",
  clockOutAt: "2026-11-09T15:00:00Z",
  exceptions: [],
  approvalState: "pending",
  ...over,
});

describe("weeks", () => {
  it("starts on the Sunday on or before the date", () => {
    expect(dateKey(startOfWeek(new Date(2026, 10, 12)))).toBe("2026-11-08"); // Thursday 12 Nov
    expect(dateKey(startOfWeek(new Date(2026, 10, 8)))).toBe("2026-11-08"); // a Sunday stays put
  });
  it("steps whole weeks and labels them", () => {
    const start = startOfWeek(new Date(2026, 10, 12));
    expect(dateKey(addDays(start, -7))).toBe("2026-11-01");
    expect(weekLabel(start)).toBe("8 - 14 Nov 2026");
    expect(weekLabel(new Date(2026, 9, 25))).toBe("25 - 31 Oct 2026");
  });
  it("labels a week that spans two months", () => {
    expect(weekLabel(new Date(2026, 9, 25 + 3))).toBe("28 Oct - 3 Nov 2026");
  });
});

describe("formatting", () => {
  it("shows minutes as hours and minutes, and a missing value as a dash", () => {
    expect(formatDuration(538)).toBe("8h 58m");
    expect(formatDuration(34)).toBe("34m");
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(undefined)).toBe("-");
  });
  it("labels a work date", () => {
    expect(dayLabel("2026-11-08")).toMatch(/8/);
  });
});

describe("what needs a look", () => {
  it("flags a missing clock-out or any exception", () => {
    expect(isIncomplete(day({ clockOutAt: null }))).toBe(true);
    expect(needsCheck(day({}))).toBe(false);
    expect(needsCheck(day({ exceptions: ["LATE"] }))).toBe(true);
    expect(needsCheck(day({ clockInAt: undefined }))).toBe(true);
  });
});

describe("groupPeople", () => {
  it("groups a person's days together, sorted A to Z, with an id fallback for no name", () => {
    const people = groupPeople([
      day({ id: "1", userId: "u2", userName: "Zola" }),
      day({ id: "2", userId: "u1", userName: "Anele" }),
      day({ id: "3", userId: "u2", userName: "Zola" }),
      day({ id: "4", userId: "u9", userName: null }),
    ]);
    expect(people.map((p) => p.name)).toEqual(["Anele", "u9", "Zola"]);
    expect(people[2].rows.map((r) => r.id)).toEqual(["1", "3"]);
  });
});
