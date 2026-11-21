import type { AttDay } from "./attendanceReports";
import { buildTimesheetReport, timesheetRange, type TimesheetReportInput, type TsBooking } from "./timesheetReports";

const day = (over: Partial<AttDay>): AttDay => ({
  id: "d",
  userId: "u1",
  userName: "Lerato",
  workDate: "2026-11-16",
  clockInAt: "2026-11-16T08:00:00Z",
  clockOutAt: "2026-11-16T16:00:00Z",
  workedMinutes: 480,
  expectedStart: "10:00",
  expectedEnd: "18:00",
  exceptions: [],
  approvalState: "approved",
  amendments: [],
  segments: [],
  ...over,
});
const booking = (over: Partial<TsBooking>): TsBooking => ({
  userId: "u1",
  userName: "Lerato",
  date: "2026-11-16",
  status: "booked",
  startTime: "10:00",
  endTime: "18:00",
  shiftIds: [],
  shiftNames: ["Day"],
  ...over,
});
const base: TimesheetReportInput = {
  kind: "weekly",
  siteName: "Drama Bar",
  today: "2026-11-20",
  date: "2026-11-18",
  start: "2026-11-16",
  end: "2026-11-22",
  days: [],
  bookings: [],
  leave: [],
  shifts: [],
  roles: { u1: "cleaner", u2: "waiter" },
};

describe("weekly", () => {
  it("builds the day grid with leave, absent and off markers", () => {
    const r = buildTimesheetReport({
      ...base,
      days: [day({}), day({ id: "b", workDate: "2026-11-17", workedMinutes: 300, approvalState: "pending" })],
      bookings: [booking({}), booking({ date: "2026-11-18" })],
      leave: [{ userId: "u1", userName: "Lerato", startDate: "2026-11-19", endDate: "2026-11-19", status: "approved" }],
    });
    expect(timesheetRange("weekly", "2026-11-18", "", "")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(r.header.slice(0, 4)).toEqual(["Employee", "Role", "MON 16 (h)", "TUE 17 (h)"]);
    const row = r.groups[0].rows[0];
    expect(row.slice(2, 9)).toEqual(["8", "5", "ABS", "AL", "OFF", "OFF", "OFF"]);
    expect(row[9]).toBe("13");
    expect(row[10]).toBe("Mixed");
    expect(r.insights.join(" ")).toContain("booked shift had no attendance");
    expect(r.kpis[1].value).toBe("47 / 2026");
  });
  it("empty week has no groups", () => {
    expect(buildTimesheetReport(base).groups).toEqual([]);
  });
});

describe("monthly", () => {
  it("lists every day for one person with approved hours", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "monthly",
      userId: "u1",
      date: "2026-11-10",
      days: [day({}), day({ id: "b", workDate: "2026-11-17", approvalState: "pending" })],
      bookings: [booking({}), booking({ date: "2026-11-17" }), booking({ date: "2026-11-18" })],
    });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rows).toHaveLength(30);
    const rows = r.groups[0].rows;
    expect(rows[15].slice(5)).toEqual(["8", "8", "Approved"]);
    expect(rows[16][7]).toBe("Waiting approval");
    expect(rows[16][6]).toBe("");
    expect(rows[17][7]).toBe("Didn't attend");
    expect(rows[0][2]).toBe("OFF");
  });
});

describe("variance", () => {
  it("compares planned to actual and labels no-shows", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "variance",
      days: [day({ clockInAt: "2026-11-16T07:57:00Z", clockOutAt: "2026-11-16T15:30:00Z", workedMinutes: 420 })],
      bookings: [booking({}), booking({ userId: "u2", userName: "Sipho" }), booking({ userId: "u3", userName: "Future", date: "2026-11-21" })],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["Reviewed (1)", "No show (1)", "Upcoming (1)"]);
    const row = r.groups[0].rows[0];
    expect(row.slice(5, 7)).toEqual(["09:57", "17:30"]);
    expect(row.slice(8, 11)).toEqual(["8", "7", "-1"]);
    expect(r.insights.join(" ")).toContain("44% of plan");
  });
});

describe("audit", () => {
  it("groups by approval state and lists corrections", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "audit",
      days: [
        day({ approvedBy: "Boss", approvedAt: "2026-11-17T10:00:00Z" }),
        day({ id: "p", workDate: "2026-11-17", approvalState: "pending", exceptions: ["LATE"], amendments: [{ field: "clock_in_at", previousValue: "2026-11-17T09:00:00Z", newValue: "2026-11-17T08:00:00Z", reason: "Scanner offline", actorName: "Boss", createdAt: "2026-11-17T12:00:00Z" }] }),
      ],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["Waiting (1)", "Approved (1)"]);
    expect(r.groups[0].rows[0][8]).toContain("Scanner offline");
    expect(r.groups[1].rows[0][5]).toBe("Boss");
    expect(r.insights.join(" ")).toContain("1 manager correction");
    expect(r.insights.join(" ")).toContain("carry exception flags");
  });
});

describe("variance with the server's comparison", () => {
  const split = [
    booking({ id: "b1", startTime: "06:00", endTime: "10:00" }),
    booking({ id: "b2", startTime: "16:00", endTime: "20:00" }),
  ];

  it("keeps a split day's two bookings apart and uses the server's planned hours and outcomes", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "variance",
      days: [
        day({ id: "dA", clockInAt: "2026-11-16T04:00:00Z", clockOutAt: "2026-11-16T08:00:00Z", workedMinutes: 240 }),
      ],
      bookings: split,
      schedule: [
        { bookingId: "b1", dayId: "dA", clockInAt: "2026-11-16T04:00:00Z", clockOutAt: "2026-11-16T08:00:00Z", scheduledMinutes: 240, status: "on_time" },
        { bookingId: "b2", dayId: null, clockInAt: null, clockOutAt: null, scheduledMinutes: null, status: "no_show" },
      ],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["Reviewed (1)", "No show (1)"]);
    expect(r.groups[0].rows[0].slice(8, 10)).toEqual(["4", "4"]);
  });

  it("treats a server no-show as one even on a day that has not finished, and approved leave as leave", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "variance",
      bookings: [booking({ id: "b1", date: "2026-11-20" }), booking({ id: "b2", userId: "u2", userName: "Sipho", date: "2026-11-20" })],
      schedule: [
        { bookingId: "b1", dayId: null, clockInAt: null, clockOutAt: null, scheduledMinutes: null, status: "no_show" },
        { bookingId: "b2", dayId: null, clockInAt: null, clockOutAt: null, scheduledMinutes: null, status: "on_leave" },
      ],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["No show (1)", "Approved leave (1)"]);
  });

  it("falls back to working it out when the server has nothing for a booking", () => {
    const r = buildTimesheetReport({
      ...base,
      kind: "variance",
      days: [day({})],
      bookings: [booking({ id: "b9" })],
      schedule: [],
    });
    expect(r.groups.map((g) => g.title)).toEqual(["Reviewed (1)"]);
  });
});
