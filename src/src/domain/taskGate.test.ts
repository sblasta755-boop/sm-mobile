import { otherActiveTask } from "./taskGate";

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
const t = (over: Record<string, unknown>) => ({
  id: "a", title: "A", status: "in_progress", assigneeId: "u1", scheduledAt: now, ...over,
});

describe("otherActiveTask", () => {
  const target = { id: "b", status: "assigned", qrVerified: false };
  it("blocks while another task of mine is in progress today", () => {
    expect(otherActiveTask([t({})], target, "u1")?.id).toBe("a");
  });
  it("ignores a task already submitted (also a queued submit)", () => {
    expect(otherActiveTask([t({ status: "submitted" })], target, "u1")).toBeUndefined();
  });
  it("ignores a stale in-progress task from a past day", () => {
    expect(otherActiveTask([t({ scheduledAt: yesterday })], target, "u1")).toBeUndefined();
  });
  it("ignores an hourly round whose window has closed", () => {
    expect(otherActiveTask([t({ hourlyComplianceLocked: true })], target, "u1")).toBeUndefined();
  });
  it("ignores other people's tasks", () => {
    expect(otherActiveTask([t({ assigneeId: "u2" })], target, "u1")).toBeUndefined();
  });
});
