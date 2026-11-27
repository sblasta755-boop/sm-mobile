import { longDate } from "./managementReport";
import {
  chart,
  daysBetween,
  dm,
  dur,
  gapMinutes,
  hrs,
  localHm,
  name,
  pct,
  plural,
  ranked,
  r1,
  sum,
  txt,
  type AttDay,
} from "./attendanceReports";
import { flattenDoc, type ReportDoc, type ReportGroup } from "./reportDoc";
import type { ChartSpec } from "./scheduleAnalysis";
import { addDays, hoursBetween, weekStart, weekday, monthRange } from "./scheduleDates";

export type TimesheetReportKind = "daily" | "weekly" | "monthly" | "variance" | "audit";

export const TIMESHEET_REPORTS: { kind: TimesheetReportKind; label: string; hint: string }[] = [
  { kind: "daily", label: "Daily employee timesheet", hint: "Every employee's hours for one day." },
  { kind: "weekly", label: "Weekly employee timesheet", hint: "Every employee's hours for each day of a week." },
  { kind: "monthly", label: "Monthly employee timesheet", hint: "Day by day hours record, one section per employee." },
  { kind: "variance", label: "Scheduled vs actual hours", hint: "Booked hours against verified attendance." },
  { kind: "audit", label: "Attendance approval and audit", hint: "Who approved each day, and every manager correction." },
];

export const TIMESHEET_MAX_DAYS = 62;
const WEEKLY_LIMIT = 45;

export interface TsBooking {
  /** Matches ScheduleComparison.bookingId, so the server's comparison can be read for this booking. */
  id?: string;
  userId: string;
  userName: string;
  date: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  shiftIds: string[];
  shiftNames: string[];
}

/** The server's comparison of one booking with what happened (GET /attendance/vs-schedule). */
export interface TsScheduleRow {
  bookingId: string;
  dayId: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  scheduledMinutes: number | null;
  status: string;
}

export interface TimesheetReportInput {
  kind: TimesheetReportKind;
  siteName: string;
  /** Site-local today, so a future shift is not called a no-show. */
  today: string;
  /** Any day in the week or month. */
  date: string;
  start: string;
  end: string;
  /** Monthly: one person, or empty for everyone. */
  userId?: string;
  days: AttDay[];
  bookings: TsBooking[];
  /** When given, the variance report reads each booking's day, hours and outcome from here instead of working them out. */
  schedule?: TsScheduleRow[];
  leave: { userId: string; userName: string; startDate: string; endDate: string; status: string }[];
  shifts: { id: string; startTime: string; endTime: string }[];
  roles: Record<string, string>;
}

export function timesheetRange(kind: TimesheetReportKind, date: string, start: string, end: string) {
  if (kind === "daily") return { start: date, end: date };
  if (kind === "weekly") {
    const s = weekStart(date);
    return { start: s, end: addDays(s, 6) };
  }
  if (kind === "monthly") return monthRange(date);
  return { start, end };
}

export interface TimesheetReport extends ReportDoc {
  kind: TimesheetReportKind;
}

const SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const dow = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const roleLabel = (key: string | undefined) => (key ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");
const APPROVAL: Record<string, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected" };

/** ISO week number, for the "Week 45 / 2026" figure. */
function isoWeek(day: string): { week: number; year: number } {
  const d = new Date(`${day}T00:00:00Z`);
  const n = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - n + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}

function bookedTimes(b: TsBooking, shifts: TimesheetReportInput["shifts"]) {
  if (b.startTime && b.endTime) return { start: b.startTime, end: b.endTime };
  const named = b.shiftIds.map((id) => shifts.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  if (named.length === 0) return { start: null as string | null, end: null as string | null };
  return { start: named[0].startTime, end: named[named.length - 1].endTime };
}

function overall(days: AttDay[]): string {
  if (days.length === 0) return "No records";
  const done = days.filter((d) => d.approvalState === "approved").length;
  return done === days.length ? "Approved" : done === 0 ? "Draft (awaiting approval)" : `Mixed (${done} of ${days.length} approved)`;
}

export function buildTimesheetReport(input: TimesheetReportInput): TimesheetReport {
  const { kind, siteName } = input;
  const def = TIMESHEET_REPORTS.find((r) => r.kind === kind)!;
  const range = timesheetRange(kind, input.date, input.start, input.end);
  const days = input.days.filter((d) => d.workDate >= range.start && d.workDate <= range.end);
  const bookings = input.bookings.filter((b) => b.status === "booked" && b.date >= range.start && b.date <= range.end);
  const leave = input.leave.filter((l) => (l.status === "approved" || l.status === "pending") && l.startDate <= range.end && l.endDate >= range.start);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = {
    kind,
    eyebrow: "TIMESHEET",
    title: def.label,
    period: kind === "daily" ? longDate(range.start) : kind === "monthly" ? `${longDate(range.start).slice(3)}` : `${longDate(range.start)} - ${longDate(range.end)}`,
    start: range.start,
    end: range.end,
    filename: `${slug(def.label)}-${slug(siteName)}-${range.start}-to-${range.end}`,
    details: [
      { k: "Approval status", v: overall(days) },
      { k: "Source", v: "Attendance records, bookings and leave" },
    ],
  };
  const ctx = { ...input, days, bookings, leave, range };
  if (kind === "weekly" || kind === "daily") return weekly(base, ctx);
  if (kind === "monthly") return monthly(base, ctx);
  if (kind === "variance") return variance(base, ctx);
  return audit(base, ctx);
}

type Base = Omit<TimesheetReport, "kpis" | "header" | "groups" | "hiddenColumns" | "note" | "insights" | "charts">;
type Ctx = TimesheetReportInput & { range: { start: string; end: string } };

const onLeave = (c: Ctx, userId: string, day: string, status: string) =>
  c.leave.some((l) => l.userId === userId && l.status === status && l.startDate <= day && l.endDate >= day);

function weekly(base: Base, c: Ctx): TimesheetReport {
  const daily = base.kind === "daily";
  const unit = daily ? "day" : "week";
  const dates = daysBetween(c.range.start, c.range.end);
  const people = new Map<string, string>();
  for (const d of c.days) people.set(d.userId, name(d));
  for (const b of c.bookings) people.set(b.userId, b.userName);
  for (const l of c.leave) people.set(l.userId, l.userName);
  const list = [...people.entries()].sort((a, z) => a[1].localeCompare(z[1]));
  const header = ["Employee", "Role", ...dates.map((d) => `${SHORT[dow(d)]} ${d.slice(8)} (h)`), "Total (h)", "Approval"];

  const absent: string[] = [];
  const perDay = new Map<string, number>();
  const perRole = new Map<string, number>();
  const perPerson = new Map<string, number>();
  const rows = list.map(([id, person]) => {
    let total = 0;
    const mine = c.days.filter((d) => d.userId === id);
    const cells = dates.map((date) => {
      const d = mine.find((x) => x.workDate === date);
      if (d) {
        if (d.workedMinutes == null) return "In";
        total += d.workedMinutes;
        sum(perDay, date, d.workedMinutes / 60);
        return txt(hrs(d.workedMinutes));
      }
      if (onLeave(c, id, date, "approved")) return "AL";
      if (onLeave(c, id, date, "pending")) return "PL";
      const booked = c.bookings.some((b) => b.userId === id && b.date === date);
      if (booked && date < c.today) {
        absent.push(`${person} on ${dm(date)}`);
        return "ABS";
      }
      return booked ? "-" : "OFF";
    });
    const role = roleLabel(c.roles[id]);
    sum(perRole, role || "No role", total / 60);
    perPerson.set(person, total / 60);
    const approved = mine.filter((d) => d.approvalState === "approved").length;
    const approval = mine.length === 0 ? "-" : approved === mine.length ? "Approved" : approved === 0 ? "Waiting" : "Mixed";
    return { row: [person, role, ...cells, txt(hrs(total)), approval], total, id, approval };
  });

  const grand = rows.reduce((n, r) => n + r.total, 0);
  const insights: string[] = [];
  if (rows.length > 0) {
    insights.push(`${plural(rows.length, "employee")} logged ${txt(hrs(grand))} hours this ${unit}, an average of ${txt(hrs(grand / rows.length))} each.`);
    const sorted = [...rows].sort((a, z) => z.total - a.total);
    if (rows.length >= 3) insights.push(`Most hours: ${sorted[0].row[0]} (${sorted[0].row[sorted[0].row.length - 2]} h). Fewest: ${sorted[sorted.length - 1].row[0]} (${sorted[sorted.length - 1].row[sorted[sorted.length - 1].row.length - 2]} h).`);
    const over = rows.filter((r) => r.total / 60 > WEEKLY_LIMIT);
    if (!daily) insights.push(over.length ? `${plural(over.length, "person", "people")} over ${WEEKLY_LIMIT} hours: ${over.map((r) => r.row[0]).slice(0, 5).join(", ")}.` : `No one is over ${WEEKLY_LIMIT} hours for the week.`);
    if (absent.length) insights.push(`${plural(absent.length, "booked shift")} had no attendance: ${absent.slice(0, 5).join("; ")}${absent.length > 5 ? "; and more" : ""}.`);
    const al = rows.reduce((n, r) => n + r.row.filter((x) => x === "AL").length, 0);
    if (al) insights.push(`${plural(al, "day")} of approved leave and ${rows.reduce((n, r) => n + r.row.filter((x) => x === "PL").length, 0)} of leave still waiting.`);
    const waiting = c.days.filter((d) => d.approvalState === "pending");
    insights.push(waiting.length ? `${plural(waiting.length, "day")} (${txt(hrs(waiting.reduce((n, d) => n + (d.workedMinutes ?? 0), 0)))} hours) still need approval.` : daily ? "The day is approved." : "Every day this week is approved.");
  }
  const approvalCount = new Map<string, number>();
  for (const d of c.days) sum(approvalCount, APPROVAL[d.approvalState] ?? d.approvalState);
  const charts: ChartSpec[] = [
    ...(daily ? [] : chart({ title: "Hours per day", caption: "Total hours worked by everyone on each day.", type: "columns", unit: "h", items: dates.map((d) => ({ label: SHORT[dow(d)][0] + SHORT[dow(d)].slice(1).toLowerCase(), value: r1(perDay.get(d) ?? 0) })) })),
    ...chart({ title: "Hours per employee", caption: `Hours worked this ${unit}, highest first.`, type: "bars", unit: "h", items: ranked(perPerson, 10) }),
    ...(perRole.size > 1 ? chart({ title: "Hours by role", caption: `How the ${unit}'s hours split between roles.`, type: "bars", unit: "h", items: ranked(perRole, 8) }) : []),
    ...chart({ title: "Days by approval", caption: "Attendance days and where each stands.", type: "bars", unit: "", items: ranked(approvalCount, 4) }),
  ];
  const wk = isoWeek(c.range.start);
  return {
    ...base,
    kpis: [
      { label: "Staff in report", value: String(rows.length) },
      daily ? { label: "Date", value: dm(c.range.start) } : { label: "Week", value: `${wk.week} / ${wk.year}` },
      { label: "Total hours", value: txt(hrs(grand)) },
      { label: "Approval", value: rows.length === 0 ? "-" : c.days.length && c.days.every((d) => d.approvalState === "approved") ? "Approved" : c.days.some((d) => d.approvalState === "approved") ? "Mixed" : "Waiting" },
    ],
    header,
    groups: rows.length ? [{ title: daily ? "Daily totals" : "Weekly totals", rows: rows.map((r) => r.row) }] : [],
    hiddenColumns: [dates.length + 3],
    note: "Hours are worked time from attendance, with time away from site excluded. AL = approved leave, PL = leave waiting, ABS = booked but did not attend, OFF = not booked, In = still clocked in.",
    insights,
    charts,
  };
}

function monthly(base: Base, c: Ctx): TimesheetReport {
  const dates = daysBetween(c.range.start, c.range.end);
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const d of c.days) { ids.add(d.userId); names.set(d.userId, name(d)); }
  for (const b of c.bookings) { ids.add(b.userId); names.set(b.userId, b.userName); }
  for (const l of c.leave) { ids.add(l.userId); names.set(l.userId, l.userName); }
  const chosen = c.userId ? [c.userId].filter((u) => ids.has(u)) : [...ids];
  const single = !!c.userId;
  const header = ["Work date", "Day", "Shift", "Booking", "Break (min)", "Worked (h)", "Approved (h)", "Attendance"];
  const statusCount = new Map<string, number>();
  const perDay = new Map<string, number>();
  const perPerson = new Map<string, number>();
  let worked = 0;
  let approved = 0;
  let longest: { person: string; date: string; m: number } | null = null;
  const breaks: number[] = [];

  const groups: ReportGroup[] = chosen
    .sort((a, z) => (names.get(a) ?? "").localeCompare(names.get(z) ?? ""))
    .map((id) => {
      const person = names.get(id) ?? id;
      let personHours = 0;
      const rows: string[][] = [];
      for (const date of dates) {
        const d = c.days.find((x) => x.userId === id && x.workDate === date);
        const b = c.bookings.find((x) => x.userId === id && x.date === date);
        const al = onLeave(c, id, date, "approved");
        const pl = onLeave(c, id, date, "pending");
        if (!single && !d && !b && !al && !pl) continue;
        const shift = b ? b.shiftNames.join(" + ") || "Custom" : "OFF";
        const booking = al ? "On leave" : pl ? "Leave pending" : b ? "Scheduled" : "Off duty";
        const gaps = d ? gapMinutes(d).reduce((n, g) => n + g, 0) : 0;
        if (d && gaps) breaks.push(gaps);
        let attendance: string;
        if (d) attendance = d.approvalState === "approved" ? "Approved" : d.approvalState === "rejected" ? "Rejected" : "Waiting approval";
        else if (al) attendance = "On leave";
        else if (pl) attendance = "Leave pending";
        else if (b && date < c.today) attendance = "Didn't attend";
        else if (b) attendance = "Scheduled";
        else attendance = "N/A";
        sum(statusCount, attendance);
        const w = d?.workedMinutes ?? null;
        if (w != null) {
          worked += w;
          personHours += w / 60;
          sum(perDay, date, w / 60);
          if (d!.approvalState === "approved") approved += w;
          if (!longest || w > longest.m) longest = { person, date, m: w };
        }
        rows.push([
          date,
          weekday(date).slice(0, 3),
          shift,
          booking,
          d ? String(gaps) : "",
          w == null ? "" : txt(hrs(w)),
          d && d.approvalState === "approved" && w != null ? txt(hrs(w)) : "",
          attendance,
        ]);
      }
      perPerson.set(person, personHours);
      return { title: `${person} (${txt(r1(personHours))} h)`, rows };
    })
    .filter((g) => g.rows.length > 0);

  const attended = c.days.filter((d) => chosen.includes(d.userId)).length;
  const missed = statusCount.get("Didn't attend") ?? 0;
  const insights: string[] = [];
  if (groups.length > 0) {
    insights.push(`${txt(hrs(worked))} hours worked over ${plural(attended, "attended day")}${single ? "" : ` by ${plural(chosen.length, "person", "people")}`}; ${txt(hrs(approved))} hours are approved and ${txt(hrs(worked - approved))} are still waiting.`);
    if (attended > 0) insights.push(`The average day is ${dur(Math.round(worked / attended))}. The longest was ${longest!.person} on ${dm(longest!.date)}: ${dur(longest!.m)}.`);
    if (missed > 0) insights.push(`${plural(missed, "booked day")} had no attendance and no leave.`);
    const leaveDays = (statusCount.get("On leave") ?? 0) + (statusCount.get("Leave pending") ?? 0);
    if (leaveDays > 0) insights.push(`${plural(leaveDays, "day")} on leave (${statusCount.get("Leave pending") ?? 0} still waiting a decision).`);
    if (breaks.length > 0) insights.push(`Time away from site on ${plural(breaks.length, "day")}, averaging ${Math.round(breaks.reduce((n, g) => n + g, 0) / breaks.length)} minutes. Breaks are not clocked, so this is time off site only.`);
    insights.push(`${pct(approved, worked)} of worked time is approved.`);
  }
  const charts: ChartSpec[] = [
    ...chart({ title: "Hours per day", caption: "Hours worked on each day of the month.", type: "columns", unit: "h", items: dates.map((d) => ({ label: String(Number(d.slice(8))), value: r1(perDay.get(d) ?? 0) })) }),
    ...chart({ title: "Days by outcome", caption: "How each day in the record ended up.", type: "bars", unit: "", items: ranked(statusCount, 8).filter((i) => i.label !== "N/A") }),
    ...(!single && chosen.length > 1 ? chart({ title: "Hours per employee", caption: "Hours worked this month, highest first.", type: "bars", unit: "h", items: ranked(perPerson, 10) }) : []),
  ];
  return {
    ...base,
    kpis: [
      { label: single ? "Employee" : "Employees", value: single ? names.get(chosen[0]) ?? "-" : String(chosen.length) },
      { label: "Hours worked", value: txt(hrs(worked)) },
      { label: "Approved", value: txt(hrs(approved)) },
      { label: "Days attended", value: String(attended) },
    ],
    header,
    groups,
    hiddenColumns: [],
    note: "Worked is time on site from attendance. Approved shows hours only once a manager has approved the day. Break is time away from site between visits.",
    insights,
    charts,
  };
}

function variance(base: Base, c: Ctx): TimesheetReport {
  interface V { date: string; person: string; userId: string; shift: string; ps: string | null; pe: string | null; inn: string; out: string; brk: number | null; planned: number | null; actual: number | null; review: string }
  const scheduled = new Map((c.schedule ?? []).map((s) => [s.bookingId, s]));
  const rows: V[] = c.bookings.map((b) => {
    const t = bookedTimes(b, c.shifts);
    // The server knows which day belongs to which booking (a split day has two); without its answer the day
    // is found by person and date, and the outcome is worked out here.
    const s = b.id ? scheduled.get(b.id) : undefined;
    const d = s ? (s.dayId ? c.days.find((x) => x.id === s.dayId) : undefined) : c.days.find((x) => x.userId === b.userId && x.workDate === b.date);
    let review: string;
    if (d) review = d.approvalState === "approved" ? "Reviewed" : d.approvalState === "rejected" ? "Rejected" : "Unverified";
    else if (s) review = s.status === "on_leave" ? "Approved leave" : s.status === "site_closed" ? "Site closed" : s.status === "no_show" ? "No show" : "Upcoming";
    else if (onLeave(c, b.userId, b.date, "approved")) review = "Approved leave";
    else review = b.date < c.today ? "No show" : "Upcoming";
    return {
      date: b.date,
      person: b.userName,
      userId: b.userId,
      shift: b.shiftNames.join(" + ") || "Custom",
      ps: t.start,
      pe: t.end,
      inn: localHm(d?.clockInAt),
      out: localHm(d?.clockOutAt),
      brk: d ? gapMinutes(d).reduce((n, g) => n + g, 0) : null,
      planned: s?.scheduledMinutes != null ? s.scheduledMinutes / 60 : hoursBetween(t.start, t.end),
      actual: d?.workedMinutes == null ? null : d.workedMinutes / 60,
      review,
    };
  });
  rows.sort((a, z) => a.date.localeCompare(z.date) || a.person.localeCompare(z.person));
  const ORDER = ["Reviewed", "Unverified", "Rejected", "No show", "Approved leave", "Upcoming"];
  const fmt = (n: number | null) => (n == null ? "" : txt(r1(n)));
  const groups: ReportGroup[] = ORDER.map((r) => ({
    title: `${r} (${rows.filter((x) => x.review === r).length})`,
    rows: rows.filter((x) => x.review === r).map((x) => [
      x.date,
      x.person,
      x.shift,
      x.ps ?? "",
      x.pe ?? "",
      x.inn,
      x.out,
      x.brk == null ? "" : String(x.brk),
      fmt(x.planned),
      fmt(x.actual),
      x.actual != null && x.planned != null ? (x.actual - x.planned >= 0 ? "+" : "") + txt(r1(x.actual - x.planned)) : "",
      x.review,
    ]),
  })).filter((g) => g.rows.length > 0);

  const due = rows.filter((x) => x.review !== "Upcoming" && x.review !== "Approved leave");
  const plannedTotal = due.reduce((n, x) => n + (x.planned ?? 0), 0);
  const actualTotal = due.reduce((n, x) => n + (x.actual ?? 0), 0);
  const noShow = rows.filter((x) => x.review === "No show");
  const unverified = rows.filter((x) => x.review === "Unverified").length;
  const insights: string[] = [];
  if (due.length > 0) {
    insights.push(`${txt(r1(plannedTotal))} hours were booked and ${txt(r1(actualTotal))} were worked, ${pct(actualTotal, plannedTotal)} of plan.`);
    const over = due.filter((x) => x.actual != null && x.planned != null && x.actual - x.planned > 0.5);
    const under = due.filter((x) => x.actual != null && x.planned != null && x.planned - x.actual > 0.5);
    insights.push(`${plural(under.length, "shift")} finished more than half an hour short of plan and ${plural(over.length, "shift")} ran more than half an hour over.`);
    if (noShow.length) insights.push(`${plural(noShow.length, "booked shift")} had no attendance and no leave: ${noShow.slice(0, 5).map((x) => `${x.person} (${dm(x.date)})`).join("; ")}${noShow.length > 5 ? "; and more" : ""}.`);
    if (unverified) insights.push(`${plural(unverified, "day")} are still unverified, waiting for approval.`);
    const short = new Map<string, number>();
    for (const x of due) if (x.planned != null) sum(short, x.person, Math.max(0, x.planned - (x.actual ?? 0)));
    const worst = [...short.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] > 0) insights.push(`${worst[0]} is furthest below plan: ${txt(r1(worst[1]))} hours short.`);
  }
  const dates = daysBetween(c.range.start, c.range.end);
  const perDay = (f: (x: V) => number) => dates.length <= 31 ? dates.map((d) => ({ label: String(Number(d.slice(8))), value: r1(due.filter((x) => x.date === d).reduce((n, x) => n + f(x), 0)) })) : [];
  const shortBy = new Map<string, number>();
  for (const x of due) if (x.planned != null) sum(shortBy, x.person, Math.max(0, x.planned - (x.actual ?? 0)));
  const reviewCount = new Map<string, number>();
  for (const x of rows) sum(reviewCount, x.review);
  const charts: ChartSpec[] = [
    ...chart({ title: "Planned hours per day", caption: "Hours booked on each day.", type: "columns", unit: "h", items: perDay((x) => x.planned ?? 0) }),
    ...chart({ title: "Actual hours per day", caption: "Hours worked on each day.", type: "columns", unit: "h", items: perDay((x) => x.actual ?? 0) }),
    ...chart({ title: "Hours short of plan", caption: "People furthest below their booked hours.", type: "bars", unit: "h", items: ranked(shortBy, 10) }),
    ...chart({ title: "Booked shifts by review state", caption: "Where each booked shift ended up.", type: "bars", unit: "", items: ORDER.map((r) => ({ label: r, value: reviewCount.get(r) ?? 0 })).filter((i) => i.value > 0) }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Booked shifts", value: String(rows.length) },
      { label: "Planned hours", value: txt(r1(plannedTotal)) },
      { label: "Actual hours", value: txt(r1(actualTotal)) },
      { label: "Unverified", value: String(unverified) },
    ],
    header: ["Date", "Employee", "Shift", "Planned start", "Planned end", "Actual in", "Actual out", "Break (min)", "Planned (h)", "Actual net (h)", "Variance (h)", "Review state"],
    groups,
    hiddenColumns: [2, 7],
    note: "Planned hours come from the booking or its shift. Actual net is worked time with time away from site taken out. Overnight shifts are counted to the morning they end. Upcoming shifts and approved leave are left out of the totals.",
    insights,
    charts,
  };
}

function audit(base: Base, c: Ctx): TimesheetReport {
  const days = [...c.days].sort((a, z) => a.workDate.localeCompare(z.workDate) || name(a).localeCompare(name(z)));
  const ORDER = ["pending", "approved", "rejected"];
  const groups: ReportGroup[] = ORDER.map((s) => ({
    title: `${APPROVAL[s]} (${days.filter((d) => d.approvalState === s).length})`,
    rows: days.filter((d) => d.approvalState === s).map((d) => [
      d.workDate,
      name(d),
      d.workedMinutes == null ? "" : txt(hrs(d.workedMinutes)),
      d.exceptions.length ? String(d.exceptions.length) : "0",
      APPROVAL[d.approvalState] ?? d.approvalState,
      d.approvedBy ?? "",
      d.approvedAt ? d.approvedAt.slice(0, 10) : "",
      String((d.amendments ?? []).length),
      (d.amendments ?? []).map((a) => `${a.field === "clock_in_at" ? "In" : "Out"} ${localHm(a.previousValue) || "none"} to ${localHm(a.newValue) || "none"} by ${a.actorName ?? "manager"}: ${a.reason}`).join(" | "),
    ]),
  })).filter((g) => g.rows.length > 0);

  const approved = days.filter((d) => d.approvalState === "approved");
  const pending = days.filter((d) => d.approvalState === "pending");
  const amended = days.filter((d) => (d.amendments ?? []).length > 0);
  const insights: string[] = [];
  if (days.length > 0) {
    insights.push(`${approved.length} of ${days.length} days are approved (${pct(approved.length, days.length)}); ${pending.length} are waiting and ${days.filter((d) => d.approvalState === "rejected").length} rejected.`);
    if (pending.length) {
      insights.push(`${txt(hrs(pending.reduce((n, d) => n + (d.workedMinutes ?? 0), 0)))} hours are unapproved. The oldest waiting day is ${dm(pending[0].workDate)} (${name(pending[0])}).`);
      const flagged = pending.filter((d) => d.exceptions.length > 0).length;
      if (flagged) insights.push(`${plural(flagged, "waiting day")} carry exception flags and should be checked before approval.`);
    }
    if (amended.length) {
      const total = amended.reduce((n, d) => n + (d.amendments ?? []).length, 0);
      insights.push(`${plural(total, "manager correction")} on ${plural(amended.length, "day")} (${pct(amended.length, days.length)} of days). Each one is listed with who made it and why.`);
      const byActor = new Map<string, number>();
      for (const d of amended) for (const a of d.amendments ?? []) sum(byActor, a.actorName ?? "Unknown");
      const top = [...byActor.entries()].sort((a, b) => b[1] - a[1])[0];
      if (byActor.size > 1) insights.push(`${top[0]} made the most corrections: ${top[1]}.`);
    } else insights.push("No times were corrected by a manager in this period.");
    const open = days.filter((d) => d.workedMinutes == null).length;
    if (open) insights.push(`${plural(open, "day")} still have no clock-out, so they cannot be approved yet.`);
  }
  const status = new Map<string, number>();
  for (const d of days) sum(status, APPROVAL[d.approvalState] ?? d.approvalState);
  const unapprovedBy = new Map<string, number>();
  for (const d of pending) sum(unapprovedBy, name(d), (d.workedMinutes ?? 0) / 60);
  const approvers = new Map<string, number>();
  for (const d of approved) sum(approvers, d.approvedBy ?? "Not recorded");
  const amendBy = new Map<string, number>();
  for (const d of amended) sum(amendBy, name(d), (d.amendments ?? []).length);
  const charts: ChartSpec[] = [
    ...chart({ title: "Days by approval state", caption: "Every attendance day in the period.", type: "bars", unit: "", items: ranked(status, 4) }),
    ...chart({ title: "Hours awaiting approval", caption: "Unapproved hours for each person, highest first.", type: "bars", unit: "h", items: ranked(unapprovedBy, 10) }),
    ...chart({ title: "Approvals by approver", caption: "Days each manager approved.", type: "bars", unit: "", items: ranked(approvers, 8) }),
    ...chart({ title: "Corrections per person", caption: "Manager corrections made to each person's times.", type: "bars", unit: "", items: ranked(amendBy, 10) }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Days", value: String(days.length) },
      { label: "Approved", value: `${approved.length} (${pct(approved.length, days.length)})` },
      { label: "Waiting", value: String(pending.length) },
      { label: "Corrected", value: String(amended.length) },
    ],
    header: ["Date", "Employee", "Worked (h)", "Flags", "Approval", "Approved by", "Approved on", "Corrections", "Correction detail"],
    groups,
    hiddenColumns: [3, 8],
    note: "Approval is the system's own record. Correction detail lists the previous and new clock time, who changed it and the reason given, and is kept in the files.",
    insights,
    charts,
  };
}

export const flattenTimesheet = flattenDoc;
