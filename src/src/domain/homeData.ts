/**
 * The numbers behind the Custom home's cards, computed from the lists /bootstrap already carries. Pure functions: no
 * React, no network. Mirrors the web console's lib/smartclean/homeData.ts; keep the two in step.
 *
 * A task's calendar day is when it was scheduled, falling back to when it was created.
 */

export interface TaskLike {
  status: string;
  scheduledAt?: string | null;
  createdAt?: string | null;
  siteId?: string;
}
export interface InspectionLike {
  status: string;
  score?: number | null;
  createdAt: string;
}
export interface ActionLike {
  status: string;
}

export const isDoneStatus = (status: string) => ["approved", "closed"].includes(status);

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** The last `days` calendar days ending today, oldest first. */
export function lastDays(days: number, now: Date = new Date()): Date[] {
  const end = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (days - 1 - i));
    return d;
  });
}

const taskDay = (t: TaskLike): Date | null => {
  const d = new Date(t.scheduledAt ?? t.createdAt ?? "");
  return Number.isNaN(d.getTime()) ? null : d;
};

export function completion(tasks: TaskLike[]): { done: number; total: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => isDoneStatus(t.status)).length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export interface DayPoint {
  date: string;
  count: number;
}

/** Tasks done per day over the last `days` days. */
export function flowSeries(tasks: TaskLike[], days: number, now: Date = new Date()): DayPoint[] {
  const points = lastDays(days, now).map((d) => ({ date: dayKey(d), count: 0 }));
  const index = new Map(points.map((p, i) => [p.date, i]));
  for (const t of tasks) {
    if (!isDoneStatus(t.status)) continue;
    const day = taskDay(t);
    const i = day ? index.get(dayKey(day)) : undefined;
    if (i !== undefined) points[i].count++;
  }
  return points;
}

export interface HeatDay {
  date: string;
  count: number;
  /** 0 (quiet) to 4 (busiest), relative to the busiest day shown. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** How busy each of the last `days` days was, by tasks scheduled that day. */
export function activityMap(tasks: TaskLike[], days: number, now: Date = new Date()): HeatDay[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const day = taskDay(t);
    if (day) counts.set(dayKey(day), (counts.get(dayKey(day)) ?? 0) + 1);
  }
  const series = lastDays(days, now).map((d) => ({ date: dayKey(d), count: counts.get(dayKey(d)) ?? 0 }));
  const max = Math.max(0, ...series.map((s) => s.count));
  return series.map((s) => ({
    ...s,
    level: (max === 0 || s.count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((s.count / max) * 4)))) as HeatDay["level"],
  }));
}

export interface Quality {
  passRate: number;
  passed: number;
  failed: number;
  avgScore: number;
  openActions: number;
  overdueActions: number;
}

/** Inspections in the last `days` days, and corrective actions as they stand now. */
export function qualitySummary(inspections: InspectionLike[], actions: ActionLike[], days: number, now: Date = new Date()): Quality {
  const from = lastDays(days, now)[0];
  const inWindow = inspections.filter((i) => new Date(i.createdAt) >= from);
  const failed = inWindow.filter((i) => i.status === "failed").length;
  const passed = inWindow.filter((i) => ["passed", "closed"].includes(i.status)).length;
  const scored = inWindow.filter((i) => i.score);
  return {
    passRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : 0,
    passed,
    failed,
    avgScore: Math.round(scored.reduce((a, i) => a + (i.score ?? 0), 0) / (scored.length || 1)),
    openActions: actions.filter((a) => a.status !== "closed").length,
    overdueActions: actions.filter((a) => a.status === "overdue").length,
  };
}

export interface Attention {
  overdue: number;
  /** Whole days the oldest overdue task is late; 0 when none. */
  oldestDays: number;
  sites: number;
}

/** What is overdue: open tasks scheduled in the past. */
export function attentionSummary(tasks: TaskLike[], now: Date = new Date()): Attention {
  const overdue = tasks.filter((t) => !isDoneStatus(t.status) && t.scheduledAt && new Date(t.scheduledAt) < now);
  if (overdue.length === 0) return { overdue: 0, oldestDays: 0, sites: 0 };
  const oldest = Math.min(...overdue.map((t) => new Date(t.scheduledAt!).getTime()));
  return {
    overdue: overdue.length,
    oldestDays: Math.floor((now.getTime() - oldest) / 86_400_000),
    sites: new Set(overdue.map((t) => t.siteId).filter(Boolean)).size,
  };
}

/** The heat map as columns of 7 days (a week), oldest first, the last column possibly short. */
export function heatColumns<T>(days: T[]): T[][] {
  const cols: T[][] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
  return cols;
}
