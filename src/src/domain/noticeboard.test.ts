import type { Notice } from "@/api/client";
import {
  agendaGroups,
  audienceCount,
  emptyAudience,
  emptyNotice,
  noticeProblem,
  weekdayOf,
  whenTextOf,
} from "./noticeboard";

const people = [
  { id: "a", role: "cleaner", siteIds: ["s1"] },
  { id: "b", role: "cleaner", siteIds: ["s2"] },
  { id: "c", role: "supervisor", siteIds: ["s1"] },
  { id: "d", role: "cleaner", siteIds: ["s1"], status: "Suspended" },
];

describe("audienceCount", () => {
  it("counts a site on its own", () => {
    expect(audienceCount({ ...emptyAudience(), siteIds: ["s1"] }, people)).toBe(2);
  });
  it("narrows sites and roles together", () => {
    expect(audienceCount({ ...emptyAudience(), siteIds: ["s1"], roles: ["cleaner"] }, people)).toBe(
      1,
    );
  });
  it("adds named people and leaves out the author", () => {
    expect(
      audienceCount({ ...emptyAudience(), roles: ["supervisor"], userIds: ["b"] }, people, "c"),
    ).toBe(1);
  });
  it("everyone means every active person", () => {
    expect(audienceCount({ ...emptyAudience(), all: true }, people)).toBe(3);
  });
});

describe("noticeProblem", () => {
  const ok = {
    ...emptyNotice("2026-12-08"),
    title: "Meeting",
    audience: { ...emptyAudience(), all: true },
  };
  it("accepts a complete notice", () => expect(noticeProblem(ok, "2026-12-01")).toBeNull());
  it("needs a title and an audience", () => {
    expect(noticeProblem({ ...ok, title: " " }, "2026-12-01")).toMatch(/title/);
    expect(noticeProblem({ ...ok, audience: emptyAudience() }, "2026-12-01")).toMatch(/who/i);
  });
  it("rejects a date that has passed and a repeat with no end", () => {
    expect(noticeProblem(ok, "2026-12-09")).toMatch(/passed/);
    expect(
      noticeProblem({ ...ok, recurrence: { weekdays: [1], until: "" } }, "2026-12-01"),
    ).toMatch(/repeat ends/);
  });
});

describe("dates", () => {
  it("numbers weekdays from Monday", () => {
    expect(weekdayOf("2026-12-07")).toBe(0);
    expect(weekdayOf("2026-12-08")).toBe(1);
    expect(weekdayOf("2026-12-13")).toBe(6);
  });
  it("groups the agenda by day with undated notices last", () => {
    const n = (id: string, nextDate: string | null) => ({ id, nextDate }) as Notice;
    const groups = agendaGroups([
      n("a", null),
      n("b", "2026-12-09"),
      n("c", "2026-12-08"),
      n("d", "2026-12-08"),
    ]);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ["2026-12-08", 2],
      ["2026-12-09", 1],
      ["always", 1],
    ]);
  });
});

describe("whenTextOf", () => {
  it("words a single day, a range, a repeat and nothing", () => {
    const base = { startDate: null, endDate: null, startTime: null, endTime: null, recurrence: null };
    expect(whenTextOf(base)).toBe("");
    expect(whenTextOf({ ...base, startDate: "2026-12-08", startTime: "08:00", endTime: "09:00" })).toBe("Tue 8 Dec 08:00-09:00");
    expect(whenTextOf({ ...base, startDate: "2026-12-08", endDate: "2026-12-10" })).toBe("Tue 8 Dec to Thu 10 Dec");
    expect(whenTextOf({ ...base, startDate: "2026-12-08", recurrence: { weekdays: [1, 3], until: "2026-12-22" } })).toBe("Every Tue, Thu");
  });
});
