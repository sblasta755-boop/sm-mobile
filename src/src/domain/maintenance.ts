import type { MaintenanceSeverity, MaintenanceState } from "../api/client";

export const MAINTENANCE_STATE_LABEL: Record<MaintenanceState, string> = {
  reported: "Reported",
  investigating: "Investigating",
  awaiting_quote: "Awaiting quote",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  awaiting_verification: "To verify",
  completed: "Completed",
  no_action: "No action needed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  rework: "Rework",
};

export const MAINTENANCE_QUEUES = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "need_quote", label: "Need a quote" },
  { value: "awaiting_approval", label: "Approval" },
  { value: "on_hold", label: "On hold" },
  { value: "scheduled", label: "Scheduled" },
  { value: "verify", label: "To verify" },
  { value: "closed", label: "Closed" },
] as const;

export const MAINTENANCE_SEVERITIES: readonly MaintenanceSeverity[] = ["low", "medium", "high", "critical"];

export type MaintenanceTone = "success" | "warning" | "danger" | "info" | "muted";

export function maintenanceStateTone(state: MaintenanceState): MaintenanceTone {
  if (state === "completed") return "success";
  if (state === "rejected" || state === "cancelled" || state === "no_action") return "muted";
  if (state === "rework") return "danger";
  if (state === "awaiting_approval" || state === "awaiting_verification") return "warning";
  return "info";
}

export function maintenanceSeverityTone(severity: MaintenanceSeverity): MaintenanceTone {
  return severity === "critical" ? "danger" : severity === "high" ? "warning" : "muted";
}

export function formatRand(value: number | null | undefined): string {
  return value == null ? "-" : `R ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-11-12 09:30" (or with a T) read as the phone's local time. Null when it is not a real date and time. */
export function parseLocalDateTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // new Date rolls 31 Feb over to March; a date that changed under us was not real.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
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
  user: { role?: string; maintenance?: { access?: boolean; handle?: boolean; approve?: boolean; pay?: boolean } } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "org_admin" || user.role === "operations_manager") return true;
  const grants = user.maintenance;
  return !!grants && (grants.access === true || grants.handle === true || grants.approve === true || grants.pay === true);
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
    return { text: can.pay ? "On hold: a payment needs sorting out" : "On hold while a payment is sorted out", tone: "blocked" };
  }
  switch (job.state) {
    case "reported":
      return can.handle ? { text: "Pick this up and look into it", tone: "yours" } : { text: "Waiting for someone to pick it up", tone: "waiting" };
    case "investigating":
      return can.handle
        ? { text: job.path === "internal" ? "Start the repair" : "Find out what is needed, then ask for a quote", tone: "yours" }
        : { text: "Being looked into", tone: "waiting" };
    case "awaiting_quote":
      return can.handle ? { text: "Get a quote from a supplier", tone: "yours" } : { text: "Getting a quote", tone: "waiting" };
    case "awaiting_approval":
      return can.approve ? { text: "A quote is waiting for your approval", tone: "yours" } : { text: "Waiting for approval", tone: "waiting" };
    case "approved":
      if (!job.clearedToProceed) return { text: job.clearedBlockers.join(" ") || "Not cleared to start yet", tone: "blocked" };
      return can.handle ? { text: "Book the contractor", tone: "yours" } : { text: "Ready to book", tone: "waiting" };
    case "scheduled":
      return {
        text: job.visitAt ? `Contractor comes ${new Date(job.visitAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}` : "Visit booked",
        tone: "waiting",
      };
    case "in_progress":
      return { text: "Repair under way", tone: "waiting" };
    case "awaiting_verification":
      return can.handle ? { text: "Check the repair and close the job", tone: "yours" } : { text: "Waiting for the repair to be checked", tone: "waiting" };
    case "rework":
      return can.handle ? { text: "Needs doing again", tone: "yours" } : { text: "Being redone", tone: "waiting" };
    default:
      return { text: "", tone: "waiting" };
  }
}

/** Critical first, then what is on you, then the most recently touched. */
export function sortJobs<T extends JobLike>(jobs: T[], caps: Caps): T[] {
  const rank = (j: T) => (j.severity === "critical" ? 0 : nextStep(j, caps).tone === "yours" ? 1 : 2);
  return [...jobs].sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
}
