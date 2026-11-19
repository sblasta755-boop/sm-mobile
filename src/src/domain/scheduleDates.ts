// Day keys ("YYYY-MM-DD") and clock times for the schedule reports. Dates are worked in UTC so the machine's zone cannot move a day.

const toUtc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
};

/** The Monday of the week holding the day. */
export const weekStart = (day: string) => {
  const dow = (toUtc(day).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
};

export const monthRange = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return {
    start: toKey(new Date(Date.UTC(y, m - 1, 1))),
    end: toKey(new Date(Date.UTC(y, m, 0))),
  };
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = (day: string) => WEEKDAYS[toUtc(day).getUTCDay()];
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Hours worked for a pair of times; an end at or before the start runs past midnight. */
export function hoursBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = minutes(start);
  let b = minutes(end);
  if (b <= a) b += 24 * 60;
  return (b - a) / 60;
}

