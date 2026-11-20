import { useHasModule } from "./modules";
import { useMaintenanceOn } from "./maintenance";
import { useReportAccessState, type ReportKey } from "./reportAccess";

type Glyph = "document-text-outline" | "calendar-outline" | "time-outline" | "people-outline" | "construct-outline" | "hourglass-outline";

/** Reports with a screen on the phone. Verification, stock, shift handover and leave reports are on the web app. */
const REPORTS: { key: ReportKey; title: string; sub: string; icon: Glyph; to: string }[] = [
  { key: "management", title: "Management report", sub: "The daily service report for a site and date", icon: "document-text-outline", to: "/management-report" },
  { key: "schedule", title: "Schedule", sub: "Your own shifts", icon: "calendar-outline", to: "/schedule-report" },
  { key: "attendance", title: "Attendance", sub: "Your own register and clock log", icon: "people-outline", to: "/attendance-report" },
  { key: "timesheet", title: "Timesheet", sub: "Your own hours", icon: "time-outline", to: "/timesheet-report" },
  { key: "overtime", title: "Overtime", sub: "Your own overtime requests", icon: "hourglass-outline", to: "/overtime-report" },
  { key: "maintenance", title: "Maintenance", sub: "Jobs, contractors and cost", icon: "construct-outline", to: "/maintenance-report" },
];

/** The reports management has given this person. Managers have their own entry points; this is for staff. */
export function useMyReports() {
  const { grants, ready } = useReportAccessState();
  const scheduling = useHasModule("scheduling");
  const attendance = useHasModule("attendance");
  const maintenance = useMaintenanceOn();
  const moduleOn: Partial<Record<ReportKey, boolean>> = { schedule: scheduling, attendance, timesheet: attendance, overtime: attendance, maintenance };
  return { ready, reports: REPORTS.filter((r) => grants[r.key] && (moduleOn[r.key] ?? true)) };
}

