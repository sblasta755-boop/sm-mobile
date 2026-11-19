import type { LeaveRequest, StaffBooking } from "@/api/client";
import { longDate } from "./managementReport";
import { leaveAnalysis, rosterAnalysis } from "./scheduleAnalysis";
import { flattenDoc, type ReportDoc, type ReportGroup } from "./reportDoc";

export type ScheduleReportKind =
  | "daily"
  | "weekly"
  | "monthly"
  | "role"
  | "individual"
  | "leave";

export const SCHEDULE_REPORTS: {
  kind: ScheduleReportKind;
  label: string;
  hint: string;
}[] = [
  { kind: "daily", label: "Daily staff shift schedule", hint: "Who works on one day, by shift." },
  { kind: "weekly", label: "Weekly staff shift roster", hint: "Seven days, Monday to Sunday." },
  { kind: "monthly", label: "Monthly staff shift roster", hint: "A whole calendar month." },
  { kind: "role", label: "Role shift roster", hint: "A date range, grouped by staff role." },
  {
    kind: "individual",
    label: "Individual employee work schedule",
    hint: "One person's shifts and hours.",
  },
  { kind: "leave", label: "Leave applications and approvals", hint: "Every request and its decision." },
];

export interface ScheduleReportInput {
  kind: ScheduleReportKind;
  siteName: string;
  /** Day inside the period (daily: the day; weekly: its week; monthly: its month). */
  date: string;
  /** Range for the role, individual and leave reports. */
  start: string;
  end: string;
  bookings: StaffBooking[];
  leave: LeaveRequest[];
  /** Staff role key by user id, from the bookable-people list. */
  roles: Record<string, string>;
  /** Shift hours by shift id, for bookings that name a shift and carry no times of their own. */
  shifts: { id: string; startTime: string; endTime: string }[];
  /** Person for the individual report. */
  userId?: string;
}

export type ScheduleReportGroup = ReportGroup;

export interface ScheduleReport extends ReportDoc {
  kind: ScheduleReportKind;
}

export { addDays, weekStart, monthRange, weekday, hoursBetween, minutes } from "./scheduleDates";
import { addDays, weekStart, monthRange, weekday, hoursBetween } from "./scheduleDates";

const dayLabel = (day: string) => `${weekday(day)} ${longDate(day)}`;

/** The dates a report asks the schedule for. */
export function reportRange(
  kind: ScheduleReportKind,
  date: string,
  start: string,
  end: string,
): { start: string; end: string } {
  if (kind === "daily") return { start: date, end: date };
  if (kind === "weekly") {
    const s = weekStart(date);
    return { start: s, end: addDays(s, 6) };
  }
  if (kind === "monthly") return monthRange(date);
  return { start, end };
}


// ---- Times ----

const hoursText = (h: number | null) => (h === null ? "" : h % 1 === 0 ? String(h) : h.toFixed(1));

function bookingTimes(b: StaffBooking, shifts: ScheduleReportInput["shifts"]) {
  if (b.startTime && b.endTime) return { start: b.startTime, end: b.endTime };
  const named = b.shiftIds
    .map((id) => shifts.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  if (named.length === 0) return { start: null, end: null };
  return { start: named[0].startTime, end: named[named.length - 1].endTime };
}

const roleLabel = (key: string | undefined) =>
  key ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";

const STATUS: Record<string, string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

const shortStamp = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

// ---- Builder ----

const ROSTER_HEADER = [
  "Date",
  "Day",
  "Person",
  "Role",
  "Shift",
  "Start",
  "End",
  "Hours",
  "Site",
  "Instructions",
];

function rosterRow(
  b: StaffBooking,
  roles: Record<string, string>,
  shifts: ScheduleReportInput["shifts"],
) {
  const { start, end } = bookingTimes(b, shifts);
  return {
    hours: hoursBetween(start, end),
    row: [
      b.date,
      weekday(b.date),
      b.userName,
      roleLabel(roles[b.userId]),
      b.shiftNames.join(" + ") || (start ? "Custom hours" : "All day"),
      start ?? "",
      end ?? "",
      hoursText(hoursBetween(start, end)),
      b.site?.name ?? "",
      b.instructions ?? "",
    ],
  };
}

function groupRows(
  rows: { key: string; title: string; row: string[] }[],
  order: "key" | "first",
): ScheduleReportGroup[] {
  const map = new Map<string, ScheduleReportGroup>();
  for (const r of rows) {
    const g = map.get(r.key) ?? { title: r.title, rows: [] };
    g.rows.push(r.row);
    map.set(r.key, g);
  }
  const entries = [...map.entries()];
  if (order === "key") entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([, g]) => g);
}

const byDateThenName = (a: string[], b: string[]) =>
  a[0].localeCompare(b[0]) || (a[5] || "").localeCompare(b[5] || "") || a[2].localeCompare(b[2]);

export function buildScheduleReport(input: ScheduleReportInput): ScheduleReport {
  const { kind, siteName } = input;
  const def = SCHEDULE_REPORTS.find((r) => r.kind === kind)!;
  const range = reportRange(kind, input.date, input.start, input.end);
  const period =
    range.start === range.end
      ? dayLabel(range.start)
      : `${longDate(range.start)} - ${longDate(range.end)}`;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug(def.label)}-${slug(siteName)}-${range.start}${
    range.start === range.end ? "" : `-to-${range.end}`
  }`;

  if (kind === "leave") {
    const header = [
      "Person",
      "Kind",
      "From",
      "To",
      "Half day",
      "Days",
      "Paid",
      "Status",
      "Decided by",
      "Decided on",
      "Note",
      "Reason",
    ];
    const reqs = input.leave
      .filter((r) => r.startDate <= range.end && r.endDate >= range.start)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userName.localeCompare(b.userName));
    const count = (s: string) => reqs.filter((r) => r.status === s).length;
    const days = reqs.filter((r) => r.status === "approved").reduce((n, r) => n + r.days, 0);
    const rows = reqs.map((r) => [
      r.userName,
      r.typeName,
      r.startDate,
      r.endDate,
      r.halfDay ? r.halfDay.toUpperCase() : "",
      String(r.days),
      r.paid ? "Paid" : "Unpaid",
      STATUS[r.status] ?? r.status,
      r.decidedBy ?? "",
      shortStamp(r.decidedAt),
      r.decisionNote ?? "",
      r.reason ?? "",
    ]);
    return {
      kind,
      eyebrow: "SCHEDULE",
      details: [],
      hiddenColumns: [4, 6, 11],
      title: def.label,
      period,
      start: range.start,
      end: range.end,
      kpis: [
        { label: "Applications", value: String(reqs.length) },
        { label: "Approved", value: String(count("approved")) },
        { label: "Waiting", value: String(count("pending")) },
        { label: "Approved days", value: hoursText(days) || "0" },
      ],
      header,
      groups: rows.length ? [{ title: "Applications", rows }] : [],
      ...leaveAnalysis(
        range,
        reqs.map((r) => ({
          userId: r.userId,
          person: r.userName,
          kind: r.typeName,
          startDate: r.startDate,
          endDate: r.endDate,
          days: r.days,
          paid: r.paid,
          status: r.status,
        })),
      ),
      note: "Days are working days: weekends and public holidays are not counted. Status is each request's real approval state.",
      filename,
    };
  }

  let list = input.bookings.filter(
    (b) => b.status === "booked" && b.date >= range.start && b.date <= range.end,
  );
  if (kind === "individual") list = list.filter((b) => b.userId === input.userId);

  const built = list.map((b) => ({ b, ...rosterRow(b, input.roles, input.shifts) }));
  built.sort((a, z) => byDateThenName(a.row, z.row));

  let groups: ScheduleReportGroup[];
  if (kind === "daily") {
    groups = groupRows(
      built.map((x) => ({ key: x.row[5] + x.row[4], title: x.row[4], row: x.row })),
      "key",
    );
  } else if (kind === "role") {
    groups = groupRows(
      built.map((x) => ({
        key: x.row[3] || "~",
        title: x.row[3] || "No role",
        row: x.row,
      })),
      "key",
    );
  } else if (kind === "individual") {
    groups = built.length ? [{ title: built[0].row[2], rows: built.map((x) => x.row) }] : [];
  } else {
    groups = groupRows(
      built.map((x) => ({ key: x.row[0], title: dayLabel(x.row[0]), row: x.row })),
      "key",
    );
  }

  const people = new Set(list.map((b) => b.userId)).size;
  const totalHours = built.reduce((n, x) => n + (x.hours ?? 0), 0);
  const days = new Set(list.map((b) => b.date)).size;

  return {
    kind,
    eyebrow: "SCHEDULE",
    details: [],
    hiddenColumns: [1, 8, 9],
    title: def.label,
    period,
    start: range.start,
    end: range.end,
    kpis: [
      { label: "Shifts booked", value: String(list.length) },
      { label: "People", value: String(people) },
      { label: "Days covered", value: String(days) },
      { label: "Hours booked", value: hoursText(totalHours) || "0" },
    ],
    header: ROSTER_HEADER,
    groups,
    ...rosterAnalysis(
      kind,
      range,
      built.map((x) => ({
        date: x.row[0],
        userId: x.b.userId,
        person: x.row[2],
        role: x.row[3],
        shift: x.row[4],
        start: x.row[5] || null,
        end: x.row[6] || null,
        hours: x.hours,
      })),
    ),
    note: "Shows booked shifts only; cancelled bookings are left out. Times are site-local. A shift that ends before it starts runs past midnight.",
    filename,
  };
}

export const flattenReport = flattenDoc;

// ---- Spreadsheet text (the phone shares a .csv; Excel opens it) ----

/** Quotes a cell. Text a spreadsheet would run as a formula (= + - @, tab, return) gets a leading apostrophe. */
export function csvSafe(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The CSV text with a byte-order mark so Excel reads names and accents correctly. */
export function reportCsv(report: ReportDoc): string {
  const { header, rows } = flattenDoc(report);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvSafe).join(",")).join("\r\n")}`;
}
