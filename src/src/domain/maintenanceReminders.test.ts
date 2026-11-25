import {
  countdown,
  popupQueue,
  priorityChoices,
  priorityRank,
  remindState,
  settingsErrors,
  statusText,
  waitText,
} from "./maintenanceReminders";

const NOW = new Date("2026-11-25T12:00:00Z");
const ok = { ok: true, at: null, reason: "" };
const avail = { low: ok, normal: ok, high: ok, urgent: ok };

describe("maintenanceReminders", () => {
  it("says waits in plain words", () => {
    expect(waitText(4320)).toBe("3 days");
    expect(waitText(1440)).toBe("1 day");
    expect(waitText(240)).toBe("4 hours");
    expect(waitText(70)).toBe("1 hour 10 min");
    expect(waitText(25)).toBe("25 min");
  });

  it("counts down to when a reminder can be sent", () => {
    expect(countdown(null, NOW)).toBe("");
    expect(countdown("2026-11-25T11:00:00Z", NOW)).toBe("");
    expect(countdown("2026-11-25T15:10:00Z", NOW)).toBe("Available in 3 hours 10 min");
  });

  it("words the status chip", () => {
    expect(statusText("pending")).toBe("Waiting for a reply");
    expect(statusText("ignored", "Budget meeting")).toBe("Ignored: Budget meeting");
    expect(statusText("ignored")).toBe("Ignored");
    expect(statusText("resolved")).toBe("Sorted out");
  });

  it("stops people with the most urgent first, then the oldest, and skips what is not a pop-up", () => {
    const rows = [
      { id: "a", priority: "high" as const, popup: true, createdAt: "2026-11-25T08:00:00Z" },
      { id: "b", priority: "urgent" as const, popup: true, createdAt: "2026-11-25T09:00:00Z" },
      { id: "c", priority: "high" as const, popup: true, createdAt: "2026-11-25T07:00:00Z" },
      { id: "d", priority: "normal" as const, popup: false, createdAt: "2026-11-25T06:00:00Z" },
    ];
    expect(popupQueue(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(priorityRank("urgent")).toBeGreaterThan(priorityRank("low"));
  });

  it("offers a priority only when everyone chosen can be sent it, with the reason", () => {
    const targets = [
      { userId: "a", availability: avail },
      {
        userId: "b",
        availability: {
          ...avail,
          normal: { ok: false, at: "2026-11-25T15:10:00Z", reason: "Reminded recently." },
        },
      },
    ];
    expect(priorityChoices(targets, ["a"], NOW).normal.ok).toBe(true);
    const both = priorityChoices(targets, ["a", "b"], NOW);
    expect(both.normal).toEqual({ ok: false, note: "Available in 3 hours 10 min" });
    expect(both.urgent.ok).toBe(true);
    expect(priorityChoices(targets, [], NOW).low.ok).toBe(false);
  });

  it("checks the settings form", () => {
    const good = { low: "4320", normal: "1440", high: "240", urgent: "60", maxPerJobPerDay: "4" };
    expect(settingsErrors(good)).toEqual({});
    expect(Object.keys(settingsErrors({ ...good, low: "x", maxPerJobPerDay: "0" }))).toEqual([
      "low",
      "maxPerJobPerDay",
    ]);
    expect(settingsErrors({ ...good, urgent: "5000" })).toHaveProperty("urgent");
  });

  it("keeps the Remind button visible and says why it is off", () => {
    const base = {
      canSend: true,
      blockedReason: "",
      dailyLeft: 3,
      targets: [{ availability: avail }],
    };
    expect(remindState(base, NOW)).toEqual({ enabled: true, caption: "" });
    expect(
      remindState(
        { ...base, canSend: false, blockedReason: "Nothing is waiting on a payer yet." },
        NOW,
      ),
    ).toEqual({
      enabled: false,
      caption: "Nothing is waiting on a payer yet.",
    });
    expect(remindState({ ...base, dailyLeft: 0 }, NOW).enabled).toBe(false);
    const gap = { ok: false, at: "2026-11-25T15:10:00Z", reason: "Reminded recently." };
    const waiting = {
      ...base,
      targets: [{ availability: { low: gap, normal: gap, high: gap, urgent: gap } }],
    };
    expect(remindState(waiting, NOW)).toEqual({
      enabled: false,
      caption: "Available in 3 hours 10 min",
    });
    const noReply = { ok: false, at: null, reason: "Still waiting" };
    expect(
      remindState(
        {
          ...base,
          targets: [{ availability: { low: noReply, normal: noReply, high: ok, urgent: ok } }],
        },
        NOW,
      ).enabled,
    ).toBe(true);
  });
});
