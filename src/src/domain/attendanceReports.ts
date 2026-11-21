import { longDate } from "./managementReport";
import type { ChartItem, ChartSpec } from "./scheduleAnalysis";
import { flattenDoc, type ReportDoc, type ReportGroup } from "./reportDoc";
import { addDays, minutes, weekday } from "./scheduleDates";

export type AttendanceReportKind = "register" | "summary" | "log" | "exceptions" | "breaks";

export const ATTENDANCE_REPORTS: { kind: AttendanceReportKind; label: string; hint: string; daily: boolean }[] = [
  { kind: "register", label: "Daily staff attendance register", hint: "Everyone for one day: present, late, absent, on leave.", daily: true },
  { kind: "summary", label: "Daily attendance summary", hint: "The day in figures: counts, shares and how people clocked in.", daily: true },
  { kind: "log", label: "Daily clock-in and clock-out log", hint: "Every clock event in time order, with method and amendments.", daily: true },
  { kind: "exceptions", label: "Attendance exceptions report", hint: "Late arrivals, early leavers, missed clock-outs and more.", daily: false },
  { kind: "breaks", label: "Break and lunch compliance", hint: "Time away from site on longer shifts.", daily: false },
];

export const ATTENDANCE_MAX_DAYS = 62;

/** The parts of an attendance day the reports read (both apps' timesheet records fit this). */
export interface AttDay {
  id: string;
  userId: string;
  userName?: string | null;
  siteName?: string | null;
  workDate: string;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  workedMinutes?: number | null;
  expectedStart?: string | null;
  expectedEnd?: string | null;
  /** The server's own comparison with the schedule, in minutes; absent on days recorded before it was kept. */
  bookingId?: string | null;
  scheduledMinutes?: number | null;
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  overtimeMinutes?: number | null;
  exceptions: string[];
  source?: string | null;
  clockInMethod?: string | null;
  clockOutMethod?: string | null;
  approvalState: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  amendments?: {
    field: string;
    previousValue?: string | null;
    newValue?: string | null;
    reason: string;
    actorName?: string | null;
    createdAt: string;
  }[];
  segments?: {
    startedAt: string;
    endedAt?: string | null;
    startMethod?: string | null;
    endMethod?: string | null;
    endReason?: string | null;
  }[];
}

export interface AttendanceReportInput {
  kind: AttendanceReportKind;
  siteName: string;
  date: string;
  start: string;
  end: string;
  days: AttDay[];
  /** Booked shifts in the period (status "booked"); used to find people who did not come. */
  bookings: { userId: string; userName: string; date: string; status: string }[];
  /** Leave requests overlapping the period; only approved ones count. */
  leave: { userId: string; userName: string; startDate: string; endDate: string; status: string; typeName?: string }[];
}

export function attendanceRange(kind: AttendanceReportKind, date: string, start: string, end: string) {
  return ATTENDANCE_REPORTS.find((r) => r.kind === kind)?.daily ? { start: date, end: date } : { start, end };
}

// ---- Times (site-local, a fixed +02:00 like the server) ----

const SAST = 120;
const pad = (n: number) => String(n).padStart(2, "0");
const localAbs = (iso: string) => Math.floor(Date.parse(iso) / 60000) + SAST;
const dayIdx = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
const absOf = (day: string, hm: string) => dayIdx(day) * 1440 + minutes(hm);

/** "HH:MM" in site-local time, whatever zone the machine is in. */
export function localHm(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = ((localAbs(iso) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
const localHour = (iso: string) => Math.floor((((localAbs(iso) % 1440) + 1440) % 1440) / 60);

/**
 * Minutes after the expected start, 0 when on time or when there is no expected start. The server's own
 * figure is used when the day carries one (0 inside the organisation's grace period); older days are
 * worked out here from the clock-in.
 */
export function lateMinutes(d: AttDay): number {
  if (typeof d.lateMinutes === "number") return d.lateMinutes;
  if (!d.clockInAt || !d.expectedStart) return 0;
  return Math.max(0, localAbs(d.clockInAt) - absOf(d.workDate, d.expectedStart));
}

/** Minutes before the expected end that the person left, 0 when not early. */
export function earlyMinutes(d: AttDay): number {
  if (typeof d.earlyLeaveMinutes === "number") return d.earlyLeaveMinutes;
  if (!d.clockOutAt || !d.expectedEnd || !d.expectedStart) return 0;
  const endDay = minutes(d.expectedEnd) <= minutes(d.expectedStart) ? addDays(d.workDate, 1) : d.workDate;
  return Math.max(0, absOf(endDay, d.expectedEnd) - localAbs(d.clockOutAt));
}

/** Gaps between one stretch on site ending and the next starting, in minutes. */
export function gapMinutes(d: AttDay): number[] {
  const seg = [...(d.segments ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const out: number[] = [];
  for (let i = 0; i + 1 < seg.length; i++) {
    const end = seg[i].endedAt;
    if (!end) continue;
    const gap = Math.round((Date.parse(seg[i + 1].startedAt) - Date.parse(end)) / 60000);
    if (gap > 0) out.push(gap);
  }
  return out;
}

export const dur = (m: number) => `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
export const hrs = (m: number) => Math.round((m / 60) * 10) / 10;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const txt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "-");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dm = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
export const dayName = (day: string) => `${weekday(day)} ${dm(day)}`;
export const name = (d: { userName?: string | null; userId: string }) => d.userName || d.userId;

const LABELS: Record<string, string> = {
  LATE: "Late arrival",
  EARLY_LEAVE: "Left early",
  OUTSIDE_SHIFT: "Outside shift hours",
  NO_CLOCK_OUT: "No clock-out",
  NO_GEOFENCE: "Location unverified",
  SHORT_DAY: "Unusually short",
  LONG_DAY: "Unusually long",
  ON_LEAVE: "Clocked in on approved leave",
  recorded_offline: "Recorded offline",
  auto_clocked: "Clocked automatically by location",
  LOCATION_LOST: "Location lost",
  LOCATION_OFF: "Location switched off",
  MOCK_LOCATION: "Location looks faked",
  needs_review: "Needs review",
  OVERTIME_PENDING: "Overtime awaiting approval",
  OVERTIME: "Approved overtime",
};
const label = (flag: string) => LABELS[flag] ?? flag.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const METHOD: Record<string, string> = { qr: "QR scan", manual: "Manual", geofence: "Location" };
const method = (m: string | null | undefined) => (m ? (METHOD[m] ?? m) : "");
const APPROVAL: Record<string, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected" };
const approval = (s: string) => APPROVAL[s] ?? s;
const END_REASON: Record<string, string> = {
  lunch_or_left_site: "Left the site",
  manual: "Clocked out",
  auto_close: "Closed automatically at end of day",
  presence_lost: "Location lost",
  shift_end: "Shift end",
};

export function sum(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}
export function ranked(map: Map<string, number>, limit: number): ChartItem[] {
  const all = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const items = all.slice(0, limit).map(([l, value]) => ({ label: l, value: r1(value) }));
  const rest = all.slice(limit).reduce((n, [, v]) => n + v, 0);
  return rest > 0 ? [...items, { label: "Others", value: r1(rest) }] : items;
}
export const daysBetween = (start: string, end: string) => {
  const out: string[] = [];
  for (let d = start, i = 0; d <= end && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
};

/** Hour-of-day columns across the span of hours that have any data. */
export function hourColumns(title: string, caption: string, hours: number[]): ChartSpec | null {
  if (hours.length === 0) return null;
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  const items: ChartItem[] = [];
  for (let h = lo; h <= hi; h++) items.push({ label: `${pad(h)}h`, value: hours.filter((x) => x === h).length });
  return { title, caption, type: "columns", unit: "", items };
}

export const chart = (c: ChartSpec | null) => (c && c.items.length > 0 ? [c] : []);

// ---- Status of a person on a day ----

type Status = "Present" | "Late" | "Still on shift" | "No clock-out" | "Absent" | "On leave";
const STATUS_ORDER: Status[] = ["Present", "Late", "Still on shift", "No clock-out", "Absent", "On leave"];

function statusOf(d: AttDay): Status {
  if (d.exceptions.includes("NO_CLOCK_OUT")) return "No clock-out";
  if (d.exceptions.includes("LATE")) return "Late";
  if (!d.clockOutAt) return "Still on shift";
  return "Present";
}

interface Person {
  userId: string;
  person: string;
  status: Status;
  day?: AttDay;
}

/** Everyone for one day: people who clocked in, plus booked people who did not come or are on leave. */
function peopleOnDay(day: string, input: AttendanceReportInput): Person[] {
  const done = input.days.filter((d) => d.workDate === day);
  const seen = new Set(done.map((d) => d.userId));
  const out: Person[] = done.map((d) => ({ userId: d.userId, person: name(d), status: statusOf(d), day: d }));
  const away = (u: string) =>
    input.leave.some((l) => l.userId === u && l.status === "approved" && l.startDate <= day && l.endDate >= day);
  for (const l of input.leave) {
    if (l.status === "approved" && l.startDate <= day && l.endDate >= day && !seen.has(l.userId)) {
      seen.add(l.userId);
      out.push({ userId: l.userId, person: l.userName, status: "On leave" });
    }
  }
  for (const b of input.bookings) {
    if (b.status === "booked" && b.date === day && !seen.has(b.userId) && !away(b.userId)) {
      seen.add(b.userId);
      out.push({ userId: b.userId, person: b.userName, status: "Absent" });
    }
  }
  return out.sort((a, z) => a.person.localeCompare(z.person));
}

function approvalOverall(days: AttDay[]): string {
  if (days.length === 0) return "No records";
  const done = days.filter((d) => d.approvalState === "approved").length;
  if (done === days.length) return "Approved";
  if (done === 0) return "Draft (awaiting approval)";
  return `Partly approved (${done} of ${days.length} days)`;
}

// ---- Builder ----

const REGISTER_HEADER = ["Person", "Status", "Expected", "Clock in", "Clock out", "Late (min)", "Early (min)", "Worked (h)", "Method", "Flags", "Approval"];

export interface AttendanceReport extends ReportDoc {
  kind: AttendanceReportKind;
}

export function buildAttendanceReport(input: AttendanceReportInput): AttendanceReport {
  const { kind, siteName } = input;
  const def = ATTENDANCE_REPORTS.find((r) => r.kind === kind)!;
  const range = attendanceRange(kind, input.date, input.start, input.end);
  const days = input.days.filter((d) => d.workDate >= range.start && d.workDate <= range.end);
  const period =
    range.start === range.end ? `${weekday(range.start)} ${longDate(range.start)}` : `${longDate(range.start)} - ${longDate(range.end)}`;
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug(def.label)}-${slug(siteName)}-${range.start}${range.start === range.end ? "" : `-to-${range.end}`}`;
  const base = {
    kind,
    eyebrow: "ATTENDANCE",
    title: def.label,
    period,
    start: range.start,
    end: range.end,
    filename,
    details: [
      { k: "Approval status", v: approvalOverall(days) },
      { k: "Source", v: "Attendance records: clock-ins, clock-outs and manager amendments" },
    ],
  };

  if (kind === "register" || kind === "summary") return daily(kind, base, range.start, input, days);
  if (kind === "log") return log(base, days);
  if (kind === "exceptions") return exceptions(base, range, days);
  return breaks(base, days);
}

type Base = Omit<AttendanceReport, "kpis" | "header" | "groups" | "hiddenColumns" | "note" | "insights" | "charts">;

function daily(kind: "register" | "summary", base: Base, day: string, input: AttendanceReportInput, days: AttDay[]): AttendanceReport {
  const people = peopleOnDay(day, input);
  const by = (s: Status) => people.filter((p) => p.status === s);
  const present = days.length;
  const late = by("Late");
  const absent = by("Absent").length;
  const onLeave = by("On leave").length;
  const expected = people.filter((p) => p.status !== "On leave").length;
  const lateMins = days.map(lateMinutes).filter((m) => m > 0);
  const early = days.filter((d) => d.exceptions.includes("EARLY_LEAVE"));
  const noOut = by("No clock-out").length;
  const worked = days.reduce((n, d) => n + (d.workedMinutes ?? 0), 0);
  const approved = days.filter((d) => d.approvalState === "approved").length;

  const insights: string[] = [];
  if (people.length === 0) return empty(kind, base);
  insights.push(
    `${present} of ${expected} expected ${expected === 1 ? "person" : "people"} clocked in (${pct(present, expected)}). ${absent} did not come${onLeave ? ` and ${onLeave} ${onLeave === 1 ? "is" : "are"} on approved leave` : ""}.`,
  );
  if (late.length > 0) {
    const worst = [...days].sort((a, z) => lateMinutes(z) - lateMinutes(a))[0];
    insights.push(
      `${plural(late.length, "person", "people")} arrived late (${pct(late.length, present)} of those present). Average ${Math.round(lateMins.reduce((n, m) => n + m, 0) / Math.max(lateMins.length, 1))} minutes after the start; the latest was ${name(worst)} at ${lateMinutes(worst)} minutes.`,
    );
  } else if (present > 0) insights.push("Everyone who came arrived within the grace time.");
  if (early.length > 0) insights.push(`${plural(early.length, "person", "people")} left before the end of the shift.`);
  if (noOut > 0) insights.push(`${plural(noOut, "person", "people")} did not clock out and need their day completed.`);
  if (present > 0) insights.push(`${txt(hrs(worked))} hours worked in all, an average of ${txt(hrs(worked / present))} per person.`);
  if (absent > 0)
    insights.push(`Not in: ${by("Absent").slice(0, 6).map((p) => p.person).join(", ")}${absent > 6 ? " and more" : ""}. Absence is booked staff with no clock-in and no approved leave.`);
  insights.push(`${approved} of ${present} days are approved.`);

  const statusChart: ChartSpec = {
    title: "Who was where",
    caption: "Everyone expected on the day, by what happened.",
    type: "bars",
    unit: "",
    items: [
      { label: "On time", value: by("Present").length + by("Still on shift").length },
      { label: "Late", value: late.length },
      { label: "No clock-out", value: noOut },
      { label: "Absent", value: absent },
      { label: "On leave", value: onLeave },
    ].filter((i) => i.value > 0),
  };
  const arrival = hourColumns("Arrivals by hour", "When people clocked in, in site time.", days.filter((d) => d.clockInAt).map((d) => localHour(d.clockInAt!)));
  const lateByPerson = ranked(new Map(days.map((d) => [name(d), lateMinutes(d)])), 10);
  const hoursByPerson = ranked(new Map(days.map((d) => [name(d), hrs(d.workedMinutes ?? 0)])), 10);
  const charts = [
    statusChart,
    ...chart(arrival),
    ...(lateByPerson.length ? [{ title: "Minutes late", caption: "Minutes after the expected start, for each late arrival.", type: "bars" as const, unit: "min", items: lateByPerson }] : []),
    ...(hoursByPerson.length ? [{ title: "Hours worked", caption: "Worked hours so far for each person.", type: "bars" as const, unit: "h", items: hoursByPerson }] : []),
  ];

  const kpis = [
    { label: "Expected", value: String(expected) },
    { label: "Present", value: `${present} (${pct(present, expected)})` },
    { label: "Late", value: String(late.length) },
    { label: "Absent", value: String(absent) },
  ];

  if (kind === "register") {
    const rowOf = (p: Person): string[] => {
      const d = p.day;
      if (!d) return [p.person, p.status, "", "", "", "", "", "", "", "", ""];
      return [
        p.person,
        p.status,
        d.expectedStart && d.expectedEnd ? `${d.expectedStart}-${d.expectedEnd}` : "",
        localHm(d.clockInAt),
        localHm(d.clockOutAt),
        String(lateMinutes(d)),
        String(earlyMinutes(d)),
        d.workedMinutes == null ? "" : txt(hrs(d.workedMinutes)),
        [method(d.clockInMethod), method(d.clockOutMethod)].filter(Boolean).join(" / "),
        d.exceptions.map(label).join(", "),
        approval(d.approvalState),
      ];
    };
    const groups: ReportGroup[] = STATUS_ORDER.map((s) => ({ title: `${s} (${by(s).length})`, rows: by(s).map(rowOf), s })).filter((g) => g.rows.length > 0);
    return {
      ...base,
      kpis,
      header: REGISTER_HEADER,
      groups: groups.map(({ title, rows }) => ({ title, rows })),
      hiddenColumns: [6, 8],
      note: "Times are site-local. Late and early are minutes against the expected shift; the Late status uses the system's 15 minute grace. Absent means booked with no clock-in and no approved leave.",
      insights,
      charts,
    };
  }

  // Summary
  const methods = new Map<string, number>();
  for (const d of days) sum(methods, method(d.clockInMethod) || "Not recorded");
  const rows: string[][] = [
    ["Expected to work", String(expected), "100%"],
    ["Clocked in", String(present), pct(present, expected)],
    ["On time", String(present - late.length), pct(present - late.length, expected)],
    ["Late", String(late.length), pct(late.length, expected)],
    ["Absent", String(absent), pct(absent, expected)],
    ["On approved leave", String(onLeave), "-"],
    ["Left early", String(early.length), pct(early.length, expected)],
    ["No clock-out", String(noOut), pct(noOut, expected)],
    ["Total hours worked", txt(hrs(worked)), "-"],
    ["Average hours per person", present ? txt(hrs(worked / present)) : "-", "-"],
    ["Days approved", `${approved} of ${present}`, pct(approved, present)],
  ];
  return {
    ...base,
    kpis,
    header: ["Measure", "Value", "Share of expected"],
    groups: [
      { title: "Attendance", rows },
      ...(methods.size > 0 ? [{ title: "How people clocked in", rows: [...methods.entries()].map(([m, n]) => [m, String(n), pct(n, present)]) }] : []),
    ],
    hiddenColumns: [],
    note: "Expected is everyone booked for the day plus anyone who clocked in. People on approved leave are not counted as expected.",
    insights,
    charts,
  };
}

function empty(kind: AttendanceReportKind, base: Base): AttendanceReport {
  return { ...base, kind, kpis: [], header: REGISTER_HEADER, groups: [], hiddenColumns: [], note: "", insights: [], charts: [] };
}

function log(base: Base, days: AttDay[]): AttendanceReport {
  interface Ev { abs: number; date: string; time: string; person: string; type: string; method: string; detail: string; iso: string }
  const evs: Ev[] = [];
  const add = (iso: string, d: AttDay, type: string, m: string, detail: string) =>
    evs.push({ abs: localAbs(iso), date: d.workDate, time: localHm(iso), person: name(d), type, method: m, detail, iso });
  for (const d of days) {
    const seg = [...(d.segments ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    if (seg.length === 0) {
      if (d.clockInAt) add(d.clockInAt, d, "Clock in", method(d.clockInMethod), "");
      if (d.clockOutAt) add(d.clockOutAt, d, "Clock out", method(d.clockOutMethod), d.source === "auto_closed" ? "Closed automatically" : "");
    }
    seg.forEach((s, i) => {
      add(s.startedAt, d, "Clock in", method(i === 0 ? d.clockInMethod : s.startMethod), i === 0 ? "" : "Back on site");
      if (s.endedAt) {
        const last = i === seg.length - 1;
        add(s.endedAt, d, "Clock out", method(last ? d.clockOutMethod : s.endMethod), END_REASON[s.endReason ?? ""] ?? "");
      }
    });
    for (const a of d.amendments ?? []) {
      const f = a.field === "clock_in_at" ? "Clock-in" : "Clock-out";
      add(a.createdAt, d, "Amended", "Manager", `${f} changed from ${localHm(a.previousValue) || "none"} to ${localHm(a.newValue) || "none"}${a.actorName ? ` by ${a.actorName}` : ""}: ${a.reason}`);
    }
  }
  evs.sort((a, z) => a.abs - z.abs || a.person.localeCompare(z.person));
  const ins = evs.filter((e) => e.type === "Clock in");
  const outs = evs.filter((e) => e.type === "Clock out");
  const manual = evs.filter((e) => e.method === "Manual").length;
  const auto = evs.filter((e) => e.method === "Location").length;
  const amended = evs.filter((e) => e.type === "Amended").length;
  const people = new Set(days.map((d) => d.userId)).size;
  const insights: string[] = [];
  if (evs.length > 0) {
    insights.push(`${plural(evs.length, "clock event")} for ${plural(people, "person", "people")}: ${ins.length} clock-ins and ${outs.length} clock-outs.`);
    if (ins[0]) insights.push(`First clock-in was ${ins[0].person} at ${ins[0].time}${outs.length ? `; the last clock-out was ${outs[outs.length - 1].person} at ${outs[outs.length - 1].time}` : ""}.`);
    const perHour = new Map<string, number>();
    for (const e of ins) sum(perHour, e.time.slice(0, 2));
    const peak = [...perHour.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (peak) insights.push(`Most people clocked in between ${peak[0]}:00 and ${peak[0]}:59 (${peak[1]} of ${ins.length}).`);
    insights.push(`${manual} manual and ${auto} location-based events; the rest were QR scans${manual > 0 ? ". Manual events carry less proof than a scan" : ""}.`);
    if (amended > 0) insights.push(`${plural(amended, "time")} corrected by a manager. The reason for each is in the log.`);
    const returned = days.filter((d) => (d.segments?.length ?? 0) > 1).length;
    if (returned > 0) insights.push(`${plural(returned, "person", "people")} left the site and came back during the day.`);
  }
  const methods = new Map<string, number>();
  for (const e of evs) if (e.type !== "Amended") sum(methods, e.method || "Not recorded");
  const charts = [
    ...chart(hourColumns("Clock-ins by hour", "When people arrived, in site time.", ins.map((e) => Number(e.time.slice(0, 2))))),
    ...chart(hourColumns("Clock-outs by hour", "When people left, in site time.", outs.map((e) => Number(e.time.slice(0, 2))))),
    ...chart({ title: "How events were recorded", caption: "Clock events by method.", type: "bars", unit: "", items: ranked(methods, 6) }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Clock events", value: String(evs.length) },
      { label: "People", value: String(people) },
      { label: "First in", value: ins[0]?.time ?? "-" },
      { label: "Last out", value: outs.length ? outs[outs.length - 1].time : "-" },
    ],
    header: ["Date", "Time", "Person", "Event", "Method", "Detail"],
    groups: evs.length ? [{ title: "Clock events in time order", rows: evs.map((e) => [e.date, e.time, e.person, e.type, e.method, e.detail]) }] : [],
    hiddenColumns: [0],
    note: "Times are site-local. A day with several visits to the site shows each arrival and departure. Amended rows are manager corrections, kept with their reason.",
    insights,
    charts,
  };
}

function exceptions(base: Base, range: { start: string; end: string }, days: AttDay[]): AttendanceReport {
  interface X { date: string; person: string; userId: string; flag: string; detail: string; source: string; approval: string }
  const xs: X[] = [];
  for (const d of days) {
    for (const f of d.exceptions) {
      let detail = "";
      if (f === "LATE") detail = `${lateMinutes(d)} min after ${d.expectedStart ?? "start"}`;
      else if (f === "EARLY_LEAVE") detail = `${earlyMinutes(d)} min before ${d.expectedEnd ?? "end"}`;
      else if (f === "NO_CLOCK_OUT") detail = `Clocked in ${localHm(d.clockInAt)}, no clock-out`;
      else if (f === "SHORT_DAY" || f === "LONG_DAY") detail = d.workedMinutes == null ? "" : `Worked ${dur(d.workedMinutes)}`;
      xs.push({ date: d.workDate, person: name(d), userId: d.userId, flag: label(f), detail, source: d.source ?? "", approval: approval(d.approvalState) });
    }
    for (const a of d.amendments ?? []) {
      xs.push({ date: d.workDate, person: name(d), userId: d.userId, flag: "Time amended", detail: a.reason, source: "amended", approval: approval(d.approvalState) });
    }
  }
  xs.sort((a, z) => a.date.localeCompare(z.date) || a.person.localeCompare(z.person));
  const byType = new Map<string, number>();
  for (const x of xs) sum(byType, x.flag);
  const typeOrder = [...byType.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const groups: ReportGroup[] = typeOrder.map(([t, n]) => ({
    title: `${t} (${n})`,
    rows: xs.filter((x) => x.flag === t).map((x) => [x.date, x.person, x.flag, x.detail, x.source, x.approval]),
  }));
  const affectedDays = new Set(xs.map((x) => `${x.userId}|${x.date}`)).size;
  const people = new Set(xs.map((x) => x.userId)).size;
  const waiting = days.filter((d) => d.exceptions.length > 0 && d.approvalState === "pending").length;
  const insights: string[] = [];
  if (xs.length > 0) {
    insights.push(`${plural(xs.length, "exception")} on ${plural(affectedDays, "day")} across ${plural(people, "person", "people")}, out of ${plural(days.length, "attendance day")} (${pct(affectedDays, days.length)} of days had at least one).`);
    insights.push(`${typeOrder[0][0]} is the most common: ${typeOrder[0][1]} (${pct(typeOrder[0][1], xs.length)} of all exceptions).`);
    const lates = new Map<string, number>();
    for (const x of xs) if (x.flag === label("LATE")) sum(lates, x.person);
    const repeat = [...lates.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
    if (repeat.length > 0) insights.push(`Repeated lateness (3 or more times): ${repeat.slice(0, 5).map(([p, n]) => `${p} (${n})`).join(", ")}.`);
    const perDay = new Map<string, number>();
    for (const x of xs) sum(perDay, x.date);
    const worst = [...perDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    insights.push(`The worst day was ${dayName(worst[0])} with ${plural(worst[1], "exception")}.`);
    const unverified = byType.get(label("NO_GEOFENCE")) ?? 0;
    if (unverified > 0) insights.push(`${plural(unverified, "clock event")} had no location proof.`);
    const amended = byType.get("Time amended") ?? 0;
    if (amended > 0) insights.push(`${plural(amended, "time")} were changed by a manager after the fact. Check the reasons are sound.`);
    if (waiting > 0) insights.push(`${plural(waiting, "day")} with exceptions are still waiting for approval.`);
  }
  const perDayMap = new Map<string, number>();
  for (const x of xs) sum(perDayMap, x.date);
  const dayItems = daysBetween(range.start, range.end).length <= 31
    ? daysBetween(range.start, range.end).map((d) => ({ label: String(Number(d.slice(8))), value: perDayMap.get(d) ?? 0 }))
    : [];
  const byPerson = new Map<string, number>();
  for (const x of xs) sum(byPerson, x.person);
  const charts: ChartSpec[] = [
    ...chart({ title: "Exceptions by type", caption: "How many of each kind in the period.", type: "bars", unit: "", items: typeOrder.slice(0, 10).map(([l, v]) => ({ label: l, value: v })) }),
    ...chart({ title: "Exceptions per day", caption: "All exceptions on each day of the period.", type: "columns", unit: "", items: dayItems }),
    ...chart({ title: "Exceptions per person", caption: "People with the most exceptions, highest first.", type: "bars", unit: "", items: ranked(byPerson, 10) }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Exceptions", value: String(xs.length) },
      { label: "Days affected", value: `${affectedDays} of ${days.length}` },
      { label: "People", value: String(people) },
      { label: "Awaiting approval", value: String(waiting) },
    ],
    header: ["Date", "Person", "Exception", "Detail", "Source", "Approval"],
    groups,
    hiddenColumns: [4],
    note: "Flags come from the attendance rules: late and early leave use a 15 minute grace. A day can carry several flags. Time amended lists each manager correction with its reason.",
    insights,
    charts,
  };
}

/** A shift longer than this should have a break. */
export const BREAK_AFTER_MINUTES = 300;
/** The shortest gap that counts as a break (a meal interval of 30 minutes). */
export const MIN_BREAK_MINUTES = 30;

function breaks(base: Base, days: AttDay[]): AttendanceReport {
  const done = days.filter((d) => d.workedMinutes != null);
  interface B { d: AttDay; gaps: number[]; result: string }
  const rows: B[] = done.map((d) => {
    const gaps = gapMinutes(d);
    const longest = gaps.length ? Math.max(...gaps) : 0;
    const result =
      (d.workedMinutes ?? 0) <= BREAK_AFTER_MINUTES
        ? "Shift of 5 hours or less"
        : longest >= MIN_BREAK_MINUTES
          ? "Break taken"
          : longest > 0
            ? "Short break"
            : "No break recorded";
    return { d, gaps, result };
  });
  rows.sort((a, z) => a.d.workDate.localeCompare(z.d.workDate) || name(a.d).localeCompare(name(z.d)));
  const ORDER = ["Break taken", "Short break", "No break recorded", "Shift of 5 hours or less"];
  const groups: ReportGroup[] = ORDER.map((r) => ({
    title: `${r} (${rows.filter((x) => x.result === r).length})`,
    rows: rows
      .filter((x) => x.result === r)
      .map((x) => [
        x.d.workDate,
        name(x.d),
        txt(hrs(x.d.workedMinutes ?? 0)),
        String(x.gaps.length),
        x.gaps.length ? String(Math.max(...x.gaps)) : "0",
        String(x.gaps.reduce((n, g) => n + g, 0)),
        x.result,
      ]),
  })).filter((g) => g.rows.length > 0);

  const long = rows.filter((x) => x.result !== "Shift of 5 hours or less");
  const taken = long.filter((x) => x.result === "Break taken").length;
  const short = long.filter((x) => x.result === "Short break").length;
  const none = long.filter((x) => x.result === "No break recorded").length;
  const insights: string[] = [];
  if (long.length > 0) {
    insights.push(`${long.length} shifts ran over 5 hours. A gap of ${MIN_BREAK_MINUTES} minutes or more was recorded on ${taken} (${pct(taken, long.length)}), a shorter gap on ${short} and none on ${none}.`);
    const missing = new Map<string, number>();
    for (const x of long) if (x.result === "No break recorded") sum(missing, name(x.d));
    const top = [...missing.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) insights.push(`${top[0]} has the most long shifts with no recorded break: ${top[1]}.`);
    const allGaps = long.flatMap((x) => x.gaps);
    if (allGaps.length > 0) insights.push(`Gaps average ${Math.round(allGaps.reduce((n, g) => n + g, 0) / allGaps.length)} minutes; the longest was ${Math.max(...allGaps)} minutes.`);
    const longest = [...long].sort((a, z) => z.d.workedMinutes! - a.d.workedMinutes!)[0];
    if ((longest.d.workedMinutes ?? 0) >= 600) insights.push(`The longest shift was ${name(longest.d)} on ${dm(longest.d.workDate)}: ${dur(longest.d.workedMinutes ?? 0)}.`);
  } else if (done.length > 0) insights.push("No shift in the period ran over 5 hours, so no break was expected.");
  insights.push("The system has no break clock. A break shows only when someone leaves the site and returns, so a lunch taken on site reads as no break recorded.");

  const missingBy = new Map<string, number>();
  for (const x of long) if (x.result !== "Break taken") sum(missingBy, name(x.d));
  const buckets = [
    ["Under 15 min", (g: number) => g < 15],
    ["15 to 29 min", (g: number) => g >= 15 && g < 30],
    ["30 to 59 min", (g: number) => g >= 30 && g < 60],
    ["60 to 89 min", (g: number) => g >= 60 && g < 90],
    ["90 min or more", (g: number) => g >= 90],
  ] as const;
  const gapAll = rows.flatMap((x) => x.gaps);
  const charts: ChartSpec[] = [
    ...chart({ title: "Long shifts by result", caption: "Shifts over 5 hours and whether a break was recorded.", type: "bars", unit: "", items: [{ label: "Break taken", value: taken }, { label: "Short break", value: short }, { label: "No break recorded", value: none }].filter((i) => i.value > 0) }),
    ...chart({ title: "Long shifts without a full break", caption: "People with the most long shifts that had no break of 30 minutes.", type: "bars", unit: "", items: ranked(missingBy, 10) }),
    ...chart({ title: "How long gaps lasted", caption: "Every gap between leaving and returning to the site.", type: "columns", unit: "", items: gapAll.length ? buckets.map(([l, f]) => ({ label: l.replace(" min", ""), value: gapAll.filter(f).length })) : [] }),
  ];
  return {
    ...base,
    kpis: [
      { label: "Shifts over 5 hours", value: String(long.length) },
      { label: "Break taken", value: String(taken) },
      { label: "Short or none", value: String(short + none) },
      { label: "Compliance", value: pct(taken, long.length) },
    ],
    header: ["Date", "Person", "Worked (h)", "Gaps", "Longest gap (min)", "Total away (min)", "Result"],
    groups,
    hiddenColumns: [],
    note: "Limit: breaks are not clocked. A gap is time between leaving the site and coming back, so this shows time away from site, not proof a lunch was taken. A shift over 5 hours is expected to show a gap of 30 minutes or more.",
    insights,
    charts,
  };
}

export const flattenAttendance = flattenDoc;

// ---- Spreadsheet text ----

/** Quotes a cell. Text a spreadsheet would run as a formula gets a leading apostrophe. */
function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The CSV text with a byte-order mark so Excel reads names and accents correctly. */
export function attendanceCsv(report: ReportDoc): string {
  const { header, rows } = flattenDoc(report);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
