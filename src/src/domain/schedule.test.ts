import type { StaffBooking } from "@/api/client";
import { addDays, bookingShifts, bookingTime, bookingTimeParts, dateKey, dayHeading, daysBetween, groupByDay, isPastDay, mapsUrl, mondayOf, summarizeTasks } from "./schedule";

const site = { id: "s1", name: "Hazelwood Mall", address: "1 Main Rd", latitude: -26.1, longitude: 28.0 };
const b = (over: Partial<StaffBooking>): StaffBooking => ({
  id: "b", siteId: "s1", site, userId: "u", userName: "Ann", date: "2026-11-03", startTime: null, endTime: null, shiftIds: [], shiftNames: [],
  instructions: "", status: "booked", notified: [], bookedBy: "", tasks: [], ...over,
});

test("a range of days, weekdays only when asked, and never more than the cap", () => {
  expect(daysBetween("2026-11-06", "2026-11-09")).toEqual(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
  expect(daysBetween("2026-11-06", "2026-11-09", true)).toEqual(["2026-11-06", "2026-11-09"]);
  expect(daysBetween("2026-11-09", "2026-11-06")).toEqual([]);
  expect(daysBetween("2026-01-01", "2026-12-31")).toHaveLength(31);
  expect(daysBetween("nope", "2026-11-06")).toEqual([]);
});

test("headings say Today and Tomorrow, and times read naturally", () => {
  const today = new Date(2026, 10, 3);
  expect(dayHeading("2026-11-03", today)).toBe("Today");
  expect(dayHeading(dateKey(addDays(today, 1)), today)).toBe("Tomorrow");
  expect(bookingTime(b({ startTime: "07:00", endTime: "15:00" }))).toBe("07:00 to 15:00");
  expect(bookingTime(b({ startTime: "07:00" }))).toBe("from 07:00");
  expect(bookingTime(b({}))).toBe("All day");
});

test("bookings group by day in order and drop cancelled ones", () => {
  const groups = groupByDay([
    b({ id: "1", date: "2026-11-05", startTime: "09:00" }),
    b({ id: "2", date: "2026-11-03", startTime: "10:00" }),
    b({ id: "3", date: "2026-11-03", startTime: "07:00" }),
    b({ id: "4", date: "2026-11-04", status: "cancelled" }),
  ]);
  expect(groups.map((g) => g.date)).toEqual(["2026-11-03", "2026-11-05"]);
  expect(groups[0].items.map((i) => i.id)).toEqual(["3", "2"]);
});

test("the maps link uses the pin when there is one and a search when there is not", () => {
  expect(mapsUrl(site)).toContain("query=-26.1,28");
  expect(mapsUrl({ ...site, latitude: null, longitude: null })).toContain("Hazelwood%20Mall%2C%201%20Main%20Rd");
});

test("the calendar starts on the Monday on or before a date", () => {
  expect(dateKey(mondayOf(new Date(2026, 10, 1)))).toBe("2026-10-26"); // a Sunday
  expect(dateKey(mondayOf(new Date(2026, 10, 2)))).toBe("2026-11-02"); // a Monday
});

test("a day is past only before today", () => {
  const today = new Date(2026, 10, 3);
  expect(isPastDay("2026-11-02", today)).toBe(true);
  expect(isPastDay("2026-11-03", today)).toBe(false);
  expect(isPastDay("2026-11-04", today)).toBe(false);
});

test("a booking names its shifts, joined for a double shift, or nothing for custom hours", () => {
  expect(bookingShifts(b({ shiftNames: ["Day"] }))).toBe("Day");
  expect(bookingShifts(b({ shiftNames: ["Day", "Night"] }))).toBe("Day + Night");
  expect(bookingShifts(b({}))).toBe("");
});

describe("summarizeTasks", () => {
  const t = (id: string, title: string, status = "assigned") => ({ id, title, status });
  it("folds the hourly rounds into one line and keeps the other tasks", () => {
    const out = summarizeTasks([
      t("1", "Kitchen Area – Cleaning"),
      t("2", "Hourly compliance 09:30 · Games room"),
      t("3", "Hourly compliance 08:00 · Kitchen"),
      t("4", "Hourly compliance 8:30 · Games room"),
      t("5", "Bar – Restock", "approved"),
    ]);
    expect(out.rounds).toEqual({ count: 3, first: "08:00", last: "09:30", places: ["Games room", "Kitchen"] });
    expect(out.others).toEqual([
      { id: "1", title: "Kitchen Area – Cleaning", done: false },
      { id: "5", title: "Bar – Restock", done: true },
    ]);
  });
  it("has no rounds line when there are none", () => {
    expect(summarizeTasks([t("1", "Mop")]).rounds).toBeNull();
    expect(summarizeTasks([]).others).toEqual([]);
  });
  it("splits a booking time for the card", () => {
    expect(bookingTimeParts({ startTime: "12:15", endTime: "12:20" })).toEqual({ main: "12:15", sub: "to 12:20" });
    expect(bookingTimeParts({ startTime: "18:30", endTime: "04:00" }).sub).toBe("to 04:00 (+1 day)");
    expect(bookingTimeParts({ startTime: null, endTime: null }).main).toBe("All day");
  });
});
