/** A site's working hours as text. An end earlier than the start means the site runs past midnight. */
export function hoursText(hours: { start: string; end: string }, separator = "-"): string {
  const overnight = hours.end < hours.start;
  return `${hours.start} ${separator} ${hours.end}${overnight ? " (+1 day)" : ""}`;
}
