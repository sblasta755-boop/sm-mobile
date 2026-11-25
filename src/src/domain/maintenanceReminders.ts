/**
 * Small pure helpers behind maintenance reminders: how each priority looks, how long until one can be sent again, what
 * the pop-up should show first, and the settings form's rules. The phone app has a copy in
 * mobile/src/src/domain/maintenanceReminders.ts; keep the two in step.
 */

export type Priority = "low" | "normal" | "high" | "urgent";
export type Status = "pending" | "acknowledged" | "ignored" | "resolved";
export type Direction = "both" | "to_payers" | "to_handlers" | "off";

export const PRIORITY_ORDER: Priority[] = ["low", "normal", "high", "urgent"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** What each level is for, in the words the sender sees when choosing. */
export const PRIORITY_HINT: Record<Priority, string> = {
  low: "A gentle nudge. No hurry.",
  normal: "Needs attention soon.",
  high: "Needs attention today. Stops them with a pop-up.",
  urgent: "Cannot wait. Stops them with a pop-up and cannot be missed.",
};

/** Colour classes per priority, for chips, dots and the pop-up. Semantic tokens only, so dark mode works. */
export const PRIORITY_LOOK: Record<
  Priority,
  { chip: string; dot: string; panel: string; button: string }
> = {
  low: {
    chip: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    panel: "border-border",
    button: "",
  },
  normal: {
    chip: "border-primary/40 bg-primary/10 text-primary",
    dot: "bg-primary",
    panel: "border-primary/50",
    button: "",
  },
  high: {
    chip: "border-warning/50 bg-warning/10 text-warning",
    dot: "bg-warning",
    panel: "border-warning",
    button: "bg-warning text-white hover:bg-warning/90",
  },
  urgent: {
    chip: "border-destructive/50 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
    panel: "border-destructive",
    button: "bg-destructive text-white hover:bg-destructive/90",
  },
};

export const priorityRank = (p: Priority) => PRIORITY_ORDER.indexOf(p);

/** "3 days", "4 hours", "1 hour 10 min", "25 min". */
export function waitText(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} ${m === 1440 ? "day" : "days"}`;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
    return rest ? `${hours} ${rest} min` : hours;
  }
  return `${m} min`;
}

/** "Available in 3 hours 10 min" from the time it opens, or "" when it is open now. */
export function countdown(at: string | null, now = new Date()): string {
  if (!at) return "";
  const ms = new Date(at).getTime() - now.getTime();
  return ms <= 0 ? "" : `Available in ${waitText(Math.ceil(ms / 60000))}`;
}

/** The chip on a reminder in the Activity list. */
export function statusText(status: Status, note?: string | null): string {
  if (status === "pending") return "Waiting for a reply";
  if (status === "acknowledged") return "Seen";
  if (status === "resolved") return "Sorted out";
  return note ? `Ignored: ${note}` : "Ignored";
}

export const STATUS_TONE: Record<Status, string> = {
  pending: "border-warning/50 bg-warning/10 text-warning",
  acknowledged: "border-success/50 bg-success/10 text-success",
  resolved: "border-border bg-muted text-muted-foreground",
  ignored: "border-destructive/50 bg-destructive/10 text-destructive",
};

/** The reminders to stop the person with, most urgent first and, within a level, the one waiting longest. */
export function popupQueue<T extends { priority: Priority; popup: boolean; createdAt: string }>(
  items: T[],
): T[] {
  return items
    .filter((i) => i.popup)
    .sort(
      (a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** Which priorities can be sent to everyone chosen, and why not when one cannot. */
export function priorityChoices(
  targets: {
    userId: string;
    availability: Record<Priority, { ok: boolean; at: string | null; reason: string }>;
  }[],
  chosen: string[],
  now = new Date(),
): Record<Priority, { ok: boolean; note: string }> {
  const picked = targets.filter((t) => chosen.includes(t.userId));
  const out = {} as Record<Priority, { ok: boolean; note: string }>;
  for (const p of PRIORITY_ORDER) {
    const blocked = picked.find((t) => !t.availability[p].ok);
    out[p] = blocked
      ? {
          ok: false,
          note: countdown(blocked.availability[p].at, now) || blocked.availability[p].reason,
        }
      : { ok: picked.length > 0, note: "" };
  }
  return out;
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  both: "Both ways",
  to_payers: "Handler reminds payers only",
  to_handlers: "Payers remind the handler only",
  off: "Off",
};

export type SettingsForm = {
  low: string;
  normal: string;
  high: string;
  urgent: string;
  maxPerJobPerDay: string;
};

/** Problems with the settings form, by field. Waiting times are minutes; a stronger level may not wait longer. */
export function settingsErrors(form: SettingsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const minutes: Partial<Record<Priority, number>> = {};
  for (const p of PRIORITY_ORDER) {
    const n = Number(form[p].trim());
    if (form[p].trim() === "" || !Number.isInteger(n) || n < 5 || n > 43200) {
      errors[p] = "Enter whole minutes from 5 to 43200";
    } else minutes[p] = n;
  }
  if (Object.keys(errors).length === 0) {
    const list = PRIORITY_ORDER.map((p) => minutes[p] as number);
    if (list.some((n, i) => i > 0 && n > list[i - 1])) {
      errors.urgent = "A more urgent reminder must not wait longer than a gentler one";
    }
  }
  const cap = Number(form.maxPerJobPerDay.trim());
  if (form.maxPerJobPerDay.trim() === "" || !Number.isInteger(cap) || cap < 1 || cap > 20) {
    errors.maxPerJobPerDay = "Enter a whole number from 1 to 20";
  }
  return errors;
}

type Availability = { ok: boolean; at: string | null; reason: string };

/** The Remind button: always shown, enabled when any priority can be sent to someone, else a line saying why or when. */
export function remindState(
  reminders: {
    canSend: boolean;
    blockedReason: string;
    dailyLeft: number;
    targets: { availability: Record<Priority, Availability> }[];
  },
  now = new Date(),
): { enabled: boolean; caption: string } {
  if (!reminders.canSend)
    return { enabled: false, caption: reminders.blockedReason || "No one to remind right now." };
  if (reminders.dailyLeft <= 0)
    return {
      enabled: false,
      caption: "You have sent the most reminders allowed today on this job.",
    };
  const open = reminders.targets.some((t) => PRIORITY_ORDER.some((p) => t.availability[p].ok));
  if (open) return { enabled: true, caption: "" };
  // Everyone is waiting out a gap or has not replied yet: say when the soonest one opens.
  const times = reminders.targets
    .flatMap((t) => PRIORITY_ORDER.map((p) => t.availability[p].at))
    .filter((x): x is string => !!x)
    .sort();
  const text = times.length ? countdown(times[0], now) : "";
  return { enabled: false, caption: text || "Waiting for a reply to your last reminder." };
}
