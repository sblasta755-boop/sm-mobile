// Mirrors smart-property-operations/src/src/lib/smartclean/managementReport.ts - keep both in sync.
//
// The data behind the printable management report ("Daily opening procedure
// report", "Daily cleaning report", ...): everything a site manager hands to
// the client for one site on one day, built only from what the app already
// holds. Pure, so it is tested without a browser; the page just lays it out.
//
// Honest by construction: every figure and every "verified" claim is derived
// from a recorded fact. Where a fact was not recorded the report says so,
// rather than printing a reassuring default.

import type { ChecklistItem, Evidence, Inspection, Task } from "@/types/smartclean";

export interface ReportUser {
  id: string;
  name: string;
}

export interface ReportCheck {
  section: string;
  action: string;
  done: boolean;
  /** "Not required" | "Captured in app" | "Not captured" */
  photoStatus: string;
  photos: Evidence[];
}

export interface ReportSection {
  task: Task;
  area: string;
  cleaner: string;
  supervisor: string;
  inspector: string;
  score: number | null;
  /** "Passed" | "Failed" | "Awaiting inspection" | "In progress" ... */
  outcome: string;
  started: string | null;
  submitted: string | null;
  approved: string | null;
  checks: ReportCheck[];
  /** Photos that belong to the task as a whole, not to one checklist item. */
  taskPhotos: Evidence[];
  verification: { label: string; value: string }[];
}

export interface AreaRow {
  area: string;
  visibleChecks: string;
  score: string;
  status: string;
}

export interface ManagementReport {
  siteName: string;
  siteAddress: string;
  /** "09 October 2026" */
  dateLabel: string;
  /** "05:30 - 05:35", or "-" when nothing was started. */
  timeLabel: string;
  kpis: { approved: number; checksDone: number; checksTotal: number; meanScore: number | null };
  inspectors: string[];
  supervisors: string[];
  areas: AreaRow[];
  totals: { checksDone: number; checksTotal: number; outstanding: number; areas: number; meanScore: number | null };
  sections: ReportSection[];
}

export interface ReportInput {
  site: { id: string; name: string; address: string };
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  tasks: Task[];
  inspections: Inspection[];
  users: ReportUser[];
  /** Only tasks carrying at least one of these tags ("Opening"). Empty = all. */
  tags?: string[];
  /** Only tasks in these areas: a location id, or SITE_WIDE_AREA for whole-site
   * tasks. Empty = every area. */
  areaIds?: string[];
}

/** The area id of a task that belongs to the whole site rather than a room. */
export const SITE_WIDE_AREA = "__site__";

export const areaIdOf = (task: Pick<Task, "locationId" | "isSiteWide">): string =>
  task.isSiteWide || !task.locationId ? SITE_WIDE_AREA : task.locationId;

/** "Opening" -> "Daily Opening Procedure"; anything else -> "Daily Service". */
export function suggestedReportName(tags: string[]): string {
  if (tags.length === 1) return `Daily ${tags[0]} Procedure`;
  return "Daily Service";
}

export interface ReportFilterOptions {
  tags: string[];
  areas: { id: string; label: string }[];
}

/** What can be chosen for this site and day: only tags and areas that
 * actually have work, so every chip on screen leads to a non-empty report. */
export function reportFilterOptions(
  tasks: Task[],
  siteId: string,
  date: string,
): ReportFilterOptions {
  const day = tasks.filter(
    (t) => t.siteId === siteId && !t.isHourlyCompliance && localDayKey(t.scheduledAt) === date,
  );
  const tagMap = new Map<string, string>();
  const areaMap = new Map<string, string>();
  for (const task of day) {
    for (const tag of task.tags ?? []) if (!tagMap.has(tag.toLowerCase())) tagMap.set(tag.toLowerCase(), tag);
    const id = areaIdOf(task);
    if (!areaMap.has(id)) areaMap.set(id, id === SITE_WIDE_AREA ? "Whole site" : (task.locationName ?? "Area"));
  }
  return {
    tags: [...tagMap.values()].sort((a, b) => a.localeCompare(b)),
    areas: [...areaMap.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day of an ISO timestamp, "YYYY-MM-DD". */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

/** "09 Oct 2026, 18:56" */
export function stamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${pad(d.getDate())} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  closed: "Approved",
  submitted: "Submitted",
  resubmitted: "Submitted",
  awaiting_inspection: "Submitted",
  rework_required: "Rework",
  in_progress: "In progress",
  assigned: "Assigned",
  not_started: "Assigned",
  scheduled: "Assigned",
};

export function recordStatus(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function outcomeLabel(task: Task, inspection: Inspection | undefined): string {
  if (inspection?.status === "passed" || task.status === "approved" || task.status === "closed") return "Passed";
  if (inspection?.status === "failed" || task.status === "rework_required") return "Sent back";
  if (["submitted", "resubmitted", "awaiting_inspection"].includes(task.status)) return "Awaiting inspection";
  if (task.status === "in_progress") return "In progress";
  return "Not started";
}

const countable = (item: ChecklistItem) => item.type !== "note";

function startMethodLabel(task: Task): string {
  if (task.qrVerified) return task.isSiteWide ? "Site QR scan" : "Room QR scan";
  if (task.startMethod === "manual") return "Manual start";
  return task.startedAt ? "Not recorded" : "Not started";
}

function locationProof(task: Task): string {
  const proof = task.metadata?.roomQrVerification as
    | { geofenceVerified?: boolean; distanceMeters?: number; reason?: string }
    | undefined;
  if (task.startMethod === "manual" && !task.qrVerified) return "Not required (manual start)";
  if (!proof) return task.qrVerified ? "Scan recorded" : "Not recorded";
  if (typeof proof.distanceMeters === "number") {
    return `${proof.geofenceVerified ? "Within" : "Outside"} the site boundary (${Math.round(proof.distanceMeters)} m)`;
  }
  return proof.reason ?? "Scan recorded";
}

function buildChecks(task: Task): { checks: ReportCheck[]; taskPhotos: Evidence[] } {
  const owned = new Set<string>();
  const checks: ReportCheck[] = task.checklist.filter(countable).map((item) => {
    const photos = item.type === "photo_required" ? task.evidence.filter((e) => e.checklistItemId === item.id) : [];
    photos.forEach((p) => owned.add(p.id));
    const photoStatus =
      item.type !== "photo_required"
        ? "Not required"
        : photos.length > 0 || (!item.photoCount && task.evidence.length > 0)
          ? "Captured in app"
          : "Not captured";
    return {
      section: item.sectionName?.trim() || "General",
      action: item.label,
      done: !!item.done,
      photoStatus,
      photos,
    };
  });
  // Everything not tied to a checklist item (an old task's Before/After, a
  // task-level Evidence photo) is shown once, under the checklist.
  const taskPhotos = task.evidence.filter((e) => !owned.has(e.id) && e.kind !== "issue" && e.kind !== "note");
  return { checks, taskPhotos };
}

export function buildManagementReport(input: ReportInput): ManagementReport {
  const { site, date, inspections, users } = input;
  const nameOf = (id: string | undefined) => users.find((u) => u.id === id)?.name ?? "-";
  const wantedTags = new Set((input.tags ?? []).map((t) => t.toLowerCase()));
  const wantedAreas = new Set(input.areaIds ?? []);

  const tasks = input.tasks
    .filter(
      (t) =>
        t.siteId === site.id &&
        !t.isHourlyCompliance &&
        localDayKey(t.scheduledAt) === date &&
        (wantedTags.size === 0 || (t.tags ?? []).some((tag) => wantedTags.has(tag.toLowerCase()))) &&
        (wantedAreas.size === 0 || wantedAreas.has(areaIdOf(t))),
    )
    .sort((a, b) => a.title.localeCompare(b.title));

  const sections: ReportSection[] = tasks.map((task) => {
    const inspection = [...inspections]
      .filter((i) => i.taskId === task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const { checks, taskPhotos } = buildChecks(task);
    const score = inspection?.score ?? task.score ?? null;
    const offline = task.evidence.filter((e) => e.offlineOriginated).length;
    return {
      task,
      area: task.title,
      cleaner: nameOf(task.assigneeId),
      supervisor: nameOf(task.supervisorId),
      inspector: inspection?.inspectorId ? nameOf(inspection.inspectorId) : "-",
      score: typeof score === "number" ? score : null,
      outcome: outcomeLabel(task, inspection),
      started: stamp(task.startedAt),
      submitted: stamp(task.submittedAt),
      approved: stamp(task.approvedAt),
      checks,
      taskPhotos,
      verification: [
        { label: "Done by", value: nameOf(task.assigneeId) },
        { label: "Started by", value: startMethodLabel(task) },
        { label: "Location proof", value: locationProof(task) },
        {
          label: "Photos",
          value:
            task.evidence.length === 0
              ? "None"
              : offline > 0
                ? `${task.evidence.length} captured live (${offline} while offline)`
                : `${task.evidence.length} captured live`,
        },
      ],
    };
  });

  const allChecks = sections.flatMap((s) => s.checks);
  const checksDone = allChecks.filter((c) => c.done).length;
  const scores = sections.map((s) => s.score).filter((s): s is number => s !== null);
  const meanScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const starts = tasks.map((t) => t.startedAt).filter((v): v is string => !!v).sort();
  const ends = tasks
    .map((t) => t.approvedAt ?? t.submittedAt)
    .filter((v): v is string => !!v)
    .sort();

  const unique = (names: string[]) => [...new Set(names.filter((n) => n && n !== "-"))];

  return {
    siteName: site.name,
    siteAddress: site.address,
    dateLabel: longDate(date),
    timeLabel: starts.length && ends.length ? `${clock(starts[0])} - ${clock(ends[ends.length - 1])}` : "-",
    kpis: {
      approved: sections.filter((s) => s.outcome === "Passed").length,
      checksDone,
      checksTotal: allChecks.length,
      meanScore,
    },
    inspectors: unique(sections.map((s) => s.inspector)),
    supervisors: unique(sections.map((s) => s.supervisor)),
    areas: sections.map((s) => {
      const open = s.checks.filter((c) => !c.done).length;
      return {
        area: s.area,
        visibleChecks: open > 0 ? `${open} not complete` : `${s.checks.length} complete`,
        score: s.score === null ? "Not scored" : `${s.score} / 100`,
        status: recordStatus(s.task.status),
      };
    }),
    totals: {
      checksDone,
      checksTotal: allChecks.length,
      outstanding: allChecks.length - checksDone,
      areas: sections.length,
      meanScore,
    },
    sections,
  };
}
