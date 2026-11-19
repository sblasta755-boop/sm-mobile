import { addDays, minutes, weekStart, weekday } from "./scheduleDates";

// The findings and chart figures printed with a schedule report. Pure: it takes the rows the report
// already holds and returns plain sentences and numbers, so web and phone print the same analysis.

export interface RosterEntry {
  date: string;
  userId: string;
  person: string;
  role: string;
  shift: string;
  start: string | null;
  end: string | null;
  hours: number | null;
}

export interface LeaveEntry {
  userId: string;
  person: string;
  kind: string;
  startDate: string;
  endDate: string;
  days: number;
  paid: boolean;
  status: "pending" | "approved" | "declined" | "cancelled";
}

export interface ChartItem {
  label: string;
  value: number;
}

export interface ChartSpec {
  title: string;
  /** Plain line under the title saying what the chart shows. */
  caption: string;
  type: "columns" | "bars";
  unit: string;
  items: ChartItem[];
}

export interface Analysis {
  insights: string[];
  charts: ChartSpec[];
}

/** The ordinary weekly limit used for the long-hours check (South African basic conditions of employment). */
export const WEEKLY_HOURS_LIMIT = 45;

const r1 = (n: number) => Math.round(n * 10) / 10;
const txt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const daysBetween = (start: string, end: string) => {
  const out: string[] = [];
  for (let d = start, i = 0; d <= end && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
};
const dm = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const isWeekend = (day: string) => ["Saturday", "Sunday"].includes(weekday(day));
const dayName = (day: string) => `${weekday(day)} ${dm(day)}`;

function sum(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Bars from a map, largest first, with the tail folded into "Others" past a limit. */
function ranked(map: Map<string, number>, limit: number): ChartItem[] {
  const all = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const items = all.slice(0, limit).map(([label, value]) => ({ label, value: r1(value) }));
  const rest = all.slice(limit).reduce((n, [, v]) => n + v, 0);
  if (rest > 0) items.push({ label: "Others", value: r1(rest) });
  return items;
}

/** One column per day, or per week when the period is long. */
function perDay(
  start: string,
  end: string,
  value: (day: string) => number,
  weekdayLabels: boolean,
): { items: ChartItem[]; by: "day" | "week" } {
  const days = daysBetween(start, end);
  if (days.length <= 31) {
    return {
      by: "day",
      items: days.map((d) => ({
        label: weekdayLabels ? SHORT[(new Date(`${d}T00:00:00Z`).getUTCDay())] : String(Number(d.slice(8))),
        value: r1(value(d)),
      })),
    };
  }
  const weeks = new Map<string, number>();
  for (const d of days) sum(weeks, weekStart(d), value(d));
  return {
    by: "week",
    items: [...weeks.entries()].map(([w, v]) => ({ label: dm(w), value: r1(v) })),
  };
}

function overlaps(a: RosterEntry, b: RosterEntry) {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  const span = (e: RosterEntry) => {
    const s = minutes(e.start!);
    let f = minutes(e.end!);
    if (f <= s) f += 1440;
    return [s, f] as const;
  };
  const [s1, f1] = span(a);
  const [s2, f2] = span(b);
  return s1 < f2 && s2 < f1;
}

export function rosterAnalysis(
  kind: "daily" | "weekly" | "monthly" | "role" | "individual",
  range: { start: string; end: string },
  entries: RosterEntry[],
): Analysis {
  if (entries.length === 0) return { insights: [], charts: [] };
  const days = daysBetween(range.start, range.end);
  const hoursOf = (e: RosterEntry) => e.hours ?? 0;
  const people = new Set(entries.map((e) => e.userId));
  const total = entries.reduce((n, e) => n + hoursOf(e), 0);
  const insights: string[] = [];
  const charts: ChartSpec[] = [];

  const byDay = new Map<string, RosterEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const hoursByPerson = new Map<string, number>();
  const nameOf = new Map(entries.map((e) => [e.userId, e.person]));
  for (const e of entries) sum(hoursByPerson, e.userId, hoursOf(e));

  insights.push(
    `${plural(entries.length, "shift")} booked for ${plural(people.size, "person", "people")} across ${plural(byDay.size, "day")}, ${txt(r1(total))} hours in all.`,
  );

  if (kind === "individual") {
    const worked = [...byDay.keys()].sort();
    const avg = total / entries.length;
    insights.push(`Average shift is ${txt(r1(avg))} hours. The longest is ${txt(r1(Math.max(...entries.map(hoursOf))))} hours.`);
    let run = 1;
    let best = 1;
    for (let i = 1; i < worked.length; i++) {
      run = worked[i] === addDays(worked[i - 1], 1) ? run + 1 : 1;
      best = Math.max(best, run);
    }
    if (best >= 6) insights.push(`Works ${best} days in a row at the longest stretch. Check there is a rest day.`);
    else insights.push(`The longest stretch without a day off is ${plural(best, "day")}.`);
    const weekend = entries.filter((e) => isWeekend(e.date)).length;
    if (weekend > 0) insights.push(`${plural(weekend, "shift")} fall on a weekend (${Math.round((weekend / entries.length) * 100)}% of the total).`);
    const off = days.length - byDay.size;
    insights.push(`Not booked on ${plural(off, "day")} of the ${days.length}-day period.`);
  } else {
    // Cover: busiest and quietest day, and days nobody is booked.
    if (kind !== "daily") {
      const perDayHours = days.map((d) => ({
        d,
        h: (byDay.get(d) ?? []).reduce((n, e) => n + hoursOf(e), 0),
        n: new Set((byDay.get(d) ?? []).map((e) => e.userId)).size,
      }));
      const worked = perDayHours.filter((x) => x.n > 0);
      const busiest = [...worked].sort((a, b) => b.n - a.n || b.h - a.h)[0];
      const quietest = [...worked].sort((a, b) => a.n - b.n || a.h - b.h)[0];
      if (busiest && quietest && busiest.d !== quietest.d) {
        insights.push(
          `Busiest day is ${dayName(busiest.d)} with ${plural(busiest.n, "person", "people")} (${txt(r1(busiest.h))} hours). Quietest booked day is ${dayName(quietest.d)} with ${busiest.n === quietest.n ? "the same" : quietest.n}.`,
        );
      }
      const empty = perDayHours.filter((x) => x.n === 0).map((x) => x.d);
      if (empty.length > 0) {
        const shown = empty.slice(0, 5).map(dayName).join(", ");
        insights.push(
          `No one is booked on ${plural(empty.length, "day")}: ${shown}${empty.length > 5 ? " and more" : ""}.`,
        );
      } else insights.push("Every day in the period has someone booked.");
    }

    // Workload balance.
    if (people.size >= 3) {
      const avg = total / people.size;
      const [topId, topHours] = [...hoursByPerson.entries()].sort((a, b) => b[1] - a[1])[0];
      const [lowId, lowHours] = [...hoursByPerson.entries()].sort((a, b) => a[1] - b[1])[0];
      insights.push(
        `Hours are ${topHours - lowHours <= avg * 0.25 ? "spread fairly evenly" : "uneven"}: the average is ${txt(r1(avg))} hours each, ${nameOf.get(topId)} has the most (${txt(r1(topHours))}) and ${nameOf.get(lowId)} the least (${txt(r1(lowHours))}).`,
      );
    }
  }

  // Long weeks (Mon to Sun) over the ordinary limit.
  const perWeek = new Map<string, number>();
  for (const e of entries) sum(perWeek, `${e.userId}|${weekStart(e.date)}`, hoursOf(e));
  const long = [...perWeek.entries()]
    .filter(([, h]) => h > WEEKLY_HOURS_LIMIT)
    .map(([k, h]) => `${nameOf.get(k.split("|")[0])} (${txt(r1(h))} h, week of ${dm(k.split("|")[1])})`);
  if (long.length > 0)
    insights.push(
      `${plural(long.length, "week")} over ${WEEKLY_HOURS_LIMIT} hours: ${long.slice(0, 4).join("; ")}${long.length > 4 ? "; and more" : ""}.`,
    );
  else insights.push(`No one is booked for more than ${WEEKLY_HOURS_LIMIT} hours in a week.`);

  // Double bookings.
  const clashes: string[] = [];
  for (const [date, list] of byDay) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (list[i].userId === list[j].userId && overlaps(list[i], list[j]))
          clashes.push(`${list[i].person} on ${dm(date)}`);
  }
  if (clashes.length > 0)
    insights.push(`${plural(clashes.length, "overlapping booking")} to fix: ${clashes.slice(0, 4).join("; ")}${clashes.length > 4 ? "; and more" : ""}.`);

  // Shifts without times cannot be counted in hours.
  const untimed = entries.filter((e) => e.hours === null).length;
  if (untimed > 0) insights.push(`${plural(untimed, "booking")} have no times, so they are not counted in the hours.`);

  // Role mix.
  const byRole = new Map<string, number>();
  for (const e of entries) sum(byRole, e.role || "No role", 1);
  if (kind !== "individual" && byRole.size > 1) {
    const [role, n] = [...byRole.entries()].sort((a, b) => b[1] - a[1])[0];
    insights.push(`${role} covers the most shifts: ${n} of ${entries.length} (${Math.round((n / entries.length) * 100)}%).`);
  }

  // Charts.
  const dayChart = perDay(
    range.start,
    range.end,
    (d) => (byDay.get(d) ?? []).reduce((n, e) => n + hoursOf(e), 0),
    kind === "weekly",
  );
  if (kind !== "daily") {
    charts.push({
      title: dayChart.by === "week" ? "Hours booked per week" : "Hours booked per day",
      caption: dayChart.by === "week" ? "Each column is one week, labelled by its Monday." : "Total booked hours on each day of the period.",
      type: "columns",
      unit: "h",
      items: dayChart.items,
    });
  }
  const byShift = new Map<string, number>();
  for (const e of entries) sum(byShift, e.shift, 1);
  charts.push({
    title: "Shifts by shift",
    caption: "How many bookings fall on each shift.",
    type: "bars",
    unit: "",
    items: ranked(byShift, 8),
  });
  if (kind !== "individual" && people.size > 1) {
    charts.push({
      title: "Hours per person",
      caption: "Booked hours for each person, highest first.",
      type: "bars",
      unit: "h",
      items: ranked(new Map([...hoursByPerson].map(([id, h]) => [nameOf.get(id) ?? id, h])), 10),
    });
  }
  if (kind !== "individual" && byRole.size > 1) {
    charts.push({
      title: "Shifts by role",
      caption: "How the bookings split between staff roles.",
      type: "bars",
      unit: "",
      items: ranked(byRole, 8),
    });
  }
  if (kind === "individual") {
    const wk = new Map<string, number>();
    for (const e of entries) sum(wk, weekStart(e.date), hoursOf(e));
    charts.push({
      title: "Hours per week",
      caption: `Each column is one week, labelled by its Monday. The ordinary limit is ${WEEKLY_HOURS_LIMIT} hours.`,
      type: "columns",
      unit: "h",
      items: [...wk.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => ({ label: dm(w), value: r1(v) })),
    });
  }
  return { insights, charts };
}

export function leaveAnalysis(
  range: { start: string; end: string },
  entries: LeaveEntry[],
): Analysis {
  if (entries.length === 0) return { insights: [], charts: [] };
  const insights: string[] = [];
  const count = (s: LeaveEntry["status"]) => entries.filter((e) => e.status === s).length;
  const approved = entries.filter((e) => e.status === "approved");
  const decided = count("approved") + count("declined");

  insights.push(
    `${plural(entries.length, "application")}: ${count("approved")} approved, ${count("pending")} waiting, ${count("declined")} declined and ${count("cancelled")} cancelled.`,
  );
  if (decided > 0)
    insights.push(`${Math.round((count("approved") / decided) * 100)}% of decided applications were approved.`);
  if (count("pending") > 0) {
    const oldest = entries.filter((e) => e.status === "pending").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    insights.push(`${plural(count("pending"), "application")} still need a decision. The earliest starts on ${dm(oldest.startDate)} (${oldest.person}).`);
  }

  const byKind = new Map<string, number>();
  for (const e of approved) sum(byKind, e.kind, e.days);
  if (byKind.size > 0) {
    const [kind, d] = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0];
    insights.push(`${kind} is the most used kind: ${txt(r1(d))} of ${txt(r1([...byKind.values()].reduce((n, v) => n + v, 0)))} approved days.`);
  }
  const unpaid = approved.filter((e) => !e.paid).reduce((n, e) => n + e.days, 0);
  if (unpaid > 0) insights.push(`${txt(r1(unpaid))} approved days are unpaid.`);

  // How many people are away at once, on working days.
  const away = new Map<string, Set<string>>();
  for (const e of approved)
    for (const d of daysBetween(e.startDate < range.start ? range.start : e.startDate, e.endDate > range.end ? range.end : e.endDate))
      if (!isWeekend(d)) away.set(d, (away.get(d) ?? new Set()).add(e.userId));
  const peak = [...away.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
  if (peak && peak[1].size > 1)
    insights.push(`The most people away at once is ${peak[1].size}, on ${dayName(peak[0])}. Check cover for that day.`);
  else if (approved.length > 0) insights.push("No two approved absences overlap on a working day.");

  const byPerson = new Map<string, number>();
  for (const e of approved) sum(byPerson, e.person, e.days);
  const topPerson = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
  if (byPerson.size >= 3 && topPerson) insights.push(`${topPerson[0]} has taken the most approved leave: ${txt(r1(topPerson[1]))} days.`);

  const charts: ChartSpec[] = [
    {
      title: "Applications by status",
      caption: "Every application in the period and where it stands.",
      type: "bars",
      unit: "",
      items: (["approved", "pending", "declined", "cancelled"] as const)
        .map((s) => ({ label: s === "pending" ? "Waiting" : s[0].toUpperCase() + s.slice(1), value: count(s) }))
        .filter((i) => i.value > 0),
    },
  ];
  if (byKind.size > 0)
    charts.push({
      title: "Approved days by kind",
      caption: "Working days of approved leave for each kind.",
      type: "bars",
      unit: "d",
      items: ranked(byKind, 8),
    });
  const awayChart = perDay(range.start, range.end, (d) => away.get(d)?.size ?? 0, false);
  // A weekly total of people-per-day would mislead, so show the peak for each week instead.
  if (away.size > 0) {
    const items =
      awayChart.by === "day"
        ? awayChart.items
        : (() => {
            const peaks = new Map<string, number>();
            for (const [d, set] of away) {
              const w = weekStart(d);
              peaks.set(w, Math.max(peaks.get(w) ?? 0, set.size));
            }
            return [...peaks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([w, v]) => ({ label: dm(w), value: v }));
          })();
    charts.push({
      title: awayChart.by === "day" ? "People on leave per day" : "Most people on leave in a week",
      caption: awayChart.by === "day" ? "Approved leave on each day; weekends are not counted." : "The busiest day of each week, labelled by its Monday.",
      type: "columns",
      unit: "",
      items,
    });
  }
  return { insights, charts };
}
