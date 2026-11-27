import type { MaintenanceEvent } from "../api/client";

/**
 * The job's history in plain words. The server stores what happened as a short code ("quote_approved") and a
 * message; people should read "Quote approved", not the code.
 */

export type EventLook = {
  text: string;
  icon: "dot" | "photo" | "chat" | "quote" | "check" | "money" | "pause" | "alert" | "bell";
};

const STATE_WORDS: Record<string, string> = {
  investigating: "Looking into it",
  awaiting_quote: "Waiting for a quote",
  awaiting_approval: "Waiting for approval",
  approved: "Approved",
  scheduled: "Contractor booked",
  in_progress: "Work started",
  awaiting_verification: "Ready to be checked",
  completed: "Job closed",
  no_action: "No repair needed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  rework: "Sent back to be redone",
};

const WORDS: Record<string, EventLook> = {
  reported: { text: "Fault reported", icon: "photo" },
  updated: { text: "Details changed", icon: "dot" },
  comment: { text: "Note added", icon: "chat" },
  supplier_response: { text: "Contractor replied", icon: "chat" },
  supplier_refused: { text: "Contractor is refusing or delaying", icon: "alert" },
  quote_submitted: { text: "Quote added", icon: "quote" },
  quote_approved: { text: "Quote approved", icon: "check" },
  quote_rejected: { text: "Quote rejected", icon: "alert" },
  quote_changes_requested: { text: "Changes asked for on the quote", icon: "quote" },
  invoice_recorded: { text: "Invoice recorded", icon: "money" },
  cost_recorded: { text: "Final cost recorded", icon: "money" },
  pop_recorded: { text: "Proof of payment added", icon: "money" },
  payment_verified: { text: "Payment confirmed", icon: "check" },
  pop_forwarded: { text: "Proof sent to the contractor", icon: "money" },
  hold_placed: { text: "Put on hold", icon: "pause" },
  hold_released: { text: "Hold lifted", icon: "check" },
  reminder_sent: { text: "Reminder sent", icon: "bell" },
  reminder_acknowledged: { text: "Reminder seen", icon: "bell" },
  reminder_ignored: { text: "Reminder ignored", icon: "bell" },
};

/** "Thandi Mokoena" -> "Thandi". The full name and role were noise on a phone. */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "")
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)[0];
  return first ? first[0].toUpperCase() + first.slice(1) : "Someone";
}

/** A line of history: what happened (one short sentence) and an icon for it. */
export function describeEvent(
  event: Pick<MaintenanceEvent, "kind" | "message"> & { data?: Record<string, unknown> },
): EventLook {
  if (event.kind === "state") {
    const to = String((event as { data?: { to?: string } }).data?.to ?? "");
    return {
      text: STATE_WORDS[to] ?? "Status changed",
      icon: to === "completed" ? "check" : "dot",
    };
  }
  if (event.kind === "reminder_sent") {
    const data = (event.data ?? {}) as { priority?: string; recipientNames?: string[] };
    const who = (data.recipientNames ?? []).map((n) => firstName(n)).join(", ");
    const level = data.priority
      ? `${data.priority[0].toUpperCase()}${data.priority.slice(1)} reminder`
      : "Reminder";
    return { text: who ? `${level} sent to ${who}` : `${level} sent`, icon: "bell" };
  }
  return WORDS[event.kind] ?? { text: event.kind.replace(/_/g, " "), icon: "dot" };
}

/** "Today, 14:05" / "Yesterday, 09:30" / "7 Nov, 02:08": the time as people say it. */
export function friendlyTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}
