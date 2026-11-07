import { parseAmount, parseLocalDateTime } from "./maintenance";

describe("parseLocalDateTime", () => {
  it("reads a date and time as local time", () => {
    const d = parseLocalDateTime("2026-11-12 09:30");
    expect(d && [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 12, 9, 30]);
    expect(parseLocalDateTime("2026-11-12T09:30")).not.toBeNull();
  });
  it("rejects what is not a real date and time", () => {
    for (const bad of ["", "tomorrow", "2026-02-31 10:00", "2026-11-12 25:00", "2026-11-12 10:75", "2026-11-12", "12/11/2026 09:30"]) {
      expect(parseLocalDateTime(bad)).toBeNull();
    }
  });
});

describe("parseAmount", () => {
  it("accepts plain, comma-decimal and spaced amounts", () => {
    expect(parseAmount("1250.5")).toBe(1250.5);
    expect(parseAmount("1 250,50")).toBe(1250.5);
    expect(parseAmount(" 400 ")).toBe(400);
  });
  it("rejects zero, negatives and words", () => {
    for (const bad of ["", "0", "-5", "abc", "12abc", "1.2.3"]) expect(parseAmount(bad)).toBeNull();
  });
});

import { hasMaintenanceAccess } from "./maintenance";

describe("hasMaintenanceAccess", () => {
  it("is always on for administrators and operations managers", () => {
    expect(hasMaintenanceAccess({ role: "org_admin" })).toBe(true);
    expect(hasMaintenanceAccess({ role: "operations_manager" })).toBe(true);
  });
  it("is off for everyone else until something is given", () => {
    for (const role of ["site_manager", "supervisor", "cleaner", "waiter"]) {
      expect(hasMaintenanceAccess({ role })).toBe(false);
      expect(hasMaintenanceAccess({ role, maintenance: {} })).toBe(false);
      expect(hasMaintenanceAccess({ role, maintenance: { access: false, handle: false } })).toBe(false);
    }
    expect(hasMaintenanceAccess(null)).toBe(false);
  });
  it("turns on with any one grant", () => {
    for (const key of ["access", "handle", "approve", "pay"] as const) {
      expect(hasMaintenanceAccess({ role: "cleaner", maintenance: { [key]: true } })).toBe(true);
    }
  });
});

import { nextStep, sortJobs } from "./maintenance";

const j = (over: Record<string, unknown> = {}) =>
  ({ state: "reported", path: "contractor", activeHolds: 0, clearedToProceed: false, clearedBlockers: [], visitAt: null, severity: "medium", updatedAt: "2026-11-01T00:00:00Z", ...over }) as Parameters<typeof nextStep>[0];

describe("nextStep", () => {
  const handler = { handle: true, approve: false, pay: false };
  it("is on you only when you can act", () => {
    expect(nextStep(j(), handler).tone).toBe("yours");
    expect(nextStep(j(), undefined).tone).toBe("waiting");
    expect(nextStep(j({ state: "awaiting_approval" }), { handle: false, approve: true, pay: false }).tone).toBe("yours");
  });
  it("a hold outranks the stage, and a not-cleared approved job says why", () => {
    expect(nextStep(j({ state: "approved", activeHolds: 1 }), handler).tone).toBe("blocked");
    expect(nextStep(j({ state: "approved", clearedBlockers: ["Deposit not paid."] }), handler).text).toBe("Deposit not paid.");
  });
  it("closed jobs are done", () => {
    expect(nextStep(j({ state: "completed" }), handler).tone).toBe("done");
  });
});

describe("sortJobs", () => {
  it("critical first, then yours, then newest", () => {
    const a = j({ state: "in_progress", updatedAt: "2026-11-05T00:00:00Z", id: "a" });
    const b = j({ state: "reported", id: "b" });
    const c = j({ state: "in_progress", severity: "critical", updatedAt: "2026-10-01T00:00:00Z", id: "c" });
    expect((sortJobs([a, b, c], { handle: true, approve: false, pay: false }) as unknown as { id: string }[]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
