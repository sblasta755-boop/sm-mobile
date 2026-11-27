import type {
  MaintenanceCapabilities,
  MaintenanceJob,
  MaintenanceState,
} from "../api/client";

/** The job screen's rules, same as the PWA (lib/smartclean/maintenanceView.ts): progress stops, which actions to offer, where an invoice stands. */

const CLOSED = ["completed", "no_action", "rejected", "cancelled"];

export type StepState = "done" | "current" | "todo";

/** The road a job is on, for the little progress bar: a contractor job has more stops than an in-house one. */
export function progressSteps(
  job: Pick<MaintenanceJob, "state" | "path">,
): { label: string; state: StepState }[] {
  const labels =
    job.path === "internal"
      ? ["Reported", "Repair", "Checked"]
      : ["Reported", "Quote", "Approved", "Visit", "Done"];
  // Which stop the state sits at (0-based). A job that ended without a repair stops where it ended.
  const at: Record<string, number> =
    job.path === "internal"
      ? {
          reported: 0,
          investigating: 0,
          in_progress: 1,
          rework: 1,
          awaiting_verification: 2,
          completed: 3,
        }
      : {
          reported: 0,
          investigating: 0,
          awaiting_quote: 1,
          awaiting_approval: 1,
          approved: 2,
          scheduled: 3,
          in_progress: 3,
          rework: 3,
          awaiting_verification: 3,
          completed: 5,
        };
  const index = at[job.state] ?? 0;
  return labels.map((label, i) => ({
    label,
    state: i < index ? "done" : i === index ? "current" : "todo",
  }));
}

// ---- The actions on a job ---------------------------------------------------------------

export type JobActionId =
  | "investigate"
  | "add_quote"
  | "review_quote"
  | "start_repair"
  | "book_visit"
  | "work_started"
  | "ready_to_check"
  | "close"
  | "redo"
  | "start_again"
  | "no_repair"
  | "cancel"
  | "contractor_refusing"
  | "skip_next"
  | "skip_choose"
  | "close_early";

/** Every step a job could be skipped to from here, for organisations that let people choose. */
export function skipTargets(
  state: string,
  path: string,
): { to: MaintenanceState; label: string }[] {
  const all: { to: MaintenanceState; label: string; quote?: boolean }[] = [
    { to: "investigating", label: "Being looked into" },
    { to: "awaiting_quote", label: "Getting a quote", quote: true },
    { to: "awaiting_approval", label: "Waiting for approval", quote: true },
    { to: "approved", label: "Approved" },
    { to: "scheduled", label: "Visit booked" },
    { to: "in_progress", label: "Work in progress" },
    { to: "awaiting_verification", label: "Ready to check" },
  ];
  return all.filter((s) => s.to !== state && !(s.quote && path === "internal"));
}

/** The stage after this one, for someone given the right to skip. Null when there is nothing to skip to. */
export function nextStage(
  state: string,
  path: string,
): { to: MaintenanceState; label: string } | null {
  const internal = path === "internal";
  switch (state) {
    case "reported":
      return { to: "investigating", label: "Being looked into" };
    case "investigating":
      return internal
        ? { to: "in_progress", label: "Work in progress" }
        : { to: "approved", label: "Approved, no quote needed" };
    case "awaiting_quote":
    case "awaiting_approval":
      return { to: "approved", label: "Approved, no quote needed" };
    case "approved":
      return { to: "scheduled", label: "Visit booked" };
    case "scheduled":
    case "rework":
      return { to: "in_progress", label: "Work in progress" };
    case "in_progress":
      return { to: "awaiting_verification", label: "Ready to check" };
    case "awaiting_verification":
      return { to: "completed", label: "Done" };
    default:
      return null;
  }
}

export type JobAction = { id: JobActionId; label: string };

const A = (id: JobActionId, label: string): JobAction => ({ id, label });

/**
 * What a person can do to this job right now: ONE main action (the thing the stage is waiting for) and the
 * rest tucked behind "More". A person never has to work out which of five buttons is the one that moves
 * the job along.
 */
export function jobActions(
  job: Pick<MaintenanceJob, "state" | "path" | "clearedToProceed" | "activeHolds" | "skipMode">,
  caps: MaintenanceCapabilities | undefined,
): { primary: JobAction | null; more: JobAction[] } {
  const can: MaintenanceCapabilities = caps ?? { report: true, handle: false, approve: false, pay: false };
  const more: JobAction[] = [];
  let primary: JobAction | null = null;
  const closed = CLOSED.includes(job.state);

  if (can.handle && !closed) {
    switch (job.state) {
      case "reported":
        primary = A("investigate", "Look into it");
        more.push(
          job.path === "internal"
            ? A("start_repair", "Start the repair")
            : A("add_quote", "Add a quote"),
        );
        more.push(A("no_repair", "No repair needed"));
        break;
      case "investigating":
        primary =
          job.path === "internal"
            ? A("start_repair", "Start the repair")
            : A("add_quote", "Add a quote");
        more.push(A("no_repair", "No repair needed"));
        break;
      case "awaiting_quote":
        primary = A("add_quote", "Add a quote");
        more.push(A("contractor_refusing", "Contractor is refusing or delaying"));
        break;
      case "awaiting_approval":
        more.push(A("add_quote", "Add another quote"));
        break;
      case "approved":
        if (job.clearedToProceed && job.activeHolds === 0)
          primary = A("book_visit", "Book the contractor");
        more.push(A("contractor_refusing", "Contractor is refusing or delaying"));
        break;
      case "scheduled":
        primary = A("work_started", "Work has started");
        more.push(A("contractor_refusing", "Contractor is refusing or delaying"));
        break;
      case "in_progress":
        primary = A("ready_to_check", "Ready to check");
        break;
      case "awaiting_verification":
        primary = A("close", "Repair is good: close the job");
        more.push(A("redo", "Needs doing again"));
        break;
      case "rework":
        primary = A("start_again", "Start again");
        break;
    }
  }
  if (can.approve && job.state === "awaiting_approval")
    primary = A("review_quote", "Review the quote");
  // Cancelling is always there for a handler, never the main thing, and never on a job waiting to be checked.
  if (can.handle && !closed && job.state !== "awaiting_verification")
    more.push(A("cancel", "Cancel the job"));
  // Someone who has been given the override right can always skip a step or close early, with a reason.
  if (can.override && !closed) {
    const next = nextStage(job.state, job.path);
    if (next && job.skipMode === "choose") more.push(A("skip_choose", "Skip to another step"));
    else if (next) more.push(A("skip_next", `Skip to: ${next.label}`));
    more.push(A("close_early", "Close early"));
  }
  return { primary, more };
}

export type InvoiceNext = {
  text: string;
  action: "record_proof" | "verify" | "forwarded" | "acknowledged" | null;
  label: string | null;
};

type InvoiceLike = {
  state: string;
  popFiles: unknown[];
  popForwardedAt: string | null;
  contractorAckAt: string | null;
};

/** In plain words, where an invoice or deposit stands, and the one thing that moves it on for this person. */
export function invoiceNext(
  invoice: InvoiceLike,
  caps: MaintenanceCapabilities | undefined,
): InvoiceNext {
  const can: MaintenanceCapabilities = caps ?? { report: true, handle: false, approve: false, pay: false };
  switch (invoice.state) {
    case "paid": {
      const canForward = (can.handle || can.pay) && invoice.popFiles.length > 0;
      if (canForward && !invoice.popForwardedAt) {
        return {
          text: "Paid. The contractor still needs the proof",
          action: "forwarded",
          label: "I sent the proof to the contractor",
        };
      }
      if (canForward && invoice.popForwardedAt && !invoice.contractorAckAt) {
        return {
          text: "Paid and the proof is with the contractor",
          action: "acknowledged",
          label: "Contractor got it",
        };
      }
      return { text: "Paid", action: null, label: null };
    }
    case "pop_recorded":
      return can.pay
        ? {
            text: "Proof recorded. Waiting for you to confirm the payment went through",
            action: "verify",
            label: "Confirm it went through",
          }
        : {
            text: "Proof recorded. Waiting for the payment to be confirmed",
            action: null,
            label: null,
          };
    case "part_paid":
    case "unpaid":
      return can.pay
        ? {
            text:
              invoice.state === "part_paid" ? "Part paid. The rest is still owing" : "Not paid yet",
            action: "record_proof",
            label: "Record the payment",
          }
        : {
            text: invoice.state === "part_paid" ? "Part paid" : "Waiting to be paid",
            action: null,
            label: null,
          };
    case "disputed":
      return { text: "Disputed", action: null, label: null };
    default:
      return { text: invoice.state, action: null, label: null };
  }
}

/** "1 250,50", "1250.5" or "R 400" read as an amount; null if it is not a number. */
export function readAmount(text: string): number | null {
  const cleaned = text.replace(/[R\s]/gi, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}
