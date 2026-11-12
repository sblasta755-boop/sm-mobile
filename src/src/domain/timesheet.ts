// The pure parts of the manager's phone timesheet: weeks, people, durations and flag wording. They mirror the web app's
// components/smartclean/timesheet/helpers.ts so the two read the same week the same way.

import type { TimesheetDay } from "@/api/client";

export const dateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** The Sunday on or before `date`, at midnight: the timesheet's week starts there. */
export function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

export const addDays = (date: Date, n: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + n);
  return copy;
};

/** "8 - 14 Nov 2026", or "28 Oct - 3 Nov 2026" when the week spans two months. */
export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const month = (d: Date) => d.toLocaleDateString("en-ZA", { month: "short" });
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} - ${end.getDate()} ${month(end)} ${end.getFullYear()}`
    : `${start.getDate()} ${month(start)} - ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
}

/** Minutes -> "8h 58m". Hours alone would hide the difference between a full shift and one cut short. */
export function formatDuration(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${rest}m`;
}

export function formatClock(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

/** "Sat 8 Nov" for a yyyy-mm-dd work date. */
export function dayLabel(workDate: string): string {
  const [y, m, d] = workDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

/** A day missing its clock-in or clock-out: approval is refused until a manager amends it. */
export const isIncomplete = (d: TimesheetDay) => !d.clockInAt || !d.clockOutAt;
export const needsCheck = (d: TimesheetDay) => d.exceptions.length > 0 || isIncomplete(d);

/** Mirrors EXCEPTION_LABELS in the backend's services/attendance_rules.py. */
export const EXCEPTION_LABELS: Record<string, string> = {
  LATE: "Late arrival",
  EARLY_LEAVE: "Left early",
  OUTSIDE_SHIFT: "Outside shift hours",
  NO_CLOCK_OUT: "No clock-out",
  NO_GEOFENCE: "Location unverified",
  SHORT_DAY: "Unusually short",
  LONG_DAY: "Unusually long",
  ON_LEAVE: "Clocked in on approved leave",
  recorded_offline: "Recorded offline",
  auto_clocked: "Clocked automatically by location",
  LOCATION_LOST: "Location lost, time not counted",
  LOCATION_OFF: "Location switched off",
  MOCK_LOCATION: "Location looks faked",
  needs_review: "Late location event, check the day",
  OVERTIME_PENDING: "Overtime awaiting approval",
  OVERTIME: "Approved overtime",
};

export const SEGMENT_END_LABELS: Record<string, string> = {
  lunch_or_left_site: "left the site",
  manual: "clocked out",
  auto_close: "closed at end of day",
  presence_lost: "location lost",
  shift_end: "shift end",
};

export interface Person {
  userId: string;
  name: string;
  rows: TimesheetDay[];
}

/** Groups a week of days by person, A to Z. */
export function groupPeople(days: TimesheetDay[]): Person[] {
  const groups = new Map<string, Person>();
  for (const day of days) {
    const existing = groups.get(day.userId);
    if (existing) existing.rows.push(day);
    else groups.set(day.userId, { userId: day.userId, name: day.userName ?? day.userId, rows: [day] });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
