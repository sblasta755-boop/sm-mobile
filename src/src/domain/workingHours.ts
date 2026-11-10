/** A site's working hours as text. An end earlier than the start means the site runs past midnight. */
export function hoursText(hours: { start: string; end: string }, separator = "-"): string {
  const overnight = hours.end < hours.start;
  return `${hours.start} ${separator} ${hours.end}${overnight ? " (+1 day)" : ""}`;
}

export interface NamedShift {
  name: string;
  startTime: string;
  endTime: string;
}

const minutesOf = (hhmm: string): number | null => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * The shift to show now on a site with named shifts: the one running (Night 18:30-04:00 is running at 23:00 and at
 * 02:00); of several running, the one that started most recently; in a gap, the next to start. Null without shifts.
 * Kept in step with the web app's lib/smartclean/workingHours.ts.
 */
export function currentShift<T extends NamedShift>(shifts: T[] | null | undefined, now: Date): T | null {
  const rows = (shifts ?? []).filter((s) => minutesOf(s.startTime) !== null && minutesOf(s.endTime) !== null);
  if (rows.length === 0) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sinceStart = (s: T) => (nowMin - (minutesOf(s.startTime) as number) + 1440) % 1440;
  const length = (s: T) => (((minutesOf(s.endTime) as number) - (minutesOf(s.startTime) as number) + 1440) % 1440) || 1440;
  const running = rows.filter((s) => sinceStart(s) < length(s)).sort((a, b) => sinceStart(a) - sinceStart(b));
  if (running.length > 0) return running[0];
  const untilStart = (s: T) => (1440 - sinceStart(s)) % 1440;
  return [...rows].sort((a, b) => untilStart(a) - untilStart(b))[0];
}
