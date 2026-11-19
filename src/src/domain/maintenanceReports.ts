import { longDate } from "./managementReport";
import { chart, daysBetween, dm, plural, pct, r1, ranked, sum, txt } from "./attendanceReports";
import { flattenDoc, type ReportCallout, type ReportDoc, type ReportGroup } from "./reportDoc";
import type { ChartSpec } from "./scheduleAnalysis";
import { weekStart } from "./scheduleDates";

export type MaintenanceReportKind = "workorder" | "register" | "contractors" | "cost";

export const MAINTENANCE_REPORTS: { kind: MaintenanceReportKind; label: string; hint: string; period: boolean }[] = [
  { kind: "workorder", label: "Work-order service report", hint: "One job from report to payment: timeline, evidence, cost and sign-off.", period: false },
  { kind: "register", label: "Maintenance job register", hint: "Every job reported in a period, with status, age and cost.", period: true },
  { kind: "contractors", label: "Contractor performance", hint: "Jobs, speed, spend and rework for each contractor.", period: true },
  { kind: "cost", label: "Maintenance cost and payments", hint: "Approved, final, invoiced and paid amounts, and what is still owed.", period: true },
];

export const MAINTENANCE_MAX_DAYS = 366;

// ---- Input shapes (both apps' job records fit these) ----

export interface McEvent {
  id?: string;
  kind: string;
  actorName: string | null;
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
}
export interface McQuote {
  contractorName: string;
  reference: string | null;
  amount: number;
  depositAmount: number;
  revision: number;
  status: string;
  createdAt: string;
  decisionComment?: string | null;
}
export interface McInvoice {
  contractorName: string;
  kind: string;
  number: string | null;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  state: string;
  popFiles?: unknown[];
  popPendingAmount?: number;
}
export interface McJob {
  id: string;
  siteId: string;
  locationId: string | null;
  assetLabel: string | null;
  title: string;
  description: string;
  severity: string;
  reporterId?: string;
  handlerId: string | null;
  path: string;
  state: string;
  diagnosis?: string;
  contractorId?: string | null;
  approvedAmount: number | null;
  visitAt: string | null;
  finalCost?: number | null;
  evidence: { id?: string; filePath: string; label?: string }[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  approval?: string;
  activeHolds: number;
  events?: McEvent[];
  quotes?: McQuote[];
  invoices?: McInvoice[];
  holds?: { reason: string; note: string; active: boolean; createdAt: string }[];
}

export interface MaintenanceReportInput {
  kind: MaintenanceReportKind;
  siteName: string;
  /** Site-local today and the current instant, to age open jobs. */
  today: string;
  nowIso: string;
  start: string;
  end: string;
  jobs: McJob[];
  /** Full record of one job (with events, quotes and invoices) for the work-order report. */
  job?: McJob | null;
  /** Full records of jobs with a contractor, for the cost report. */
  details?: McJob[];
  people: Record<string, string>;
  locations: Record<string, string>;
  contractors: Record<string, string>;
  /** Evidence picture addresses already made usable, by file path. */
  photoSrc?: (filePath: string) => string | null;
}

export interface MaintenanceReport extends ReportDoc {
  kind: MaintenanceReportKind;
}

// ---- Words and numbers ----

const TERMINAL = ["completed", "no_action", "rejected", "cancelled"];
const STATE: Record<string, string> = {
  reported: "Reported",
  investigating: "Looking into it",
  awaiting_quote: "Waiting for a quote",
  awaiting_approval: "Waiting for approval",
  approved: "Approved",
  scheduled: "Contractor booked",
  in_progress: "Work started",
  awaiting_verification: "Ready to be checked",
  completed: "Completed",
  no_action: "No repair needed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  rework: "Sent back to redo",
};
const SEVERITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const EVENT: Record<string, string> = {
  reported: "Fault reported",
  updated: "Details changed",
  comment: "Note added",
  supplier_response: "Contractor replied",
  supplier_refused: "Contractor is refusing or delaying",
  quote_submitted: "Quote added",
  quote_approved: "Quote approved",
  quote_rejected: "Quote rejected",
  quote_changes_requested: "Changes asked for on the quote",
  invoice_recorded: "Invoice recorded",
  cost_recorded: "Final cost recorded",
  pop_recorded: "Proof of payment added",
  payment_verified: "Payment confirmed",
  pop_forwarded: "Proof sent to the contractor",
  hold_placed: "Put on hold",
  hold_released: "Hold lifted",
};
const PAY: Record<string, string> = { unpaid: "Unpaid", pop_recorded: "Proof added, to be verified", part_paid: "Part paid", paid: "Paid", disputed: "Disputed" };
const QUOTE: Record<string, string> = { submitted: "Waiting", approved: "Approved", rejected: "Rejected", changes_requested: "Changes asked", superseded: "Replaced" };

/** "R13 723.60": rand with a space for thousands, never locale dependent. */
export const rand = (n: number | null | undefined): string => {
  if (n == null) return "";
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
};
const SAST = 120 * 60000;
const localDay = (iso: string) => new Date(Date.parse(iso) + SAST).toISOString().slice(0, 10);
const stamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + SAST).toISOString();
  return `${Number(d.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1]} ${d.slice(11, 16)}`;
};
const mins = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
const span = (m: number) => (m < 90 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${txt(r1(m / 1440))} days`);
const code = (id: string) => `MNT-${id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
const days = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const sevLabel = (s: string) => SEVERITY[s] ?? s;
const stateLabel = (s: string) => STATE[s] ?? s.replace(/_/g, " ");
const isOpen = (j: McJob) => !TERMINAL.includes(j.state);
const routeLabel = (j: McJob, c: Record<string, string>) => (j.path === "contractor" ? (j.contractorId ? (c[j.contractorId] ?? "Contractor") : "Contractor (not chosen)") : "Internal team");
const where = (j: McJob, loc: Record<string, string>) => [j.locationId ? loc[j.locationId] : "", j.assetLabel ?? ""].filter(Boolean).join(" / ");
const closedAtOf = (j: McJob) => j.closedAt ?? (isOpen(j) ? null : j.updatedAt);

export function buildMaintenanceReport(input: MaintenanceReportInput): MaintenanceReport {
  const def = MAINTENANCE_REPORTS.find((r) => r.kind === input.kind)!;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const jobs = input.jobs.filter((j) => localDay(j.createdAt) >= input.start && localDay(j.createdAt) <= input.end);
  const base = {
    kind: input.kind,
    eyebrow: "MAINTENANCE",
    title: def.label,
    period: def.period ? `${longDate(input.start)} - ${longDate(input.end)}` : "",
    start: input.start,
    end: input.end,
    filename: `${slug(def.label)}-${slug(input.siteName)}-${input.start}-to-${input.end}`,
    details: [] as { k: string; v: string }[],
  };
  if (input.kind === "workorder") return workOrder(base, input);
  if (input.kind === "register") return register(base, input, jobs);
  if (input.kind === "contractors") return contractors(base, input, jobs);
  return cost(base, input, jobs);
}

type Base = Omit<MaintenanceReport, "kpis" | "header" | "groups" | "hiddenColumns" | "note" | "insights" | "charts">;

// ---- Work-order service report (one job, like the template) ----

function workOrder(base: Base, input: MaintenanceReportInput): MaintenanceReport {
  const job = input.job;
  if (!job) return { ...base, title: "Work-order service report", period: "", kpis: [], header: [], groups: [], hiddenColumns: [], note: "", insights: [], charts: [] };
  const name = (id: string | null | undefined) => (id ? (input.people[id] ?? "") : "");
  const events = [...(job.events ?? [])].sort((a, z) => a.createdAt.localeCompare(z.createdAt));
  const quotes = job.quotes ?? [];
  const invoices = job.invoices ?? [];
  const first = (pred: (e: McEvent) => boolean) => events.find(pred);
  const stateTo = (to: string) => events.find((e) => e.kind === "state" && String(e.data?.to) === to);
  const reportedAt = job.createdAt;
  const ack = events.find((e) => e.kind !== "reported" && e.createdAt > reportedAt);
  const quoteIn = first((e) => e.kind === "quote_submitted");
  const quoteOk = first((e) => e.kind === "quote_approved");
  const booked = stateTo("scheduled");
  const started = stateTo("in_progress");
  const done = stateTo("awaiting_verification") ?? stateTo("completed");
  const end = closedAtOf(job) ?? input.nowIso;
  const open = isOpen(job);
  const evidence = job.evidence ?? [];
  const approvedQuote = quotes.find((q) => q.status === "approved");
  const invoiced = invoices.reduce((n, i) => n + i.amount, 0);
  const paid = invoices.reduce((n, i) => n + i.paidAmount, 0);
  const balance = invoices.reduce((n, i) => n + i.balance, 0);
  const contractor = job.contractorId ? (input.contractors[job.contractorId] ?? approvedQuote?.contractorName ?? "") : "";

  const phases: { label: string; m: number }[] = [];
  const step = (label: string, from: string | undefined, to: string | undefined) => {
    if (from && to && to >= from) phases.push({ label, m: mins(from, to) });
  };
  step("First response", reportedAt, ack?.createdAt);
  step("Quote received", ack?.createdAt ?? reportedAt, quoteIn?.createdAt);
  step("Quote approved", quoteIn?.createdAt, quoteOk?.createdAt);
  step("Work started", quoteOk?.createdAt ?? booked?.createdAt, started?.createdAt);
  step("Work done", started?.createdAt, done?.createdAt);
  step("Checked and closed", done?.createdAt, closedAtOf(job) ?? undefined);

  const insights: string[] = [];
  insights.push(`${open ? `Open for ${span(mins(reportedAt, end))}` : `Closed after ${span(mins(reportedAt, end))}`}. Now: ${stateLabel(job.state).toLowerCase()}.`);
  if (ack) insights.push(`First response came ${span(mins(reportedAt, ack.createdAt))} after the fault was reported${ack.actorName ? ` (${ack.actorName})` : ""}.`);
  if (phases.length > 1) {
    const slow = [...phases].sort((a, z) => z.m - a.m)[0];
    insights.push(`The longest wait was "${slow.label.toLowerCase()}": ${span(slow.m)}, ${pct(slow.m, phases.reduce((n, p) => n + p.m, 0))} of the time recorded.`);
  }
  if (approvedQuote) {
    const over = job.finalCost != null && job.approvedAmount != null ? job.finalCost - job.approvedAmount : 0;
    insights.push(
      over > 0 ? `Final cost ${rand(job.finalCost)} is ${rand(over)} over the approved ${rand(job.approvedAmount)}.` : `Approved at ${rand(approvedQuote.amount)}${job.finalCost != null ? `; final cost ${rand(job.finalCost)} is within it` : ""}.`,
    );
  }
  if (quotes.length > 1) insights.push(`${plural(quotes.length, "quote")} were received (${quotes.filter((q) => q.status === "superseded").length} replaced by a revision).`);
  if (invoices.length) insights.push(`${rand(paid)} of ${rand(invoiced)} invoiced has been paid; ${rand(balance)} is outstanding.`);
  if (!evidence.length) insights.push("No photographs are attached to this job.");
  if (job.activeHolds > 0) insights.push(`${plural(job.activeHolds, "hold")} is active and blocks progress.`);
  const refusals = events.filter((e) => e.kind === "supplier_refused").length;
  if (refusals) insights.push(`The contractor was recorded as refusing or delaying ${refusals} time${refusals > 1 ? "s" : ""}.`);

  const callouts: ReportCallout[] = [];
  if (open) callouts.push({ tone: "warn", title: "Management decision", text: "This work order is still open. A completed repair, an uploaded invoice or a proof of payment does not close it by itself: the work must be checked and accepted." });
  if (!evidence.length) callouts.push({ tone: "info", title: "Evidence", text: "No photographs were attached to this job, so operational acceptance rests on the written record only." });

  const timeline: ReportGroup = {
    title: "Event timeline",
    note: "All times are site-local (SAST, UTC+02:00).",
    header: ["Date / time", "Event", "Actor / record"],
    rows: events.map((e) => {
      const text = e.kind === "state" ? (STATE[String(e.data?.to)] ?? e.message) : (EVENT[e.kind] ?? e.kind.replace(/_/g, " "));
      return [stamp(e.createdAt), e.message && e.message !== text && e.kind !== "state" ? `${text}: ${e.message}` : text, e.actorName ?? "System"];
    }),
  };
  const groups: ReportGroup[] = [timeline];
  if (quotes.length)
    groups.push({
      title: "Quotations",
      header: ["Contractor", "Reference", "Revision", "Amount", "Deposit", "Status", "Received"],
      rows: quotes.map((q) => [q.contractorName, q.reference ?? "", String(q.revision), rand(q.amount), q.depositAmount ? rand(q.depositAmount) : "None", QUOTE[q.status] ?? q.status, stamp(q.createdAt)]),
    });
  if (invoices.length)
    groups.push({
      title: "Invoices and payments",
      note: "Proof of payment must be independently verified before an invoice is treated as paid.",
      header: ["Record", "Number", "Amount", "Paid", "Balance", "Due", "Status"],
      rows: invoices.map((i) => [i.kind === "deposit" ? "Deposit" : "Invoice", i.number ?? "", rand(i.amount), rand(i.paidAmount), rand(i.balance), i.dueDate ?? "", PAY[i.state] ?? i.state]),
    });
  const chain: string[][] = [
    ["Reported", name(job.reporterId) || "Reporter", stamp(reportedAt)],
    ["Handler / diagnosis", name(job.handlerId) || "Not assigned", job.diagnosis ? job.diagnosis : "No diagnosis recorded"],
    ["Quote approval", approvedQuote ? `${approvedQuote.contractorName} ${rand(approvedQuote.amount)}` : job.path === "contractor" ? "No quote approved" : "Not needed (internal)", quoteOk ? `${quoteOk.actorName ?? ""} ${stamp(quoteOk.createdAt)}`.trim() : job.path === "contractor" ? "Pending" : "-"],
    ["Work", contractor || "Internal team", done ? `Declared done ${stamp(done.createdAt)}` : started ? `Started ${stamp(started.createdAt)}` : booked ? `Booked ${stamp(booked.createdAt)}` : "Not started"],
    ["Acceptance", open ? "Awaiting verification and release" : stateLabel(job.state), closedAtOf(job) ? stamp(closedAtOf(job)!) : "Pending"],
    ["Payment", invoices.length ? `${rand(paid)} of ${rand(invoiced)}` : "No invoice recorded", invoices.length ? (balance > 0 ? "Outstanding" : "Settled") : "-"],
  ];
  groups.push({ title: "Verification chain", header: ["Stage / role", "Person / decision", "Time / status"], rows: chain });

  const todo: string[][] = [];
  const NEXT: Record<string, [string, string]> = {
    reported: ["Take the job and look into it", "Handler"],
    investigating: ["Diagnose the fault and decide the route", "Handler"],
    awaiting_quote: ["Obtain and record a contractor quote", "Handler"],
    awaiting_approval: ["Decide on the quote", "Approver"],
    approved: ["Book the contractor", "Handler"],
    scheduled: ["Contractor attends and starts work", "Contractor"],
    in_progress: ["Complete the work and declare it done", "Contractor"],
    awaiting_verification: ["Inspect, accept and close the job", "Handler / site manager"],
    rework: ["Redo the work and declare it done again", "Contractor"],
  };
  if (NEXT[job.state]) todo.push([NEXT[job.state][0], NEXT[job.state][1], "Before the job can close"]);
  for (const h of job.holds ?? []) if (h.active) todo.push([`Release the hold: ${h.note || h.reason}`, "Approver / payer", "Blocks progress"]);
  for (const i of invoices) {
    if (i.balance > 0) todo.push([`Pay ${i.kind === "deposit" ? "the deposit" : `invoice ${i.number ?? ""}`.trim()} (${rand(i.balance)} outstanding)`, "Finance", i.dueDate ? `Due ${i.dueDate}` : "After approval"]);
    if ((i.popPendingAmount ?? 0) > 0) todo.push([`Verify the proof of payment (${rand(i.popPendingAmount)})`, "Finance / verifier", "After payment submission"]);
  }
  if (!evidence.length && open) todo.push(["Attach photographs of the fault and the finished work", "Handler", "Before acceptance"]);
  groups.push({ title: "Outstanding actions", header: ["Action", "Owner", "Target / blocker"], rows: todo.length ? todo : [["None. All steps are complete.", "-", "-"]] });

  const charts: ChartSpec[] = [
    ...chart({ title: "Where the time went", caption: "Time spent in each stage of the job, in hours.", type: "bars", unit: "h", items: phases.map((p) => ({ label: p.label, value: r1(p.m / 60) })).filter((i) => i.value > 0) }),
    ...chart({ title: "Cost position", caption: "Quoted, approved, final cost, invoiced and paid amounts, in rand.", type: "bars", unit: "", items: [
      { label: "Approved quote", value: approvedQuote?.amount ?? 0 },
      { label: "Approved amount", value: job.approvedAmount ?? 0 },
      { label: "Final cost", value: job.finalCost ?? 0 },
      { label: "Invoiced", value: invoiced },
      { label: "Paid", value: paid },
    ].filter((i) => i.value > 0) }),
  ];

  const respAfterStart = started && booked ? mins(booked.createdAt, started.createdAt) : null;
  return {
    ...base,
    title: "Maintenance service report",
    period: `${job.title} | ${longDate(localDay(reportedAt))}`,
    start: localDay(reportedAt),
    end: localDay(end),
    filename: `maintenance-service-report-${code(job.id).toLowerCase()}`,
    details: [
      { k: "Work order", v: code(job.id) },
      { k: "Site / location", v: [input.siteName, job.locationId ? input.locations[job.locationId] : ""].filter(Boolean).join(" / ") },
      { k: "Asset", v: job.assetLabel ?? "-" },
      { k: "Priority", v: sevLabel(job.severity) },
      { k: "Route", v: job.path === "contractor" ? "Contractor" : "Internal team" },
      { k: "Reported by", v: `${name(job.reporterId) || "-"} on ${stamp(reportedAt)}` },
      { k: "Handled by", v: name(job.handlerId) || "Not assigned" },
      { k: "Contractor", v: contractor || "-" },
      { k: "Operational status", v: stateLabel(job.state) },
      { k: "Financial status", v: invoices.length ? (balance > 0 ? `${rand(balance)} outstanding` : "Settled") : approvedQuote ? "Quote approved, no invoice yet" : "No commercial record" },
    ],
    summary: { title: "Management summary", text: job.description || "No more detail was given." },
    callouts,
    photos: evidence.length
      ? { title: "Evidence photographs", items: evidence.map((p, i) => ({ src: input.photoSrc?.(p.filePath) ?? null, caption: p.label || `Photo ${i + 1}` })) }
      : undefined,
    kpis: [
      { label: "Priority", value: sevLabel(job.severity) },
      { label: "First response", value: ack ? span(mins(reportedAt, ack.createdAt)) : "None yet" },
      { label: respAfterStart != null ? "Booked to started" : "Work started", value: respAfterStart != null ? span(respAfterStart) : started ? stamp(started.createdAt) : "Not yet" },
      { label: open ? "Open for" : "Time to close", value: span(mins(reportedAt, end)) },
    ],
    header: ["Item", "Detail"],
    groups,
    hiddenColumns: [],
    note: "Interruption and response times are measured from the time recorded on the job. No response-target compliance is claimed.",
    insights,
    charts,
  };
}

// ---- Job register ----

function register(base: Base, input: MaintenanceReportInput, jobs: McJob[]): MaintenanceReport {
  const { contractors: cn, locations: loc, nowIso } = input;
  const age = (j: McJob) => days(j.createdAt, closedAtOf(j) ?? nowIso);
  const rows = (list: McJob[]) =>
    [...list]
      .sort((a, z) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[z.severity] ?? 9) || a.createdAt.localeCompare(z.createdAt))
      .map((j) => [code(j.id), localDay(j.createdAt), j.title, where(j, loc), sevLabel(j.severity), routeLabel(j, cn), stateLabel(j.state), String(age(j)), j.approvedAmount == null ? "" : rand(j.approvedAmount), j.finalCost == null ? "" : rand(j.finalCost)]);
  const open = jobs.filter(isOpen);
  const done = jobs.filter((j) => j.state === "completed");
  const shut = jobs.filter((j) => TERMINAL.includes(j.state) && j.state !== "completed");
  const groups: ReportGroup[] = [
    { title: `Open jobs (${open.length})`, rows: rows(open) },
    { title: `Completed (${done.length})`, rows: rows(done) },
    { title: `Closed without repair (${shut.length})`, rows: rows(shut) },
  ].filter((g) => g.rows.length > 0);

  const insights: string[] = [];
  if (jobs.length) {
    insights.push(`${plural(jobs.length, "job")} reported in the period: ${open.length} still open, ${done.length} completed and ${shut.length} closed without a repair.`);
    const urgent = open.filter((j) => j.severity === "critical" || j.severity === "high");
    if (urgent.length) insights.push(`${plural(urgent.length, "open job")} ${urgent.length === 1 ? "is" : "are"} high or critical: ${urgent.slice(0, 4).map((j) => j.title).join("; ")}${urgent.length > 4 ? "; and more" : ""}.`);
    const old = open.filter((j) => age(j) > 7);
    if (old.length) insights.push(`${plural(old.length, "open job")} ${old.length === 1 ? "has" : "have"} been open more than 7 days; the oldest is "${[...old].sort((a, z) => age(z) - age(a))[0].title}" at ${age([...old].sort((a, z) => age(z) - age(a))[0])} days.`);
    if (done.length) {
      const t = done.map(age);
      insights.push(`Completed jobs took ${txt(r1(t.reduce((n, x) => n + x, 0) / t.length))} days on average to close; the slowest took ${Math.max(...t)} days.`);
    }
    const held = jobs.filter((j) => j.activeHolds > 0 && isOpen(j)).length;
    if (held) insights.push(`${plural(held, "open job")} ${held === 1 ? "is" : "are"} on hold.`);
    const byPlace = new Map<string, number>();
    for (const j of jobs) sum(byPlace, where(j, loc) || "No location");
    const repeat = [...byPlace.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
    if (repeat.length) insights.push(`Repeat trouble spots: ${repeat.slice(0, 4).map(([p, n]) => `${p} (${n} jobs)`).join(", ")}. Consider a permanent fix.`);
    const rework = jobs.filter((j) => j.state === "rework").length;
    if (rework) insights.push(`${plural(rework, "job")} ${rework === 1 ? "was" : "were"} sent back to be redone.`);
  }
  const bySeverity = new Map<string, number>();
  const byState = new Map<string, number>();
  const byPlace = new Map<string, number>();
  for (const j of jobs) {
    sum(bySeverity, sevLabel(j.severity));
    sum(byState, stateLabel(j.state));
    sum(byPlace, where(j, loc) || "No location");
  }
  const span_ = daysBetween(input.start, input.end);
  const perBucket = new Map<string, number>();
  const weekly = span_.length > 31;
  for (const j of jobs) sum(perBucket, weekly ? weekStart(localDay(j.createdAt)) : localDay(j.createdAt));
  const buckets = weekly ? [...new Set(span_.map(weekStart))] : span_;
  const ages = [
    ["Under 3 days", (a: number) => a < 3],
    ["3 to 7 days", (a: number) => a >= 3 && a <= 7],
    ["8 to 30 days", (a: number) => a > 7 && a <= 30],
    ["Over 30 days", (a: number) => a > 30],
  ] as const;
  const charts: ChartSpec[] = jobs.length === 0 ? [] : [
    ...chart({ title: "Jobs by status", caption: "Where every job reported in the period stands.", type: "bars", unit: "", items: ranked(byState, 10) }),
    ...chart({ title: "Jobs by priority", caption: "How urgent the reported faults were.", type: "bars", unit: "", items: (["Critical", "High", "Medium", "Low"] as const).map((l) => ({ label: l, value: bySeverity.get(l) ?? 0 })).filter((i) => i.value > 0) }),
    ...chart({ title: weekly ? "Jobs reported per week" : "Jobs reported per day", caption: weekly ? "Each column is one week, labelled by its Monday." : "How many faults were reported each day.", type: "columns", unit: "", items: buckets.map((b) => ({ label: weekly ? dm(b) : String(Number(b.slice(8))), value: perBucket.get(b) ?? 0 })) }),
    ...chart({ title: "Where faults happen", caption: "Locations and assets with the most jobs.", type: "bars", unit: "", items: ranked(byPlace, 8) }),
    ...(open.length ? chart({ title: "How long open jobs have waited", caption: "Open jobs by age.", type: "bars", unit: "", items: ages.map(([l, f]) => ({ label: l, value: open.filter((j) => f(age(j))).length })).filter((i) => i.value > 0) }) : []),
  ];
  return {
    ...base,
    kpis: [
      { label: "Jobs reported", value: String(jobs.length) },
      { label: "Still open", value: String(open.length) },
      { label: "High or critical open", value: String(open.filter((j) => j.severity === "critical" || j.severity === "high").length) },
      { label: "Completed", value: String(done.length) },
    ],
    header: ["Ref", "Reported", "Fault", "Location / asset", "Priority", "Route", "Status", "Age (days)", "Approved", "Final cost"],
    groups,
    hiddenColumns: [3, 5, 8],
    note: "Jobs are those reported in the period. Age is days from report to close, or to now for open jobs. Amounts are as recorded on the job.",
    details: [{ k: "Source", v: "Maintenance jobs reported in the period" }],
    insights,
    charts,
  };
}

// ---- Contractor performance ----

function contractors(base: Base, input: MaintenanceReportInput, jobs: McJob[]): MaintenanceReport {
  const cn = input.contractors;
  interface C { name: string; jobs: McJob[] }
  const map = new Map<string, C>();
  for (const j of jobs) {
    const key = j.path === "contractor" ? (j.contractorId ?? "none") : "internal";
    const label = j.path !== "contractor" ? "Internal team" : j.contractorId ? (cn[j.contractorId] ?? "Contractor") : "No contractor chosen yet";
    const c = map.get(key) ?? { name: label, jobs: [] };
    c.jobs.push(j);
    map.set(key, c);
  }
  const stats = [...map.values()].map((c) => {
    const done = c.jobs.filter((j) => j.state === "completed");
    const times = done.map((j) => days(j.createdAt, closedAtOf(j) ?? input.nowIso));
    const approved = c.jobs.reduce((n, j) => n + (j.approvedAmount ?? 0), 0);
    const finalCost = c.jobs.reduce((n, j) => n + (j.finalCost ?? 0), 0);
    const over = c.jobs.filter((j) => j.finalCost != null && j.approvedAmount != null && j.finalCost > j.approvedAmount + 0.5).length;
    return {
      name: c.name,
      total: c.jobs.length,
      done: done.length,
      open: c.jobs.filter(isOpen).length,
      rework: c.jobs.filter((j) => j.state === "rework").length,
      approved,
      finalCost,
      avgDays: times.length ? times.reduce((n, x) => n + x, 0) / times.length : null,
      over,
      avgCost: done.length && finalCost ? finalCost / c.jobs.filter((j) => j.finalCost != null).length : null,
    };
  }).sort((a, z) => z.total - a.total || a.name.localeCompare(z.name));

  const rows = stats.map((s) => [s.name, String(s.total), String(s.done), String(s.open), String(s.rework), s.avgDays == null ? "" : txt(r1(s.avgDays)), s.approved ? rand(s.approved) : "", s.finalCost ? rand(s.finalCost) : "", s.avgCost == null ? "" : rand(s.avgCost), String(s.over)]);
  const ext = stats.filter((s) => s.name !== "Internal team");
  const insights: string[] = [];
  if (stats.length) {
    insights.push(`${plural(jobs.length, "job")} across ${plural(stats.length, "team")}: ${stats.reduce((n, s) => n + s.done, 0)} completed, ${stats.reduce((n, s) => n + s.open, 0)} open.`);
    const spend = [...ext].sort((a, z) => z.finalCost - a.finalCost)[0];
    if (spend && spend.finalCost > 0) insights.push(`${spend.name} has the most spend: ${rand(spend.finalCost)} final cost on ${plural(spend.total, "job")}.`);
    const timed = ext.filter((s) => s.avgDays != null);
    if (timed.length > 1) {
      const slow = [...timed].sort((a, z) => z.avgDays! - a.avgDays!)[0];
      const fast = [...timed].sort((a, z) => a.avgDays! - z.avgDays!)[0];
      insights.push(`${fast.name} closes jobs fastest (${txt(r1(fast.avgDays!))} days on average) and ${slow.name} slowest (${txt(r1(slow.avgDays!))} days).`);
    }
    const over = stats.reduce((n, s) => n + s.over, 0);
    if (over) insights.push(`${plural(over, "job")} finished above the approved amount. ${stats.filter((s) => s.over).map((s) => `${s.name} (${s.over})`).join(", ")}.`);
    const rw = stats.filter((s) => s.rework > 0);
    if (rw.length) insights.push(`Work was sent back to be redone for ${rw.map((s) => `${s.name} (${s.rework})`).join(", ")}.`);
    const none = stats.find((s) => s.name === "No contractor chosen yet");
    if (none) insights.push(`${plural(none.total, "contractor job")} still ${none.total === 1 ? "has" : "have"} no contractor chosen.`);
  }
  const charts: ChartSpec[] = stats.length === 0 ? [] : [
    ...chart({ title: "Jobs by team", caption: "How many jobs each contractor or the internal team handled.", type: "bars", unit: "", items: stats.map((s) => ({ label: s.name, value: s.total })).slice(0, 10) }),
    ...chart({ title: "Final cost by contractor", caption: "Rand spent on completed and costed jobs.", type: "bars", unit: "", items: ranked(new Map(ext.map((s) => [s.name, s.finalCost])), 10) }),
    ...chart({ title: "Average days to close", caption: "Days from report to close, for completed jobs.", type: "bars", unit: "d", items: ranked(new Map(stats.filter((s) => s.avgDays != null).map((s) => [s.name, r1(s.avgDays!)])), 10) }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Teams", value: String(stats.length) },
      { label: "Jobs", value: String(jobs.length) },
      { label: "Completed", value: String(stats.reduce((n, s) => n + s.done, 0)) },
      { label: "Final cost", value: rand(stats.reduce((n, s) => n + s.finalCost, 0)) },
    ],
    header: ["Contractor", "Jobs", "Completed", "Open", "Rework", "Avg days to close", "Approved", "Final cost", "Avg cost per job", "Over approved"],
    groups: rows.length ? [{ title: "Performance by contractor", rows }] : [],
    hiddenColumns: [4, 8],
    note: "Jobs are those reported in the period. Over approved counts jobs whose final cost is above the approved amount. Speed is measured on completed jobs only.",
    details: [{ k: "Source", v: "Maintenance jobs reported in the period" }],
    insights,
    charts,
  };
}

// ---- Cost and payments ----

function cost(base: Base, input: MaintenanceReportInput, jobs: McJob[]): MaintenanceReport {
  const full = new Map((input.details ?? []).map((j) => [j.id, j]));
  const money = jobs.filter((j) => j.approvedAmount != null || j.finalCost != null || full.get(j.id)?.invoices?.length);
  interface M { j: McJob; invoiced: number; paid: number; balance: number; overdue: boolean; pop: number; who: string }
  const list: M[] = money.map((j) => {
    const inv = full.get(j.id)?.invoices ?? [];
    return {
      j,
      invoiced: inv.reduce((n, i) => n + i.amount, 0),
      paid: inv.reduce((n, i) => n + i.paidAmount, 0),
      balance: inv.reduce((n, i) => n + i.balance, 0),
      overdue: inv.some((i) => i.balance > 0 && i.dueDate != null && i.dueDate < input.today),
      pop: inv.reduce((n, i) => n + (i.popPendingAmount ?? 0), 0),
      who: routeLabel(j, input.contractors),
    };
  }).sort((a, z) => z.balance - a.balance || (z.j.finalCost ?? z.j.approvedAmount ?? 0) - (a.j.finalCost ?? a.j.approvedAmount ?? 0));
  const state = (m: M) => (m.balance > 0 ? (m.overdue ? "Overdue" : "Owing") : m.invoiced > 0 ? "Settled" : m.j.finalCost != null || m.j.approvedAmount != null ? "Not invoiced" : "-");
  const ORDER = ["Overdue", "Owing", "Not invoiced", "Settled"];
  const groups: ReportGroup[] = ORDER.map((s) => ({
    title: `${s} (${list.filter((m) => state(m) === s).length})`,
    rows: list.filter((m) => state(m) === s).map((m) => [code(m.j.id), localDay(m.j.createdAt), m.j.title, m.who, rand(m.j.approvedAmount), rand(m.j.finalCost), m.invoiced ? rand(m.invoiced) : "", m.invoiced ? rand(m.paid) : "", m.invoiced ? rand(m.balance) : "", stateLabel(m.j.state)]),
  })).filter((g) => g.rows.length > 0);

  const approved = list.reduce((n, m) => n + (m.j.approvedAmount ?? 0), 0);
  const finalCost = list.reduce((n, m) => n + (m.j.finalCost ?? 0), 0);
  const invoiced = list.reduce((n, m) => n + m.invoiced, 0);
  const paid = list.reduce((n, m) => n + m.paid, 0);
  const owing = list.reduce((n, m) => n + m.balance, 0);
  const over = list.filter((m) => m.j.finalCost != null && m.j.approvedAmount != null && m.j.finalCost > m.j.approvedAmount + 0.5);
  const missing = jobs.filter((j) => j.path === "contractor" && j.state !== "reported" && !full.has(j.id)).length;

  const insights: string[] = [];
  if (list.length) {
    insights.push(`${plural(list.length, "costed job")}: ${rand(approved)} approved, ${rand(finalCost)} final cost, ${rand(invoiced)} invoiced and ${rand(paid)} paid.`);
    if (owing > 0) {
      const od = list.filter((m) => m.overdue);
      insights.push(`${rand(owing)} is still owed${od.length ? `, of which ${plural(od.length, "invoice")} on ${plural(od.length, "job")} ${od.length === 1 ? "is" : "are"} past due` : ""}.`);
    } else if (invoiced > 0) insights.push("Everything invoiced has been paid.");
    if (over.length) {
      const extra = over.reduce((n, m) => n + (m.j.finalCost! - m.j.approvedAmount!), 0);
      insights.push(`${plural(over.length, "job")} finished above the approved amount, ${rand(extra)} over in total. Largest overrun: "${[...over].sort((a, z) => (z.j.finalCost! - z.j.approvedAmount!) - (a.j.finalCost! - a.j.approvedAmount!))[0].j.title}".`);
    } else if (finalCost > 0) insights.push("No job finished above its approved amount.");
    const pop = list.reduce((n, m) => n + m.pop, 0);
    if (pop > 0) insights.push(`${rand(pop)} of proof of payment is waiting to be verified.`);
    const byWho = new Map<string, number>();
    for (const m of list) sum(byWho, m.who, m.j.finalCost ?? m.j.approvedAmount ?? 0);
    const top = [...byWho.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) insights.push(`${top[0]} accounts for the most spend: ${rand(top[1])} (${pct(top[1], [...byWho.values()].reduce((n, v) => n + v, 0))}).`);
    const notInvoiced = list.filter((m) => state(m) === "Not invoiced" && m.j.state === "completed").length;
    if (notInvoiced) insights.push(`${plural(notInvoiced, "completed job")} ${notInvoiced === 1 ? "has" : "have"} no invoice recorded yet.`);
  }
  if (missing > 0) insights.push(`${plural(missing, "contractor job")} could not be read in detail, so invoices and payments may be understated.`);

  const bySpend = new Map<string, number>();
  const byPlace = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const m of list) {
    const v = m.j.finalCost ?? m.j.approvedAmount ?? 0;
    sum(byPlace, where(m.j, input.locations) || "No location", v);
    sum(bySpend, m.who, v);
    sum(byMonth, localDay(m.j.createdAt).slice(0, 7), v);
  }
  const charts: ChartSpec[] = list.length === 0 ? [] : [
    ...chart({ title: "Money position", caption: "Approved, final cost, invoiced, paid and still owed, in rand.", type: "bars", unit: "", items: [{ label: "Approved", value: approved }, { label: "Final cost", value: finalCost }, { label: "Invoiced", value: invoiced }, { label: "Paid", value: paid }, { label: "Owed", value: owing }].filter((i) => i.value > 0) }),
    ...chart({ title: "Spend by contractor", caption: "Final cost where known, otherwise the approved amount, in rand.", type: "bars", unit: "", items: ranked(bySpend, 8) }),
    ...chart({ title: "Spend by location", caption: "Where the money went, in rand.", type: "bars", unit: "", items: ranked(byPlace, 8) }),
    ...(byMonth.size > 1 ? chart({ title: "Spend by month reported", caption: "Rand by the month each job was reported.", type: "columns", unit: "", items: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({ label: m.slice(5), value: Math.round(v) })) }) : []),
  ];
  return {
    ...base,
    kpis: [
      { label: "Approved", value: rand(approved) },
      { label: "Final cost", value: rand(finalCost) },
      { label: "Paid", value: rand(paid) },
      { label: "Still owed", value: rand(owing) },
    ],
    header: ["Ref", "Reported", "Fault", "Contractor", "Approved", "Final cost", "Invoiced", "Paid", "Balance", "Job status"],
    groups,
    hiddenColumns: [1, 7],
    note: "Amounts are in rand as recorded. Invoiced, paid and balance come from each job's invoices; a payment counts as paid only once its proof has been verified. Only jobs with an approved amount, a final cost or an invoice appear.",
    details: [{ k: "Source", v: "Maintenance jobs, quotes and invoices" }],
    insights,
    charts,
  };
}

export const flattenMaintenance = flattenDoc;
