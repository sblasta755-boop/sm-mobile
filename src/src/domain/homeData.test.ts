import { activityMap, attentionSummary, completion, dayKey, flowSeries, heatColumns, lastDays, qualitySummary } from "./homeData";

const now = new Date(2026, 10, 17, 14, 0, 0);
const at = (daysAgo: number, hour = 9) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

test("completion is done over all, rounded, and 0 with no tasks", () => {
  expect(completion([{ status: "approved" }, { status: "closed" }, { status: "assigned" }])).toEqual({ done: 2, total: 3, pct: 67 });
  expect(completion([])).toEqual({ done: 0, total: 0, pct: 0 });
});

test("lastDays ends today, oldest first", () => {
  const d = lastDays(7, now);
  expect(d).toHaveLength(7);
  expect(dayKey(d[6])).toBe("2026-11-17");
  expect(dayKey(d[0])).toBe("2026-11-11");
});

test("flowSeries counts done tasks on their scheduled day, falling back to created", () => {
  const s = flowSeries(
    [
      { status: "approved", scheduledAt: at(0) },
      { status: "closed", scheduledAt: at(0, 16) },
      { status: "approved", createdAt: at(2) },
      { status: "assigned", scheduledAt: at(0) },
      { status: "approved", scheduledAt: at(40) },
      { status: "approved" },
    ],
    7,
    now,
  );
  expect(s[6].count).toBe(2);
  expect(s[4].count).toBe(1);
  expect(s.reduce((a, p) => a + p.count, 0)).toBe(3);
});

test("activityMap scales levels to the busiest day, and splits into weeks", () => {
  const tasks = [
    ...Array.from({ length: 4 }, () => ({ status: "assigned", scheduledAt: at(0) })),
    { status: "assigned", scheduledAt: at(1) },
    { status: "assigned", scheduledAt: at(1) },
    { status: "assigned", scheduledAt: at(2) },
  ];
  const m = activityMap(tasks, 7, now);
  expect(m[6]).toMatchObject({ count: 4, level: 4 });
  expect(m[5]).toMatchObject({ count: 2, level: 2 });
  expect(m[4]).toMatchObject({ count: 1, level: 1 });
  expect(m[0]).toMatchObject({ count: 0, level: 0 });
  expect(activityMap([], 30, now).every((d) => d.level === 0)).toBe(true);
  const cols = heatColumns(activityMap([], 30, now));
  expect(cols).toHaveLength(5);
  expect(cols[4]).toHaveLength(2);
});

test("qualitySummary rates passes in the window and counts corrective actions now", () => {
  const q = qualitySummary(
    [
      { status: "passed", score: 90, createdAt: at(1) },
      { status: "closed", score: 80, createdAt: at(2) },
      { status: "failed", score: 40, createdAt: at(3) },
      { status: "passed", score: 100, createdAt: at(200) },
      { status: "open", createdAt: at(1) },
    ],
    [{ status: "open" }, { status: "overdue" }, { status: "closed" }],
    30,
    now,
  );
  expect(q).toMatchObject({ passed: 2, failed: 1, passRate: 67, openActions: 2, overdueActions: 1, avgScore: 70 });
  expect(qualitySummary([], [], 30, now)).toMatchObject({ passRate: 0, avgScore: 0 });
});

test("attentionSummary counts open overdue tasks, how late the oldest is, and across how many sites", () => {
  expect(
    attentionSummary(
      [
        { status: "assigned", scheduledAt: at(27), siteId: "s1" },
        { status: "in_progress", scheduledAt: at(3), siteId: "s2" },
        { status: "approved", scheduledAt: at(50), siteId: "s1" },
        { status: "assigned", scheduledAt: new Date(now.getTime() + 3_600_000).toISOString() },
      ],
      now,
    ),
  ).toEqual({ overdue: 2, oldestDays: 27, sites: 2 });
  expect(attentionSummary([], now)).toEqual({ overdue: 0, oldestDays: 0, sites: 0 });
});
