import {
  actorName,
  attentionList,
  attentionReason,
  groupByDay,
  signupPointText,
  paidCount,
  signupSeries,
  signupsTotal,
  timeAgo,
} from "./platformHome";

const NOW = new Date("2026-11-04T20:00:00");
const org = (id: string, status: string, trialEndsAt: string | null = null) => ({
  id,
  name: id,
  userCount: 3,
  subscription: { tier: "starter", tierLabel: null, status, trialEndsAt },
});

test("an organisation with nothing wrong is not flagged", () => {
  expect(attentionReason(org("a", "active"), NOW.getTime())).toBeNull();
  expect(attentionReason(org("b", "trialing", "2026-11-20T00:00:00"), NOW.getTime())).toBeNull();
});

test("suspended, overdue and ending trials are flagged with a reason, worst first", () => {
  const list = attentionList(
    [org("trial", "trialing", "2026-11-05T12:00:00"), org("late", "past_due"), org("off", "suspended"), org("ok", "active")],
    NOW.getTime(),
  );
  expect(list.map((x) => x.org.id)).toEqual(["off", "late", "trial"]);
  expect(list.map((x) => x.reason)).toEqual(["Suspended", "Payment overdue", "Trial ends in 1 day"]);
  expect(list.map((x) => x.tone)).toEqual(["bad", "bad", "warn"]);
});

test("a trial that has ended says so", () => {
  expect(attentionReason(org("t", "trialing", "2026-11-01T00:00:00"), NOW.getTime())).toBe("Trial has ended");
});

test("activity is grouped under Today and Yesterday, keeping order", () => {
  const groups = groupByDay(
    [{ occurredAt: "2026-11-04T18:00:00" }, { occurredAt: "2026-11-04T09:00:00" }, { occurredAt: "2026-11-03T22:00:00" }],
    NOW,
  );
  expect(groups.map((g) => [g.label, g.items.length])).toEqual([["Today", 2], ["Yesterday", 1]]);
});

test("time ago is short, and an actor is a name not an address", () => {
  expect(timeAgo("2026-11-04T19:30:00", NOW.getTime())).toBe("30m");
  expect(timeAgo("2026-11-04T17:00:00", NOW.getTime())).toBe("3h");
  expect(timeAgo("2026-11-01T20:00:00", NOW.getTime())).toBe("3d");
  expect(actorName("nathi@soma360.co.za")).toBe("nathi");
  expect(actorName(null)).toBe("self-serve");
});

test("the signup series covers all 30 days with a running total", () => {
  const s = { totalOrganisations: 22, byTier: { trial: 3 }, byStatus: {}, signupsLast30Days: { "2026-11-04": 2, "2026-10-10": 1 } };
  const series = signupSeries(s, NOW);
  expect(series).toHaveLength(30);
  expect(series[series.length - 1].total).toBe(3);
  expect(signupsTotal(s)).toBe(3);
  expect(paidCount(s)).toBe(19);
});

test("signupPointText says what one day on the curve means", () => {
  expect(signupPointText({ count: 0, total: 4 })).toBe("No signups · 4 in total");
  expect(signupPointText({ count: 2, total: 4 })).toBe("2 new · 4 in total");
});
