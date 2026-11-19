import { longDate } from "./managementReport";
import { chart, daysBetween, dm, pct, plural, r1, ranked, sum, txt, type AttDay } from "./attendanceReports";
import { flattenDoc, type ReportDoc, type ReportGroup } from "./reportDoc";
import type { ChartSpec } from "./scheduleAnalysis";
import { hoursBetween, weekStart } from "./scheduleDates";

export type OvertimeReportKind = "hours" | "register";

export const OVERTIME_REPORTS: { kind: OvertimeReportKind; label: string; hint: string }[] = [
  { kind: "hours", label: "Overtime and additional hours report", hint: "Each request against the shift: scheduled, worked and extra hours." },
  { kind: "register", label: "Overtime request and approval register", hint: "The sign-off record: who decided, when, and the comment." },
];

export const OVERTIME_MAX_DAYS = 62;

export interface OtRequest {
  id: string;
  userId: string;
  userName: string;
  dayId: string;
  shiftEndAt: string;
  requestedAt: string;
  reason: string;
  status: string;
  approverTier: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface OvertimeReportInput {
  kind: OvertimeReportKind;
  siteName: string;
  start: string;
  end: string;
  /** The current instant, to measure how long an open request has waited. */
  nowIso: string;
  requests: OtRequest[];
  /** Attendance days around the requests, joined by day id for scheduled and worked hours. */
  days: AttDay[];
}

export interface OvertimeReport extends ReportDoc {
  kind: OvertimeReportKind;
}

const SAST = 120 * 60000;
const localDay = (iso: string) => new Date(Date.parse(iso) + SAST).toISOString().slice(0, 10);
const localTime = (iso: string) => new Date(Date.parse(iso) + SAST).toISOString().slice(11, 16);
const TIER: Record<string, string> = { supervisor: "Supervisor", site_manager: "Site manager", operations_manager: "Operations manager" };
const STATUS_ORDER = ["awaiting_approval", "approved", "declined", "expired", "cancelled"] as const;
const STATUS: Record<string, string> = {
  awaiting_approval: "Pending",
  approved: "Approved",
  declined: "Rejected",
  expired: "Expired (no decision)",
  cancelled: "Withdrawn",
};
const code = (id: string) => `OT-${id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
const mins = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
const wait = (m: number) => (m < 90 ? `${m} min` : m < 2880 ? `${txt(r1(m / 60))} h` : `${txt(r1(m / 1440))} days`);

interface Row {
  r: OtRequest;
  day?: AttDay;
  date: string;
  scheduled: number | null;
  worked: number | null;
  /** Hours after shift end that the time counts for (approved) or has run so far (pending); null when it was cut back. */
  extra: number | null;
  turnaround: number | null;
}

function rowsOf(input: OvertimeReportInput): Row[] {
  const byDay = new Map(input.days.map((d) => [d.id, d]));
  return input.requests
    .map((r) => {
      const day = byDay.get(r.dayId);
      const date = day?.workDate ?? localDay(r.shiftEndAt);
      const scheduled = day ? hoursBetween(day.expectedStart ?? null, day.expectedEnd ?? null) : null;
      const out = day?.clockOutAt ?? (r.status === "awaiting_approval" ? input.nowIso : null);
      const extra = r.status === "approved" || r.status === "awaiting_approval" ? (out ? mins(r.shiftEndAt, out) / 60 : null) : null;
      return {
        r,
        day,
        date,
        scheduled,
        worked: day?.workedMinutes == null ? null : day.workedMinutes / 60,
        extra,
        turnaround: r.decidedAt ? mins(r.requestedAt, r.decidedAt) : null,
      };
    })
    .filter((x) => x.date >= input.start && x.date <= input.end)
    .sort((a, z) => a.date.localeCompare(z.date) || a.r.userName.localeCompare(z.r.userName));
}

const fmt = (n: number | null) => (n == null ? "" : txt(r1(n)));
const label = (r: OtRequest) => (r.status === "awaiting_approval" ? `Pending ${TIER[r.approverTier]?.toLowerCase() ?? "approver"}` : (STATUS[r.status] ?? r.status));

export function buildOvertimeReport(input: OvertimeReportInput): OvertimeReport {
  const def = OVERTIME_REPORTS.find((r) => r.kind === input.kind)!;
  const rows = rowsOf(input);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = {
    kind: input.kind,
    eyebrow: "OVERTIME",
    title: def.label,
    period: `${longDate(input.start)} - ${longDate(input.end)}`,
    start: input.start,
    end: input.end,
    filename: `${slug(def.label)}-${slug(input.siteName)}-${input.start}-to-${input.end}`,
    details: [
      { k: "Approval status", v: rows.length === 0 ? "No requests" : rows.every((x) => x.r.status !== "awaiting_approval") ? "All requests decided" : `${rows.filter((x) => x.r.status === "awaiting_approval").length} awaiting a decision` },
      { k: "Source", v: "Overtime requests with attendance records" },
    ],
  };

  const approved = rows.filter((x) => x.r.status === "approved");
  const pending = rows.filter((x) => x.r.status === "awaiting_approval");
  const declined = rows.filter((x) => x.r.status === "declined");
  const extraTotal = rows.reduce((n, x) => n + (x.extra ?? 0), 0);
  const approvedHours = approved.reduce((n, x) => n + (x.extra ?? 0), 0);
  const decided = rows.filter((x) => x.turnaround != null);
  const avgWait = decided.length ? Math.round(decided.reduce((n, x) => n + x.turnaround!, 0) / decided.length) : null;

  const groups: ReportGroup[] = STATUS_ORDER.map((s) => ({
    title: `${STATUS[s]} (${rows.filter((x) => x.r.status === s).length})`,
    rows: rows.filter((x) => x.r.status === s).map((x) =>
      input.kind === "hours"
        ? [
            code(x.r.id),
            x.r.userName,
            x.date,
            x.day?.expectedStart && x.day?.expectedEnd ? `${x.day.expectedStart}-${x.day.expectedEnd}` : "",
            fmt(x.scheduled),
            fmt(x.worked),
            fmt(x.extra),
            x.r.reason,
            label(x.r),
            TIER[x.r.approverTier] ?? x.r.approverTier,
            x.r.decidedBy ?? "",
          ]
        : [
            code(x.r.id),
            x.r.userName,
            x.date,
            localTime(x.r.requestedAt),
            fmt(x.extra),
            x.r.reason,
            label(x.r),
            x.r.decidedBy ?? "",
            x.r.decidedAt ? x.r.decidedAt.slice(0, 10) : "",
            x.r.status === "approved" ? fmt(x.extra) : "",
            x.r.decisionNote ?? "",
            x.r.status === "awaiting_approval" ? (TIER[x.r.approverTier] ?? "") : "",
          ],
    ),
  })).filter((g) => g.rows.length > 0);

  // ---- Analysis ----
  const insights: string[] = [];
  if (rows.length > 0) {
    insights.push(`${plural(rows.length, "overtime request")} from ${plural(new Set(rows.map((x) => x.r.userId)).size, "person", "people")}: ${approved.length} approved, ${declined.length} rejected, ${pending.length} pending${rows.length - approved.length - declined.length - pending.length > 0 ? ` and ${rows.length - approved.length - declined.length - pending.length} expired or withdrawn` : ""}.`);
    insights.push(`${txt(r1(extraTotal))} hours past shift end are on these requests; ${txt(r1(approvedHours))} are approved to count${pending.length ? " and the rest are still running or waiting" : ""}.`);
    const decidedRows = approved.length + declined.length;
    if (decidedRows > 0) insights.push(`${pct(approved.length, decidedRows)} of decided requests were approved.`);
    if (avgWait != null) {
      const slow = decided.filter((x) => x.turnaround! > 1440).length;
      insights.push(`Decisions take ${wait(avgWait)} on average; the slowest took ${wait(Math.max(...decided.map((x) => x.turnaround!)))}${slow ? `, and ${plural(slow, "decision")} took over a day` : ""}.`);
    }
    if (pending.length) {
      const oldest = [...pending].sort((a, z) => a.r.requestedAt.localeCompare(z.r.requestedAt))[0];
      insights.push(`${plural(pending.length, "request")} still need a decision. The oldest has waited ${wait(mins(oldest.r.requestedAt, input.nowIso))} (${oldest.r.userName}, ${dm(oldest.date)}). An undecided request is cut back to shift end at the end of the day.`);
    }
    const byPerson = new Map<string, number>();
    for (const x of rows) sum(byPerson, x.r.userName);
    const top = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top[1] >= 3) insights.push(`${top[0]} asked for overtime ${top[1]} times. Check whether the shift length or the workload needs adjusting.`);
    const reasons = new Map<string, number>();
    for (const x of rows) sum(reasons, x.r.reason.trim().toLowerCase());
    const common = [...reasons.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    if (common) insights.push(`The most repeated reason is "${common[0]}" (${common[1]} requests).`);
    const long = rows.filter((x) => (x.extra ?? 0) >= 3);
    if (long.length) insights.push(`${plural(long.length, "request")} ran 3 hours or more past shift end, the longest ${txt(r1(Math.max(...long.map((x) => x.extra ?? 0))))} hours.`);
    const noNote = declined.filter((x) => !x.r.decisionNote).length;
    if (declined.length && !noNote) insights.push("Every rejection has a reason recorded.");
    insights.push("Extra hours are separate from scheduled hours and are not payable unless approved. This is a time approval record, not a wage calculation.");
  }

  const statusCount = new Map<string, number>();
  for (const x of rows) sum(statusCount, STATUS[x.r.status] ?? x.r.status);
  const extraBy = new Map<string, number>();
  for (const x of rows) sum(extraBy, x.r.userName, x.extra ?? 0);
  const dates = daysBetween(input.start, input.end);
  const perDay = new Map<string, number>();
  for (const x of rows) sum(perDay, x.date);
  const dayItems =
    dates.length <= 31
      ? dates.map((d) => ({ label: String(Number(d.slice(8))), value: perDay.get(d) ?? 0 }))
      : (() => {
          const weeks = new Map<string, number>();
          for (const d of dates) sum(weeks, weekStart(d), perDay.get(d) ?? 0);
          return [...weeks.entries()].map(([w, v]) => ({ label: dm(w), value: v }));
        })();
  const deciders = new Map<string, number>();
  for (const x of rows) if (x.r.decidedBy) sum(deciders, x.r.decidedBy);
  const speed = [
    ["Under 1 h", (m: number) => m < 60],
    ["1 to 4 h", (m: number) => m >= 60 && m < 240],
    ["4 to 24 h", (m: number) => m >= 240 && m < 1440],
    ["Over 24 h", (m: number) => m >= 1440],
  ] as const;

  const charts: ChartSpec[] =
    rows.length === 0
      ? []
      : input.kind === "hours"
      ? [
          ...chart({ title: "Requests by status", caption: "Where every overtime request stands.", type: "bars", unit: "", items: ranked(statusCount, 6) }),
          ...chart({ title: "Extra hours by person", caption: "Hours past shift end, highest first.", type: "bars", unit: "h", items: ranked(extraBy, 10) }),
          ...chart({ title: dates.length <= 31 ? "Requests per day" : "Requests per week", caption: dates.length <= 31 ? "How many requests fell on each shift date." : "Each column is one week, labelled by its Monday.", type: "columns", unit: "", items: dayItems }),
        ]
      : [
          ...chart({ title: "Decisions", caption: "Approved, rejected and still open.", type: "bars", unit: "", items: ranked(statusCount, 6) }),
          ...chart({ title: "How fast requests were decided", caption: "Time from request to decision.", type: "bars", unit: "", items: speed.map(([l, f]) => ({ label: l, value: decided.filter((x) => f(x.turnaround!)).length })).filter((i) => i.value > 0) }),
          ...chart({ title: "Decisions by approver", caption: "Requests each person decided.", type: "bars", unit: "", items: ranked(deciders, 8) }),
        ];

  return {
    ...base,
    kpis:
      input.kind === "hours"
        ? [
            { label: "Requests", value: String(rows.length) },
            { label: "Extra hours", value: txt(r1(extraTotal)) },
            { label: "Approved", value: String(approved.length) },
            { label: "Under review", value: String(pending.length) },
          ]
        : [
            { label: "Pending", value: String(pending.length) },
            { label: "Approved", value: String(approved.length) },
            { label: "Rejected", value: String(declined.length) },
            { label: "Avg decision", value: avgWait == null ? "-" : wait(avgWait) },
          ],
    header:
      input.kind === "hours"
        ? ["Request", "Employee", "Shift date", "Shift", "Scheduled (h)", "Net worked (h)", "Extra (h)", "Reason", "Approval status", "Approver", "Decided by"]
        : ["Request", "Employee", "Date", "Asked at", "Extra (h)", "Reason", "Decision", "Decided by", "Decided on", "Approved (h)", "Comment", "Next approver"],
    groups,
    hiddenColumns: input.kind === "hours" ? [3, 9] : [3, 8, 11],
    note:
      input.kind === "hours"
        ? "Extra hours are the time past shift end: counted for approved requests, running so far for pending ones, and blank when a rejected request was cut back to shift end. The gap between scheduled and clocked hours is not automatically payable overtime."
        : "Two steps: the worker asks, then the person above them decides (a supervisor for field staff, a site manager for a supervisor). Nobody decides their own. An undecided request is cut back to shift end at the end of the day.",
    insights,
    charts,
  };
}

export const flattenOvertime = flattenDoc;
