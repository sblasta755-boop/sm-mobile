import type { StaffBooking } from "@/api/client";

const pad = (n: number) => String(n).padStart(2, "0");

/** A date as 2026-11-03, in the phone's own time. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/** The Monday on or before a date. */
export function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** The days from `from` to `to`, both included, at most `cap` of them. */
export function daysBetween(from: string, to: string, weekdaysOnly = false, cap = 31): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return [];
  const out: string[] = [];
  for (let d = parseDateKey(from); dateKey(d) <= to && out.length < cap; d = addDays(d, 1)) {
    if (weekdaysOnly && (d.getDay() === 0 || d.getDay() === 6)) continue;
    out.push(dateKey(d));
  }
  return out;
}

/** "Tuesday 3 November", or "Today" / "Tomorrow". */
export function dayHeading(iso: string, today: Date = new Date()): string {
  if (iso === dateKey(today)) return "Today";
  if (iso === dateKey(addDays(today, 1))) return "Tomorrow";
  return parseDateKey(iso).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

export function bookingTime(b: Pick<StaffBooking, "startTime" | "endTime">): string {
  if (b.startTime && b.endTime) return `${b.startTime} to ${b.endTime}`;
  if (b.startTime) return `from ${b.startTime}`;
  return "All day";
}

/** Bookings grouped by day, days in order, cancelled ones left out. */
export function groupByDay(bookings: StaffBooking[]): { date: string; items: StaffBooking[] }[] {
  const map = new Map<string, StaffBooking[]>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    map.set(b.date, [...(map.get(b.date) ?? []), b]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items: items.sort((x, y) => (x.startTime ?? "").localeCompare(y.startTime ?? "")) }));
}

/** A link that opens the site in the phone's maps app (a pin when it has a location, a search otherwise). */
export function mapsUrl(site: Pick<StaffBooking["site"], "name" | "address" | "latitude" | "longitude">): string {
  if (site.latitude != null && site.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([site.name, site.address].filter(Boolean).join(", "))}`;
}

/** Whether a day (2026-11-03) has passed. Past days can be looked at but not booked, changed or cancelled. */
export function isPastDay(iso: string, today: Date = new Date()): boolean {
  return iso < dateKey(today);
}
