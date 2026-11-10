/** "Sat 7 Nov, 18:28" - the exact time of a notification, for when the card is opened. Same output as the web app. */
export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day.replace(/,/g, "")}, ${hh}:${mm}`;
}
