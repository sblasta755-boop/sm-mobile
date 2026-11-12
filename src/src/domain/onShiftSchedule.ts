// "On shift now" measured against the schedule. A list of who clocked in cannot show who is missing, so each
// person booked for today (and anyone still inside an overnight booking from yesterday) is compared with their live
// clock state: on site, late, never arrived, left early, location lost, or not due yet. Someone on site who was not
// booked is shown too, marked as not scheduled. The web app has the same rules in smart-property-operations/src/src/lib/smartclean/onShiftSchedule.ts.

/** The booking fields this needs; the schedule API's StaffBooking has them all. */
export interface ScheduledBooking {
  userId: string;
  userName: string;
  siteId: string;
  /** "YYYY-MM-DD", the site's local day. */
  date: string;
  /** "HH:MM". Both null means booked for the day, with no hours. */
  startTime: string | null;
  endTime: string | null;
  status: string;
}

/** One person's live state, from bootstrap's today status. An empty entry means clocked out; no entry, no clock event today. */
export interface LiveEntry {
  clockedInAt?: string;
  siteId?: string;
  /** Set when the phone went silent and the time stopped counting (the person is still clocked in). */
  locationLostAt?: string;
}

export type ScheduleState =
  "no_show" | "not_in" | "location_lost" | "clocked_out" | "on_site" | "upcoming" | "finished";

export interface ScheduleRow {
  userId: string;
  name: string;
  siteId: string;
  state: ScheduleState;
  /** False for someone on site who has no booking. */
  scheduled: boolean;
  startTime: string | null;
  endTime: string | null;
  /** When the current state began (clock-in, or when the location was lost). */
  since?: string;
  /** Minutes past the booked start, for someone who has not clocked in. */
  lateMinutes?: number;
}

/** Arriving within this long of the start is on time (the same grace the late-arrival flag uses). */
export const LATE_GRACE_MINUTES = 15;
const MINUTE = 60_000;

const atTime = (date: string, hhmm: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};

interface Window {
  booking: ScheduledBooking;
  start: Date;
  end: Date;
  allDay: boolean;
}

function windowOf(booking: ScheduledBooking): Window {
  if (!booking.startTime || !booking.endTime) {
    const start = atTime(booking.date, "00:00");
    return { booking, start, end: new Date(start.getTime() + 24 * 60 * MINUTE), allDay: true };
  }
  const start = atTime(booking.date, booking.startTime);
  let end = atTime(booking.date, booking.endTime);
  // A shift whose end is not after its start runs past midnight (Night 18:00 to 06:00).
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * MINUTE);
  return { booking, start, end, allDay: false };
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Display order inside a site: what needs attention first. */
const ORDER: ScheduleState[] = [
  "no_show",
  "not_in",
  "location_lost",
  "clocked_out",
  "on_site",
  "upcoming",
  "finished",
];

export function compareToSchedule(input: {
  bookings: ScheduledBooking[];
  attendance: Record<string, LiveEntry | undefined>;
  /** Names for people on site who have no booking. */
  names: Record<string, string>;
  now: Date;
}): ScheduleRow[] {
  const { bookings, attendance, names, now } = input;
  const today = dayKey(now);

  // Each person's bookings that matter now: today's, and yesterday's only while an overnight one is still running.
  const byUser = new Map<string, Window[]>();
  for (const b of bookings) {
    if (b.status !== "booked") continue;
    const w = windowOf(b);
    if (b.date !== today && !(w.end > now && w.start <= now)) continue;
    byUser.set(b.userId, [...(byUser.get(b.userId) ?? []), w]);
  }

  const rows: ScheduleRow[] = [];
  for (const [userId, windows] of byUser) {
    windows.sort((a, b) => a.start.getTime() - b.start.getTime());
    // The shift they are in or about to start; once all are over, the last one.
    const w = windows.find((x) => now < x.end) ?? windows[windows.length - 1];
    const entry = attendance[userId];
    const base = {
      userId,
      name: w.booking.userName,
      scheduled: true,
      startTime: w.booking.startTime,
      endTime: w.booking.endTime,
    };
    if (entry?.clockedInAt) {
      const lost = Boolean(entry.locationLostAt);
      rows.push({
        ...base,
        siteId: entry.siteId ?? w.booking.siteId,
        state: lost ? "location_lost" : "on_site",
        since: entry.locationLostAt ?? entry.clockedInAt,
      });
    } else if (entry) {
      // Clocked out. Before the shift is nearly over that is someone who has left or stepped away.
      const nearlyOver =
        !w.allDay && now.getTime() >= w.end.getTime() - LATE_GRACE_MINUTES * MINUTE;
      rows.push({
        ...base,
        siteId: w.booking.siteId,
        state: nearlyOver ? "finished" : "clocked_out",
      });
    } else if (now < w.start) {
      rows.push({ ...base, siteId: w.booking.siteId, state: "upcoming" });
    } else if (!w.allDay && now >= w.end) {
      rows.push({ ...base, siteId: w.booking.siteId, state: "no_show" });
    } else {
      rows.push({
        ...base,
        siteId: w.booking.siteId,
        state: "not_in",
        lateMinutes: w.allDay ? 0 : Math.floor((now.getTime() - w.start.getTime()) / MINUTE),
      });
    }
  }

  // On site, but nobody booked them.
  for (const [userId, entry] of Object.entries(attendance)) {
    if (!entry?.clockedInAt || byUser.has(userId)) continue;
    rows.push({
      userId,
      name: names[userId] ?? "Unknown",
      siteId: entry.siteId ?? "",
      state: entry.locationLostAt ? "location_lost" : "on_site",
      scheduled: false,
      startTime: null,
      endTime: null,
      since: entry.locationLostAt ?? entry.clockedInAt,
    });
  }

  return rows.sort(
    (a, b) =>
      ORDER.indexOf(a.state) - ORDER.indexOf(b.state) ||
      (b.lateMinutes ?? 0) - (a.lateMinutes ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

export interface ScheduleSummary {
  /** People booked for today's shifts (including ones that have finished). */
  scheduled: number;
  /** Booked people who are on site: the "of N scheduled" figure. */
  scheduledOnSite: number;
  /** Everyone on site, booked or not. */
  onSite: number;
  /** Booked, due, and not clocked in (past the grace), plus those who never arrived. */
  missing: number;
  locationLost: number;
  leftEarly: number;
  upcoming: number;
  /** On site with no booking. */
  unscheduled: number;
}

export function summarise(rows: ScheduleRow[]): ScheduleSummary {
  return {
    scheduled: rows.filter((r) => r.scheduled).length,
    scheduledOnSite: rows.filter((r) => r.scheduled && r.state === "on_site").length,
    onSite: rows.filter((r) => r.state === "on_site").length,
    missing: rows.filter(
      (r) =>
        r.state === "no_show" ||
        (r.state === "not_in" && (r.lateMinutes ?? 0) > LATE_GRACE_MINUTES),
    ).length,
    locationLost: rows.filter((r) => r.state === "location_lost").length,
    leftEarly: rows.filter((r) => r.state === "clocked_out").length,
    upcoming: rows.filter((r) => r.state === "upcoming").length,
    unscheduled: rows.filter((r) => !r.scheduled).length,
  };
}

const clock = (value?: string | null) =>
  !value
    ? ""
    : /^\d{2}:\d{2}$/.test(value)
      ? value
      : new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

/** The words next to a person's name. */
export function statusText(row: ScheduleRow): string {
  const tag = row.scheduled ? "" : " · Not scheduled";
  switch (row.state) {
    case "on_site":
      return `On site since ${clock(row.since)}${tag}`;
    case "location_lost":
      return `Location lost since ${clock(row.since)}, time not counting${tag}`;
    case "not_in": {
      const late = row.lateMinutes ?? 0;
      return late > LATE_GRACE_MINUTES
        ? `Not clocked in, ${late}m late (due ${clock(row.startTime)})`
        : row.startTime
          ? `Due at ${clock(row.startTime)}`
          : "Booked today, not clocked in";
    }
    case "no_show":
      return `Never clocked in (was due ${clock(row.startTime)})`;
    case "clocked_out":
      return `Clocked out, shift ends ${clock(row.endTime)}`;
    case "upcoming":
      return `Starts at ${clock(row.startTime)}`;
    case "finished":
      return "Shift finished";
  }
}

export type ScheduleTone = "ok" | "warn" | "bad" | "muted";

export function statusTone(row: ScheduleRow): ScheduleTone {
  switch (row.state) {
    case "on_site":
      return "ok";
    case "not_in":
      return (row.lateMinutes ?? 0) > LATE_GRACE_MINUTES ? "bad" : "warn";
    case "no_show":
    case "location_lost":
      return "bad";
    case "clocked_out":
      return "warn";
    default:
      return "muted";
  }
}
