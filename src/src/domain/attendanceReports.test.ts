import {
  attendanceCsv,
  buildAttendanceReport,
  earlyMinutes,
  gapMinutes,
  lateMinutes,
  localHm,
  type AttDay,
  type AttendanceReportInput,
} from "./attendanceReports";

// Site time is UTC+2, so 06:00Z is 08:00 on site.
const day = (over: Partial<AttDay>): AttDay => ({
  id: "d1",
  userId: "u1",
  userName: "Wesley",
  workDate: "2026-11-16",
  clockInAt: "2026-11-16T06:00:00Z",
  clockOutAt: "2026-11-16T14:00:00Z",
  workedMinutes: 480,
  expectedStart: "08:00",
  expectedEnd: "16:00",
  exceptions: [],
  source: "scanned",
  clockInMethod: "qr",
  clockOutMethod: "qr",
  approvalState: "pending",
  amendments: [],
  segments: [],
  ...over,
});

const base: AttendanceReportInput = {
  kind: "register",
  siteName: "Drama Bar",
  date: "2026-11-16",
  start: "2026-11-16",
  end: "2026-11-22",
  days: [],
  bookings: [],
  leave: [],
};

describe("time helpers", () => {
  it("reads site-local time whatever the machine zone", () => {
    expect(localHm("2026-11-16T06:00:00Z")).toBe("08:00");
    expect(localHm("2026-11-16T23:30:00Z")).toBe("01:30");
    expect(localHm(null)).toBe("");
  });
  it("measures lateness and early leave", () => {
    expect(lateMinutes(day({ clockInAt: "2026-11-16T06:25:00Z" }))).toBe(25);
    expect(lateMinutes(day({}))).toBe(0);
    expect(earlyMinutes(day({ clockOutAt: "2026-11-16T13:00:00Z" }))).toBe(60);
    // night shift: ends the next morning
    const night = day({ expectedStart: "22:00", expectedEnd: "06:00", clockOutAt: "2026-11-17T03:00:00Z" });
    expect(earlyMinutes(night)).toBe(60);
  });
  it("finds gaps between stretches on site", () => {
    const d = day({
      segments: [
        { startedAt: "2026-11-16T06:00:00Z", endedAt: "2026-11-16T10:00:00Z" },
        { startedAt: "2026-11-16T10:45:00Z", endedAt: "2026-11-16T14:00:00Z" },
      ],
    });
    expect(gapMinutes(d)).toEqual([45]);
  });
});

describe("register and summary", () => {
  const input: AttendanceReportInput = {
    ...base,
    days: [
      day({}),
      day({ id: "d2", userId: "u2", userName: "Ann", clockInAt: "2026-11-16T06:40:00Z", exceptions: ["LATE"] }),
      day({ id: "d3", userId: "u3", userName: "Bo", clockOutAt: null, workedMinutes: null, exceptions: ["NO_CLOCK_OUT"] }),
    ],
    bookings: [
      { userId: "u1", userName: "Wesley", date: "2026-11-16", status: "booked" },
      { userId: "u4", userName: "Cara", date: "2026-11-16", status: "booked" },
      { userId: "u5", userName: "Dan", date: "2026-11-16", status: "booked" },
    ],
    leave: [{ userId: "u5", userName: "Dan", startDate: "2026-11-15", endDate: "2026-11-17", status: "approved" }],
  };
  it("groups by status and finds the absent", () => {
    const r = buildAttendanceReport(input);
    expect(r.groups.map((g) => g.title)).toEqual([
      "Present (1)",
      "Late (1)",
      "No clock-out (1)",
      "Absent (1)",
      "On leave (1)",
    ]);
    expect(r.groups[3].rows[0][0]).toBe("Cara");
    expect(r.groups[1].rows[0][5]).toBe("40");
    expect(r.kpis[0].value).toBe("4"); // Wesley, Ann, Bo, Cara (Dan is on leave)
    expect(r.insights.join(" ")).toContain("Not in: Cara");
    expect(r.details[0].v).toBe("Draft (awaiting approval)");
    expect(r.charts.map((c) => c.title)).toContain("Who was where");
  });
  it("summary lists measures and methods", () => {
    const r = buildAttendanceReport({ ...input, kind: "summary" });
    expect(r.groups[0].rows.find((x) => x[0] === "Late")?.[1]).toBe("1");
    expect(r.groups[1].title).toBe("How people clocked in");
  });
  it("empty day has no analysis", () => {
    const r = buildAttendanceReport(base);
    expect(r.groups).toEqual([]);
    expect(r.insights).toEqual([]);
  });
});

describe("log", () => {
  it("orders events and shows amendments", () => {
    const r = buildAttendanceReport({
      ...base,
      kind: "log",
      days: [
        day({
          clockInAt: "2026-11-16T06:10:00Z",
          segments: [
            { startedAt: "2026-11-16T06:10:00Z", endedAt: "2026-11-16T10:00:00Z", endReason: "lunch_or_left_site" },
            { startedAt: "2026-11-16T10:40:00Z", endedAt: "2026-11-16T14:00:00Z", endReason: "manual" },
          ],
          amendments: [
            { field: "clock_in_at", previousValue: "2026-11-16T07:00:00Z", newValue: "2026-11-16T06:10:00Z", reason: "Scanner was offline", actorName: "Boss", createdAt: "2026-11-16T15:00:00Z" },
          ],
        }),
      ],
    });
    const rows = r.groups[0].rows;
    expect(rows.map((x) => x[3])).toEqual(["Clock in", "Clock out", "Clock in", "Clock out", "Amended"]);
    expect(rows[1][5]).toBe("Left the site");
    expect(rows[4][5]).toContain("Scanner was offline");
    expect(r.insights.join(" ")).toContain("left the site and came back");
  });
});

describe("exceptions", () => {
  it("groups by type with minutes, flags repeat lateness", () => {
    const lates = [16, 17, 18].map((n) =>
      day({ id: `l${n}`, workDate: `2026-11-${n}`, clockInAt: `2026-11-${n}T06:30:00Z`, exceptions: ["LATE"] }),
    );
    const r = buildAttendanceReport({
      ...base,
      kind: "exceptions",
      days: [...lates, day({ id: "e", workDate: "2026-11-19", clockOutAt: "2026-11-19T13:00:00Z", exceptions: ["EARLY_LEAVE"] })],
    });
    expect(r.groups[0].title).toBe("Late arrival (3)");
    expect(r.groups[0].rows[0][3]).toBe("30 min after 08:00");
    expect(r.insights.join(" ")).toContain("Repeated lateness");
    expect(r.kpis[1].value).toBe("4 of 4");
  });
});

describe("breaks", () => {
  it("rates long shifts by the gap recorded and states the limit", () => {
    const seg = (a: string, b: string, c: string, d: string) => [
      { startedAt: `2026-11-16T${a}:00Z`, endedAt: `2026-11-16T${b}:00Z` },
      { startedAt: `2026-11-16T${c}:00Z`, endedAt: `2026-11-16T${d}:00Z` },
    ];
    const r = buildAttendanceReport({
      ...base,
      kind: "breaks",
      days: [
        day({ id: "a", userName: "A", userId: "a", segments: seg("06:00", "10:00", "10:45", "14:00") }),
        day({ id: "b", userName: "B", userId: "b", segments: seg("06:00", "10:00", "10:10", "14:00") }),
        day({ id: "c", userName: "C", userId: "c" }),
        day({ id: "d", userName: "D", userId: "d", workedMinutes: 240 }),
      ],
    });
    expect(r.groups.map((g) => g.title)).toEqual([
      "Break taken (1)",
      "Short break (1)",
      "No break recorded (1)",
      "Shift of 5 hours or less (1)",
    ]);
    expect(r.kpis[3].value).toBe("33%");
    expect(r.note).toContain("breaks are not clocked");
  });
});

describe("csv", () => {
  it("guards formulas and adds a BOM", () => {
    const r = buildAttendanceReport({ ...base, kind: "register", days: [day({ userName: "=HYPERLINK(1)" })] });
    const csv = attendanceCsv(r);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
