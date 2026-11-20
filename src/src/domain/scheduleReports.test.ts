import type { LeaveRequest, StaffBooking } from "@/api/client";
import {
  addDays,
  buildScheduleReport,
  csvSafe,
  flattenReport,
  reportCsv,
  hoursBetween,
  monthRange,
  reportRange,
  weekStart,
} from "./scheduleReports";

const booking = (over: Partial<StaffBooking>): StaffBooking =>
  ({
    id: "b1",
    siteId: "s1",
    site: { id: "s1", name: "Drama Bar", address: "", latitude: null, longitude: null },
    userId: "u1",
    userName: "Wesley",
    date: "2026-11-16",
    startTime: "08:00",
    endTime: "16:00",
    shiftIds: [],
    shiftNames: ["Day"],
    instructions: "",
    status: "booked",
    notified: [],
    bookedBy: "m",
    tasks: [],
    ...over,
  }) as StaffBooking;

const base = {
  siteName: "Drama Bar",
  date: "2026-11-18",
  start: "2026-11-01",
  end: "2026-11-30",
  leave: [] as LeaveRequest[],
  roles: { u1: "cleaner", u2: "supervisor" },
  shifts: [],
};

describe("dates", () => {
  it("finds Monday and the month", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(monthRange("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(reportRange("weekly", "2026-11-18", "", "")).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
  });
  it("counts a shift that ends past midnight", () => {
    expect(hoursBetween("22:00", "06:00")).toBe(8);
    expect(hoursBetween(null, "06:00")).toBeNull();
  });
});

describe("buildScheduleReport", () => {
  it("weekly groups by date and leaves out cancelled and other weeks", () => {
    const r = buildScheduleReport({
      ...base,
      kind: "weekly",
      bookings: [
        booking({ id: "a" }),
        booking({ id: "b", userId: "u2", userName: "Ann", date: "2026-11-17" }),
        booking({ id: "c", status: "cancelled" }),
        booking({ id: "d", date: "2026-11-30" }),
      ],
    });
    expect(r.groups.map((g) => g.rows.length)).toEqual([1, 1]);
    expect(r.kpis[0].value).toBe("2");
    expect(r.kpis[3].value).toBe("16");
    expect(flattenReport(r).rows).toHaveLength(2);
  });
  it("takes hours from the named shift when the booking has none", () => {
    const r = buildScheduleReport({
      ...base,
      kind: "daily",
      date: "2026-11-16",
      shifts: [{ id: "sh", startTime: "06:00", endTime: "14:00" }],
      bookings: [booking({ startTime: null, endTime: null, shiftIds: ["sh"] })],
    });
    expect(r.groups[0].rows[0].slice(5, 8)).toEqual(["06:00", "14:00", "8"]);
  });
  it("groups by role and filters one person", () => {
    const bookings = [booking({}), booking({ id: "x", userId: "u2", userName: "Ann" })];
    const role = buildScheduleReport({ ...base, kind: "role", bookings });
    expect(role.groups.map((g) => g.title)).toEqual(["Cleaner", "Supervisor"]);
    const one = buildScheduleReport({ ...base, kind: "individual", userId: "u2", bookings });
    expect(one.groups).toHaveLength(1);
    expect(one.groups[0].rows[0][2]).toBe("Ann");
  });
  it("leave keeps every status and the decision", () => {
    const leave = [
      {
        userName: "Wesley",
        typeName: "Annual",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        halfDay: null,
        days: 3,
        paid: true,
        status: "declined",
        decidedBy: "Boss",
        decidedAt: "2026-11-05T10:00:00Z",
        decisionNote: "Busy week",
        reason: "Trip",
      },
    ] as LeaveRequest[];
    const r = buildScheduleReport({ ...base, kind: "leave", bookings: [], leave });
    expect(r.groups[0].rows[0]).toContain("Declined");
    expect(r.groups[0].rows[0]).toContain("Busy week");
    expect(r.kpis[1].value).toBe("0");
  });
  it("empty period has no groups", () => {
    expect(buildScheduleReport({ ...base, kind: "weekly", bookings: [] }).groups).toEqual([]);
  });
});

describe("csv", () => {
  it("neutralises formulas and adds a BOM", () => {
    expect(csvSafe("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvSafe('say "hi"')).toBe('"say ""hi"""');
    const r = buildScheduleReport({ ...base, kind: "weekly", bookings: [booking({ instructions: "=1+1" })] });
    const csv = reportCsv(r);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=1+1"`);
  });
});

describe("analysis", () => {
  const week = (over: Partial<StaffBooking>[]) =>
    buildScheduleReport({
      ...base,
      kind: "weekly",
      bookings: over.map((o, i) => booking({ id: `x${i}`, ...o })),
    });

  it("lists days with nobody booked and the busiest day", () => {
    const r = week([
      { date: "2026-11-16" },
      { date: "2026-11-16", userId: "u2", userName: "Ann" },
      { date: "2026-11-17" },
    ]);
    expect(r.insights.join(" ")).toContain("Busiest day is Monday 16 Nov");
    expect(r.insights.join(" ")).toContain("No one is booked on 5 days");
    expect(r.charts.map((c) => c.title)).toEqual([
      "Hours booked per day",
      "Shifts by shift",
      "Hours per person",
      "Shifts by role",
    ]);
    expect(r.charts[0].items).toHaveLength(7);
  });
  it("flags weeks over 45 hours and overlapping bookings", () => {
    const long = week(
      ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"].map(
        (date) => ({ date, startTime: "06:00", endTime: "15:00" }),
      ),
    );
    expect(long.insights.join(" ")).toContain("over 45 hours");
    const clash = week([
      { date: "2026-11-16", startTime: "08:00", endTime: "12:00" },
      { id: "z", date: "2026-11-16", startTime: "11:00", endTime: "14:00" },
    ]);
    expect(clash.insights.join(" ")).toContain("1 overlapping booking");
  });
  it("leave shows approval rate, peak overlap and status chart", () => {
    const mk = (id: string, userId: string, status: string, s: string, e: string) =>
      ({ id, userId, userName: userId, typeName: "Annual", startDate: s, endDate: e, days: 2, paid: true, status, halfDay: null, decidedBy: null, decidedAt: null, decisionNote: null, reason: "" }) as unknown as LeaveRequest;
    const r = buildScheduleReport({
      ...base,
      kind: "leave",
      bookings: [],
      leave: [
        mk("1", "a", "approved", "2026-11-16", "2026-11-17"),
        mk("2", "b", "approved", "2026-11-17", "2026-11-18"),
        mk("3", "c", "declined", "2026-11-16", "2026-11-16"),
      ],
    });
    const text = r.insights.join(" ");
    expect(text).toContain("67% of decided");
    expect(text).toContain("most people away at once is 2");
    expect(r.charts[0].items.map((i) => i.label)).toEqual(["Approved", "Declined"]);
  });
  it("empty report has no analysis", () => {
    const r = buildScheduleReport({ ...base, kind: "weekly", bookings: [] });
    expect(r.insights).toEqual([]);
    expect(r.charts).toEqual([]);
  });
});


describe("roster grid", () => {
  it("lays people down the side and the week's days across", () => {
    const report = buildScheduleReport({
      ...base,
      kind: "roster",
      bookings: [
        booking({ id: "1", userId: "u1", userName: "Wesley", date: "2026-11-16" }),
        booking({ id: "2", userId: "u1", userName: "Wesley", date: "2026-11-18", shiftNames: [], startTime: "09:00", endTime: "13:00" }),
        booking({ id: "3", userId: "u2", userName: "Anele", date: "2026-11-18" }),
        booking({ id: "4", userId: "u2", userName: "Anele", date: "2026-11-19", status: "cancelled" }),
      ],
    });
    expect(report.header).toEqual(["Person", "Role", "Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20", "Sat 21", "Sun 22", "Hours"]);
    const rows = report.groups[0].rows;
    expect(rows.map((r) => r[0])).toEqual(["Anele", "Wesley"]);
    // Wesley: Day on Monday, 09:00-13:00 on Wednesday, nothing else; 8 + 4 hours.
    expect(rows[1]).toEqual(["Wesley", "Cleaner", "Day", "", "09:00-13:00", "", "", "", "", "12"]);
    // A cancelled booking leaves the cell blank.
    expect(rows[0][5]).toBe("");
    expect(report.kpis[0]).toEqual({ label: "People", value: "2" });
  });
  it("is a Monday to Sunday week whichever day is chosen", () => {
    expect(reportRange("roster", "2026-11-18", "", "")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
});
