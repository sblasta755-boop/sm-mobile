// Human-readable date/time formatting, in one place.
//
// Task.dueTime used to be handed to the UI as a raw ISO string (see
// normalizeBootstrap in api/client.ts, which did
// String(dueAt ?? scheduledAt)), so the Home and Shifts lists rendered
// "Due 2026-09-14T20:59:18.196267Z" to a cleaner mid-shift. Every other
// screen hand-rolled its own toLocaleTimeString("en-ZA") call with
// slightly different options, so the same instant read differently
// depending where you saw it.
//
// Mirrors lib/smartclean/formatDateTime.ts on the web so both clients
// format identically.
const LOCALE = "en-ZA";

/** "14 Sep 2026" - a date with no time. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
}

/** "10:00" - a time with no date. What "Due" on a task list means: the
 * task is for a given day, so repeating that day next to it is noise. */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** "14 Sep 2026, 10:00" - both, for detail screens and timelines where
 * the day genuinely matters. No seconds: nothing a user reads is
 * precise to the second, and they made the old output unreadable. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** "Today", "Yesterday", "Tomorrow", else "Mon 14 Sep". */
export function formatRelativeDay(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(new Date())) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

// Returns null rather than an Invalid Date for anything unparseable, so
// every formatter above renders "" instead of the literal string
// "Invalid Date".
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
