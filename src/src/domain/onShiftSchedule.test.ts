import {
  compareToSchedule,
  statusText,
  statusTone,
  summarise,
  type LiveEntry,
  type ScheduledBooking,
} from "./onShiftSchedule";

const booking = (over: Partial<ScheduledBooking>): ScheduledBooking => ({
  userId: "u1",
  userName: "Anele",
  siteId: "s1",
  date: "2026-11-12",
  startTime: "08:00",
  endTime: "16:00",
  status: "booked",
  ...over,
});
const at = (h: number, m = 0, day = 12) => new Date(2026, 10, day, h, m);
const compare = (
  bookings: ScheduledBooking[],
  attendance: Record<string, LiveEntry | undefined>,
  now: Date,
  names: Record<string, string> = {},
) => compareToSchedule({ bookings, attendance, names, now });
const stateOf = (rows: ReturnType<typeof compare>, id = "u1") =>
  rows.find((r) => r.userId === id)?.state;

describe("someone booked today", () => {
  it("is upcoming before the shift", () => {
    expect(stateOf(compare([booking({})], {}, at(7, 0)))).toBe("upcoming");
  });
  it("is due, then late, when they have not clocked in", () => {
    const due = compare([booking({})], {}, at(8, 10))[0];
    expect(due.state).toBe("not_in");
    expect(due.lateMinutes).toBe(10);
    expect(statusText(due)).toBe("Due at 08:00");
    expect(statusTone(due)).toBe("warn");
    const late = compare([booking({})], {}, at(8, 40))[0];
    expect(statusText(late)).toBe("Not clocked in, 40m late (due 08:00)");
    expect(statusTone(late)).toBe("bad");
  });
  it("never arrived once the shift is over", () => {
    expect(stateOf(compare([booking({})], {}, at(17, 0)))).toBe("no_show");
  });
  it("is on site when clocked in", () => {
    const row = compare(
      [booking({})],
      { u1: { clockedInAt: at(7, 58).toISOString(), siteId: "s1" } },
      at(10, 0),
    )[0];
    expect(row.state).toBe("on_site");
    expect(statusTone(row)).toBe("ok");
  });
  it("is location lost when clocked in but the phone went silent", () => {
    const row = compare(
      [booking({})],
      {
        u1: {
          clockedInAt: at(8, 0).toISOString(),
          siteId: "s1",
          locationLostAt: at(9, 54).toISOString(),
        },
      },
      at(11, 0),
    )[0];
    expect(row.state).toBe("location_lost");
    expect(row.since).toBe(at(9, 54).toISOString());
    expect(statusTone(row)).toBe("bad");
  });
  it("has left when clocked out early, and finished when the shift is nearly over", () => {
    expect(stateOf(compare([booking({})], { u1: {} }, at(12, 0)))).toBe("clocked_out");
    expect(stateOf(compare([booking({})], { u1: {} }, at(15, 50)))).toBe("finished");
  });
});

describe("bookings that do not count", () => {
  it("ignores cancelled bookings and other days", () => {
    expect(compare([booking({ status: "cancelled" })], {}, at(9))).toEqual([]);
    expect(compare([booking({ date: "2026-11-13" })], {}, at(9))).toEqual([]);
    expect(compare([booking({ date: "2026-11-11" })], {}, at(9))).toEqual([]);
  });
});

describe("overnight shifts", () => {
  const night = booking({ date: "2026-11-11", startTime: "18:00", endTime: "06:00" });
  it("counts yesterday's night booking while it is still running", () => {
    expect(stateOf(compare([night], {}, at(2, 0)))).toBe("not_in");
    expect(
      stateOf(
        compare(
          [night],
          { u1: { clockedInAt: at(18, 0, 11).toISOString(), siteId: "s1" } },
          at(2, 0),
        ),
      ),
    ).toBe("on_site");
  });
  it("drops it once it has ended", () => {
    expect(compare([night], {}, at(7, 0))).toEqual([]);
  });
  it("shows tonight's night booking as upcoming during the day", () => {
    expect(
      stateOf(compare([booking({ startTime: "18:00", endTime: "06:00" })], {}, at(12, 0))),
    ).toBe("upcoming");
  });
});

describe("a booking for the day with no hours", () => {
  it("is never late and never a no-show", () => {
    const row = compare([booking({ startTime: null, endTime: null })], {}, at(20, 0))[0];
    expect(row.state).toBe("not_in");
    expect(row.lateMinutes).toBe(0);
    expect(statusText(row)).toBe("Booked today, not clocked in");
  });
});

describe("a double shift", () => {
  it("follows the shift they are in, then the next", () => {
    const day = booking({ startTime: "06:00", endTime: "12:00" });
    const evening = booking({ startTime: "14:00", endTime: "20:00" });
    expect(stateOf(compare([evening, day], {}, at(13, 0)))).toBe("upcoming");
    expect(compare([evening, day], {}, at(13, 0))[0].startTime).toBe("14:00");
  });
});

describe("people on site who were not booked", () => {
  it("are listed and marked", () => {
    const rows = compare(
      [],
      { u9: { clockedInAt: at(9, 0).toISOString(), siteId: "s2" } },
      at(10, 0),
      { u9: "Busi" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Busi",
      siteId: "s2",
      state: "on_site",
      scheduled: false,
    });
    expect(statusText(rows[0])).toContain("Not scheduled");
  });
});

describe("ordering and the summary", () => {
  it("puts what needs attention first and counts it", () => {
    const bookings = [
      booking({ userId: "ok", userName: "Zola" }),
      booking({ userId: "late", userName: "Ben" }),
      booking({ userId: "lost", userName: "Cara" }),
      booking({ userId: "later", userName: "Dee", startTime: "14:00", endTime: "20:00" }),
    ];
    const rows = compare(
      bookings,
      {
        ok: { clockedInAt: at(8, 0).toISOString(), siteId: "s1" },
        lost: {
          clockedInAt: at(8, 0).toISOString(),
          siteId: "s1",
          locationLostAt: at(9, 0).toISOString(),
        },
        extra: { clockedInAt: at(8, 30).toISOString(), siteId: "s1" },
      },
      at(10, 0),
      { extra: "Eli" },
    );
    expect(rows.map((r) => r.userId)).toEqual(["late", "lost", "extra", "ok", "later"]);
    expect(summarise(rows)).toEqual({
      scheduled: 4,
      scheduledOnSite: 1,
      onSite: 2,
      missing: 1,
      locationLost: 1,
      leftEarly: 0,
      upcoming: 1,
      unscheduled: 1,
    });
  });
});
