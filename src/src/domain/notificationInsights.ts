/**
 * Small pure helpers behind the platform console's Notifications section: formatting, labels and the guard
 * settings form rules. Kept apart from the screen so they are easy to test. The phone app has a copy in
 * mobile/src/src/domain/notificationInsights.ts; keep the two in step.
 */

export type GuardBound = { key: string; default: number; min: number; max: number; label: string };
export type GuardValues = {
  enabled: boolean;
  dedupeWindowMinutes: number;
  pushPerRecipientPerHour: number;
};

export const RANGE_OPTIONS = [7, 30, 90] as const;

/** 0.1234 -> "12%". Null (nothing to measure) -> "-". */
export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`;
}

/** How a figure moved against the previous period: "+12%", "-5%", "new" (nothing before) or "-". */
export function changeLabel(change: number | null | undefined, current = 0): string {
  if (change === null || change === undefined) return current > 0 ? "new" : "-";
  const rounded = Math.round(change * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** A role name for people: "site_manager" -> "Site manager". */
export function roleLabel(role: string): string {
  const text = role.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/** "table service" -> "Table service". */
export function categoryLabel(category: string): string {
  return roleLabel(category);
}

/** The label under a chart bar: the hour ("14:00") for an hourly series, else the day ("12 Nov"). */
export function bucketLabel(iso: string, bucket: "hour" | "day"): string {
  const [datePart, timePart = "00:00"] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (bucket === "hour")
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${timePart.slice(0, 5)}`;
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
export const severityRank = (severity: string) => SEVERITY_RANK[severity] ?? 9;

/** 0 (none) to 4 (busiest) for a heat map cell. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Problems with the guard form, keyed by field, using the bounds the server sent. Empty when it is fine. */
export function guardErrors(
  values: { dedupeWindowMinutes: string | number; pushPerRecipientPerHour: string | number },
  bounds: GuardBound[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const bound of bounds) {
    const raw = values[bound.key as keyof typeof values];
    const number = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (
      String(raw).trim() === "" ||
      !Number.isInteger(number) ||
      number < bound.min ||
      number > bound.max
    ) {
      errors[bound.key] = `Enter a whole number from ${bound.min} to ${bound.max}`;
    }
  }
  return errors;
}

/** True when the form differs from what is saved. */
export function guardChanged(
  form: { enabled: boolean; dedupeWindowMinutes: string; pushPerRecipientPerHour: string },
  saved: GuardValues,
): boolean {
  return (
    form.enabled !== saved.enabled ||
    Number(form.dedupeWindowMinutes) !== saved.dedupeWindowMinutes ||
    Number(form.pushPerRecipientPerHour) !== saved.pushPerRecipientPerHour
  );
}

/** Organisations whose name contains the text, for the filter's search box. */
export function matchOrganisations<T extends { name: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
}

export const LOG_CHANNELS = [
  { value: "", label: "All channels" },
  { value: "in_app", label: "In app" },
  { value: "push", label: "Phone push" },
  { value: "web_push", label: "Browser push" },
  { value: "email", label: "Email" },
] as const;
export const LOG_STATUSES = [
  { value: "", label: "Any result" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "suppressed", label: "Held back" },
] as const;

/** A log row's channel in plain words. */
export function channelLabel(channel: string): string {
  return LOG_CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

/** A log row's result in plain words; a held-back one says why ("duplicate" -> "Held back: duplicate"). */
export function statusLabel(status: string, reason?: string | null): string {
  const base = LOG_STATUSES.find((s) => s.value === status)?.label ?? status;
  return status === "suppressed" && reason
    ? `${base}: ${reason}`
    : status === "failed" && reason
      ? `${base}: ${reason}`
      : base;
}

/** "25 Nov, 14:03:22" in the viewer's local time. */
export function logTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`;
}
