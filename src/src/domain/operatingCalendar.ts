import type { SiteOperationsPayload } from "@/api/client";
import type { Site, SiteClosure, SiteClosureKind } from "@/types/smartclean";

/** Monday first, matching the backend's weekday numbers (0 = Monday ... 6 = Sunday). */
export const WEEKDAYS = [
  { value: 0, short: "Mon", long: "Monday" },
  { value: 1, short: "Tue", long: "Tuesday" },
  { value: 2, short: "Wed", long: "Wednesday" },
  { value: 3, short: "Thu", long: "Thursday" },
  { value: 4, short: "Fri", long: "Friday" },
  { value: 5, short: "Sat", long: "Saturday" },
  { value: 6, short: "Sun", long: "Sunday" },
] as const;

export const CLOSURE_KINDS: { value: SiteClosureKind; label: string }[] = [
  { value: "holiday", label: "Holiday" },
  { value: "maintenance", label: "Maintenance" },
  { value: "renovation", label: "Makeover / renovation" },
  { value: "other", label: "Other" },
];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function siteOperatingDays(site: Pick<Site, "operatingDays"> | undefined): number[] {
  return site?.operatingDays?.length ? site.operatingDays : ALL_DAYS;
}

/** A short line for the days a site opens: "Every day", "Mon to Fri", or the days listed. */
export function operatingDaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const consecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  const name = (day: number) => WEEKDAYS[day].short;
  if (sorted.length > 2 && consecutive) return `${name(sorted[0])} to ${name(sorted[sorted.length - 1])}`;
  return sorted.map(name).join(", ");
}

/** Why the site is shut on a day (YYYY-MM-DD), or null when it is open. Public holidays are passed in. */
export function closedReason(
  site: Pick<Site, "operatingDays" | "closures" | "closedOnPublicHolidays" | "openDates"> | undefined,
  day: string,
  holidays: ReadonlySet<string> = new Set(),
): string | null {
  if (!site) return null;
  // A date opened by hand is the most specific rule: it beats the weekdays, holidays and closures.
  if (site.openDates?.includes(day)) return null;
  for (const closure of site.closures ?? []) {
    if (closure.startDate <= day && day <= closure.endDate) {
      const label = closure.reason || CLOSURE_KINDS.find((k) => k.value === closure.kind)?.label || "Closed";
      return `Closed: ${label}`;
    }
  }
  if (site.closedOnPublicHolidays && holidays.has(day)) return "Closed: public holiday";
  const [year, month, date] = day.split("-").map(Number);
  const weekday = (new Date(year, month - 1, date).getDay() + 6) % 7;
  if (!siteOperatingDays(site).includes(weekday)) return `Closed on ${WEEKDAYS[weekday].long}s`;
  return null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What is wrong with a closure's dates, or null when it can be added. */
export function closureProblem(closure: Pick<SiteClosure, "startDate" | "endDate">): string | null {
  const real = (value: string) => {
    if (!ISO_DAY.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  };
  if (!real(closure.startDate) || !real(closure.endDate)) return "Enter both dates as year-month-day, such as 2026-12-24.";
  if (closure.endDate < closure.startDate) return "A closure cannot end before it starts.";
  return null;
}

/** 20261224 -> 2026-12-24 as the person types. */
export function typedDay(text: string): string {
  const digits = text.replace(/[^0-9]/g, "").slice(0, 8);
  if (digits.length > 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return digits;
}

type CalendarDraft = {
  operatingDays?: number[];
  closedOnPublicHolidays?: boolean;
  closures?: SiteClosure[];
  openDates?: string[];
};

/**
 * What tapping one date on the calendar does. A date opened by hand goes back to the rules; a one-day closure
 * is removed; a date the rules shut (a closed weekday, a holiday, part of a longer closure) is opened by hand;
 * an open date gets a one-day closure.
 */
export function toggleDate(
  calendar: CalendarDraft,
  day: string,
  holidays: ReadonlySet<string> = new Set(),
  /** False at organisation level, which has no dates opened by hand: a closed day just stays closed. */
  allowOpen = true,
): { openDates: string[]; closures: SiteClosure[] } {
  const openDates = calendar.openDates ?? [];
  const closures = calendar.closures ?? [];
  if (openDates.includes(day)) return { openDates: openDates.filter((d) => d !== day), closures };
  const single = closures.find((c) => c.startDate === day && c.endDate === day);
  if (single) return { openDates, closures: closures.filter((c) => c !== single) };
  if (closedReason(calendar, day, holidays)) {
    return allowOpen ? { openDates: [...openDates, day].sort(), closures } : { openDates, closures };
  }
  return { openDates, closures: [...closures, { startDate: day, endDate: day, reason: "", kind: "other" }] };
}

/**
 * What a site's own calendar is right now, in the shape the server takes, with `patch` applied. Each settings section
 * saves only its own part, so every other part is sent back as it is (a null field follows the organisation),
 * otherwise saving one section would overwrite another.
 */
export function siteOperationsPayload(
  site: Pick<Site, "calendarOverride" | "workingHours" | "operatingDays" | "closedOnPublicHolidays" | "ownClosures" | "openDates">,
  patch: Partial<SiteOperationsPayload> = {},
): SiteOperationsPayload {
  const own = site.calendarOverride;
  return {
    workingHours: own?.workingHours ? (site.workingHours ?? null) : null,
    operatingDays: own?.operatingDays ? (site.operatingDays ?? null) : null,
    closedOnPublicHolidays: own?.closedOnPublicHolidays ? (site.closedOnPublicHolidays ?? false) : null,
    closures: site.ownClosures ?? [],
    openDates: site.openDates ?? [],
    ...patch,
  };
}
