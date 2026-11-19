import type { AttDay } from "./attendanceReports";
import { buildOvertimeReport, type OtRequest, type OvertimeReportInput } from "./overtimeReports";

const day = (over: Partial<AttDay>): AttDay => ({
  id: "day1",
  userId: "u1",
  userName: "Lerato",
  workDate: "2026-11-05",
  clockInAt: "2026-11-05T08:00:00Z",
  clockOutAt: "2026-11-05T16:30:00Z",
  workedMinutes: 510,
  expectedStart: "10:00",
  expectedEnd: "18:00",
  exceptions: [],
  approvalState: "pending",
  ...over,
});
const req = (over: Partial<OtRequest>): OtRequest => ({
  id: "req000001",
  userId: "u1",
  userName: "Lerato",
  dayId: "day1",
  shiftEndAt: "2026-11-05T16:00:00Z",
  requestedAt: "2026-11-05T15:55:00Z",
  reason: "Extra closing assistance",
  status: "approved",
  approverTier: "supervisor",
  decidedBy: "R. Sekhukhune",
  decidedAt: "2026-11-05T17:25:00Z",
  decisionNote: null,
  ...over,
});
const base: OvertimeReportInput = {
  kind: "hours",
  siteName: "Drama Bar",
  start: "2026-11-01",
  end: "2026-11-30",
  nowIso: "2026-11-06T10:00:00Z",
  requests: [],
  days: [],
};

describe("overtime hours report", () => {
  it("joins the shift and counts extra hours past shift end", () => {
    const r = buildOvertimeReport({ ...base, requests: [req({})], days: [day({})] });
    expect(r.groups).toHaveLength(1);
    const row = r.groups[0].rows[0];
    expect(row[0]).toBe("OT-000001");
    expect(row.slice(2, 8)).toEqual(["2026-11-05", "10:00-18:00", "8", "8.5", "0.5", "Extra closing assistance"]);
    expect(row[8]).toBe("Approved");
    expect(r.kpis.map((k) => k.value)).toEqual(["1", "0.5", "1", "0"]);
  });
  it("groups by status, labels who a pending request waits on, blanks rejected extra hours", () => {
    const r = buildOvertimeReport({
      ...base,
      requests: [
        req({}),
        req({ id: "req000002", userId: "u2", userName: "Sipho", dayId: "day2", status: "awaiting_approval", decidedBy: null, decidedAt: null, approverTier: "site_manager" }),
        req({ id: "req000003", userId: "u3", userName: "Palesa", dayId: "day3", status: "declined", decisionNote: "Not pre-authorised" }),
      ],
      days: [day({}), day({ id: "day2", userId: "u2", userName: "Sipho", clockOutAt: null, workedMinutes: null }), day({ id: "day3", userId: "u3", userName: "Palesa" })],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["Pending (1)", "Approved (1)", "Rejected (1)"]);
    expect(r.groups[0].rows[0][8]).toBe("Pending site manager");
    expect(r.groups[2].rows[0][6]).toBe("");
    expect(r.insights.join(" ")).toContain("1 request still need a decision");
    expect(r.insights.join(" ")).toContain("50% of decided");
  });
  it("leaves out requests from other periods and has no analysis when empty", () => {
    expect(buildOvertimeReport({ ...base, requests: [req({})], days: [day({ workDate: "2026-10-31" })] }).groups).toEqual([]);
    const e = buildOvertimeReport(base);
    expect(e.insights).toEqual([]);
    expect(e.charts).toEqual([]);
  });
  it("flags repeated requests and repeated reasons", () => {
    const requests = [1, 2, 3].map((n) => req({ id: `req00000${n}`, dayId: `d${n}` }));
    const days = [1, 2, 3].map((n) => day({ id: `d${n}`, workDate: `2026-11-0${n}` }));
    const r = buildOvertimeReport({ ...base, requests, days });
    expect(r.insights.join(" ")).toContain("asked for overtime 3 times");
    expect(r.insights.join(" ")).toContain("most repeated reason");
  });
});

describe("overtime register", () => {
  it("shows the decision trail and how fast it was made", () => {
    const r = buildOvertimeReport({ ...base, kind: "register", requests: [req({ decisionNote: "Approved 06 Nov" })], days: [day({})] });
    const row = r.groups[0].rows[0];
    expect(row[6]).toBe("Approved");
    expect(row[7]).toBe("R. Sekhukhune");
    expect(row[9]).toBe("0.5");
    expect(row[10]).toBe("Approved 06 Nov");
    expect(r.kpis[3].value).toBe("1.5 h");
    expect(r.charts.map((c) => c.title)).toContain("How fast requests were decided");
  });
});
