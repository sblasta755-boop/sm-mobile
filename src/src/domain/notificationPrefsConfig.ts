/**
 * Which phone alerts a person can switch, and the quiet-hours and pause choices. The same file lives in the
 * web app (src/lib/smartclean) and the native app (src/domain): keep them identical so every settings screen
 * offers the same things. The backend reads the saved keys in services/notification_prefs.py.
 */

export type PrefKey =
  | "taskAssignments"
  | "rounds"
  | "incidents"
  | "correctiveActions"
  | "reports"
  | "leave"
  | "tableService"
  | "attendance"
  | "attendanceLate"
  | "attendanceNoClockOut"
  | "attendanceLocation"
  | "schedule"
  | "people";

export interface PrefRowSpec {
  key: PrefKey;
  label: string;
  hint: string;
  /** Roles that get this alert at all; empty means everyone. */
  roles?: string[];
  /** Shown under, and dimmed with, another row. */
  parent?: PrefKey;
}

const MANAGEMENT = ["org_admin", "operations_manager", "site_manager", "supervisor"];

export const PREF_ROW_SPECS: PrefRowSpec[] = [
  { key: "taskAssignments", label: "Tasks", hint: "New tasks and changes to the ones you hold" },
  {
    key: "rounds",
    label: "Hourly rounds",
    hint: "A round opening, closing soon, and clash warnings",
  },
  { key: "incidents", label: "Incidents", hint: "Incident reports at your sites" },
  { key: "correctiveActions", label: "Corrective actions", hint: "Follow-ups raised or rejected" },
  { key: "reports", label: "Reports", hint: "Scheduled reports", roles: ["supervisor"] },
  { key: "leave", label: "Leave", hint: "Requests waiting for you, and decisions on yours" },
  {
    key: "tableService",
    label: "Table requests",
    hint: "Menu, bill, call waiter and other guest requests",
  },
  { key: "schedule", label: "Schedule", hint: "Shifts booked, changed or cancelled for you" },
  {
    key: "attendance",
    label: "Attendance",
    hint: "Late clock-ins, missed clock-outs and lost locations",
    roles: MANAGEMENT,
  },
  {
    key: "attendanceLate",
    label: "Not clocked in",
    hint: "People who are late to clock in",
    roles: MANAGEMENT,
    parent: "attendance",
  },
  {
    key: "attendanceNoClockOut",
    label: "Did not clock out",
    hint: "Shifts closed for someone automatically",
    roles: MANAGEMENT,
    parent: "attendance",
  },
  {
    key: "attendanceLocation",
    label: "Location went silent",
    hint: "A phone stopped reporting its location",
    roles: MANAGEMENT,
    parent: "attendance",
  },
  {
    key: "people",
    label: "People and sites",
    hint: "Staff and site changes",
    roles: ["org_admin", "operations_manager", "site_manager"],
  },
];

export interface QuietPreset {
  label: string;
  from: string;
  to: string;
}

export const QUIET_PRESETS: QuietPreset[] = [
  { label: "20:00 to 08:00", from: "20:00", to: "08:00" },
  { label: "21:00 to 07:00", from: "21:00", to: "07:00" },
  { label: "22:00 to 06:00", from: "22:00", to: "06:00" },
];

export interface QuietHours {
  enabled?: boolean;
  from?: string;
  to?: string;
}

/** Local hours the daily attendance summary can be written; 18 is what a person gets until they choose. */
export const SUMMARY_HOURS = [12, 16, 18, 20] as const;
export const SUMMARY_ROLES = ["org_admin", "operations_manager"];

export function summaryLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const PAUSE_CHOICES = [
  { label: "1 hour", hours: 1 },
  { label: "8 hours", hours: 8 },
  { label: "Until tomorrow", hours: 0 },
] as const;

/** The ISO time a pause of `hours` ends; 0 means the start of tomorrow. */
export function pauseEnd(hours: number, now: Date = new Date()): string {
  if (hours > 0) return new Date(now.getTime() + hours * 3_600_000).toISOString();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow.toISOString();
}

export function pauseActive(until: unknown, now: Date = new Date()): boolean {
  if (typeof until !== "string") return false;
  const at = Date.parse(until);
  return !Number.isNaN(at) && at > now.getTime();
}

/** The rows one person can see: their role's, minus modules they do not have. */
export function visiblePrefRows(role: string | undefined, hidden: PrefKey[]): PrefRowSpec[] {
  return PREF_ROW_SPECS.filter(
    (row) => !hidden.includes(row.key) && (!row.roles || (role !== undefined && row.roles.includes(role))),
  );
}
