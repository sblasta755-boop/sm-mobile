import type { MaintenanceSeverity, MaintenanceState } from "../api/client";

export const MAINTENANCE_STATE_LABEL: Record<MaintenanceState, string> = {
  reported: "Reported",
  investigating: "Being looked into",
  awaiting_quote: "Waiting for a quote",
  awaiting_approval: "Waiting for approval",
  approved: "Approved",
  scheduled: "Contractor booked",
  in_progress: "Repair under way",
  awaiting_verification: "Ready to check",
  completed: "Closed",
  no_action: "No repair needed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  rework: "Needs redoing",
};

export const MAINTENANCE_QUEUES = [
  { value: "open", label: "All open" },
  { value: "mine", label: "Mine" },
  { value: "payments", label: "To pay" },
  { value: "awaiting_approval", label: "To approve" },
  { value: "need_quote", label: "Need a quote" },
  { value: "on_hold", label: "On hold" },
  { value: "scheduled", label: "Scheduled" },
  { value: "verify", label: "To check" },
  { value: "closed", label: "Closed" },
] as const;

export const MAINTENANCE_SEVERITIES: readonly MaintenanceSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export type MaintenanceTone =
  "success" | "warning" | "danger" | "info" | "muted";

export function maintenanceStateTone(state: MaintenanceState): MaintenanceTone {
  if (state === "completed") return "success";
  if (state === "rejected" || state === "cancelled" || state === "no_action")
    return "muted";
  if (state === "rework") return "danger";
  if (state === "awaiting_approval" || state === "awaiting_verification")
    return "warning";
  return "info";
}

export function maintenanceSeverityTone(
  severity: MaintenanceSeverity,
): MaintenanceTone {
  return severity === "critical"
    ? "danger"
    : severity === "high"
      ? "warning"
      : severity === "medium"
        ? "info"
        : "muted";
}

export function formatRand(value: number | null | undefined): string {
  return value == null
    ? "-"
    : `R ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-11-12 09:30" (or with a T) read as the phone's local time. Null when it is not a real date and time. */
export function parseLocalDateTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // new Date rolls 31 Feb over to March; a date that changed under us was not real.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  if (hour > 23 || minute > 59) return null;
  return date;
}

/** A money amount typed by a person ("1 250,50" or "1250.5"). Null unless it is a positive number. */
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/** Whether Maintenance exists for this person. Administrators and operations managers always have it; anyone
 * else only once an administrator has given them something. Presentation only: the server refuses everyone
 * else whatever the app shows. */
export function hasMaintenanceAccess(
  user:
    | {
        role?: string;
        maintenance?: {
          access?: boolean;
          handle?: boolean;
          approve?: boolean;
          pay?: boolean;
          override?: boolean;
        };
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "org_admin" || user.role === "operations_manager")
    return true;
  const grants = user.maintenance;
  return (
    !!grants &&
    (grants.access === true ||
      grants.handle === true ||
      grants.approve === true ||
      grants.pay === true ||
      grants.override === true)
  );
}

// ---- What a job needs next ----------------------------------------------------------

export type NextTone = "yours" | "waiting" | "blocked" | "done";
export type NextStep = { text: string; tone: NextTone };
type Caps = { handle: boolean; approve: boolean; pay: boolean } | undefined;
type JobLike = {
  state: MaintenanceState;
  path: "internal" | "contractor";
  activeHolds: number;
  clearedToProceed: boolean;
  clearedBlockers: string[];
  visitAt: string | null;
  severity: MaintenanceSeverity;
  updatedAt: string;
};

/** What this job needs next, in plain words, and whether that is on the person looking at it. Same words as the web console. */
export function nextStep(job: JobLike, caps: Caps): NextStep {
  const can = caps ?? { handle: false, approve: false, pay: false };
  switch (job.state) {
    case "completed":
      return { text: "Done", tone: "done" };
    case "no_action":
      return { text: "No repair needed", tone: "done" };
    case "rejected":
      return { text: "Rejected", tone: "done" };
    case "cancelled":
      return { text: "Cancelled", tone: "done" };
  }
  if (job.activeHolds > 0) {
    return {
      text: can.pay
        ? "On hold: a payment needs sorting out"
        : "On hold while a payment is sorted out",
      tone: "blocked",
    };
  }
  switch (job.state) {
    case "reported":
      return can.handle
        ? { text: "Pick this up and look into it", tone: "yours" }
        : { text: "Waiting for someone to pick it up", tone: "waiting" };
    case "investigating":
      return can.handle
        ? {
            text:
              job.path === "internal"
                ? "Start the repair"
                : "Find out what is needed, then ask for a quote",
            tone: "yours",
          }
        : { text: "Being looked into", tone: "waiting" };
    case "awaiting_quote":
      return can.handle
        ? { text: "Get a quote from a contractor", tone: "yours" }
        : { text: "Getting a quote", tone: "waiting" };
    case "awaiting_approval":
      return can.approve
        ? { text: "A quote is waiting for your approval", tone: "yours" }
        : { text: "Waiting for approval", tone: "waiting" };
    case "approved":
      if (!job.clearedToProceed)
        return {
          text: job.clearedBlockers.join(" ") || "Not cleared to start yet",
          tone: "blocked",
        };
      return can.handle
        ? { text: "Book the contractor", tone: "yours" }
        : { text: "Ready to book", tone: "waiting" };
    case "scheduled":
      return {
        text: job.visitAt
          ? `Contractor comes ${new Date(job.visitAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
          : "Visit booked",
        tone: "waiting",
      };
    case "in_progress":
      return { text: "Repair under way", tone: "waiting" };
    case "awaiting_verification":
      return can.handle
        ? { text: "Check the repair and close the job", tone: "yours" }
        : { text: "Waiting for the repair to be checked", tone: "waiting" };
    case "rework":
      return can.handle
        ? { text: "Needs doing again", tone: "yours" }
        : { text: "Being redone", tone: "waiting" };
    default:
      return { text: "", tone: "waiting" };
  }
}

/** Critical first, then what is on you, then the most recently touched. */
export function sortJobs<T extends JobLike>(jobs: T[], caps: Caps): T[] {
  const rank = (j: T) =>
    j.severity === "critical" ? 0 : nextStep(j, caps).tone === "yours" ? 1 : 2;
  return [...jobs].sort(
    (a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

// ---- The list screen: queue chips, attention tiles, empty messages (same rules as the PWA) ----

type QueueKey = (typeof MAINTENANCE_QUEUES)[number]["value"];
type Counts = Partial<Record<QueueKey | "critical", number>> | null;

/** The queue chips worth showing: the always-useful ones, plus any with something in them, plus the one open now. */
export function visibleQueues(counts: Counts, current: QueueKey) {
  const always: QueueKey[] = ["open", "mine", "closed"];
  return MAINTENANCE_QUEUES.filter((q) =>
    // "To pay" is money: never shown before the counts arrive, and only when something is waiting.
    q.value === "payments"
      ? q.value === current || (!!counts && (counts.payments ?? 0) > 0)
      : always.includes(q.value) ||
        q.value === current ||
        !counts ||
        (counts[q.value] ?? 0) > 0,
  ).map((q) => ({
    value: q.value,
    label: q.label,
    count: counts ? (counts[q.value] ?? 0) : null,
  }));
}

export type AttentionTile = {
  queue: QueueKey;
  label: string;
  count: number;
  tone: "bad" | "warn" | "info";
};

export function attentionTiles(
  counts: (Counts & { payments_overdue?: number }) | null,
  caps: { handle: boolean; approve: boolean; pay: boolean } | undefined,
): AttentionTile[] {
  if (!counts || !caps) return [];
  const n = (k: QueueKey | "critical") => counts[k] ?? 0;
  const tiles: AttentionTile[] = [];
  if (n("critical") > 0)
    tiles.push({ queue: "open", label: "Critical", count: n("critical"), tone: "bad" });
  if (caps.pay && n("payments") > 0)
    tiles.push({
      queue: "payments",
      label: "To pay",
      count: n("payments"),
      tone: (counts.payments_overdue ?? 0) > 0 ? "bad" : "warn",
    });
  if (caps.approve && n("awaiting_approval") > 0)
    tiles.push({ queue: "awaiting_approval", label: "To approve", count: n("awaiting_approval"), tone: "warn" });
  if (n("on_hold") > 0)
    tiles.push({ queue: "on_hold", label: "On hold", count: n("on_hold"), tone: "bad" });
  if (caps.handle && n("verify") > 0)
    tiles.push({ queue: "verify", label: "To check", count: n("verify"), tone: "info" });
  if (caps.handle && n("need_quote") > 0)
    tiles.push({ queue: "need_quote", label: "Need a quote", count: n("need_quote"), tone: "info" });
  return tiles;
}

/** What an empty queue says, so it never looks broken. */
export function emptyMessage(queue: QueueKey): { title: string; hint: string } {
  switch (queue) {
    case "closed":
      return { title: "Nothing closed yet", hint: "Finished jobs end up here." };
    case "mine":
      return { title: "Nothing of yours", hint: "Jobs you report or handle show up here." };
    case "awaiting_approval":
      return { title: "Nothing to approve", hint: "Quotes waiting for a decision appear here." };
    case "payments":
      return { title: "Nothing to pay", hint: "Deposits and invoices waiting for payment appear here." };
    case "on_hold":
      return { title: "Nothing on hold", hint: "Jobs stopped by an unpaid deposit or invoice appear here." };
    default:
      return { title: "All clear", hint: "No faults waiting. Report one if you spot something." };
  }
}
