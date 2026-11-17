import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSmartClean } from "@/features/store";
import { useCanOpenStock } from "@/features/stock";
import { useCanUsePayroll } from "@/features/payroll";
import { useLeaveOn } from "@/features/leave";
import { useNoticeboardOn } from "@/features/noticeboard";
import { useScheduleOn } from "@/features/schedule";
import { useHasModule } from "@/features/modules";

export type Glyph = keyof typeof Ionicons.glyphMap;
export type Shortcut = { key: string; label: string; icon: Glyph; to: string };

/**
 * What the manager's home cards show, worked out once for all of them. Reads from bootstrap rather than fetching: a
 * manager IS in the tenant whose data bootstrap carries, and the backend has already scoped every collection to
 * their sites (is_site_scoped), so `state.tasks` here is already "tasks at my sites" with nothing to filter.
 */
export function useManagerOverviewData() {
  const { state, currentUser } = useSmartClean();
  const canOpenStock = useCanOpenStock();
  const canUsePayroll = useCanUsePayroll();
  const scheduleOn = useScheduleOn();
  const leaveOn = useLeaveOn();
  const noticeboardOn = useNoticeboardOn();
  const wayfindingOn = useHasModule("wayfinding");
  const layoutOn = useHasModule("site_layout");

  // org_admin and operations_manager are tenant-wide and carry no siteIds; they legitimately see every site.
  // A site_manager's list is their own. Mirrors is_site_scoped server-side.
  const scopedIds = currentUser?.siteIds ?? [];
  const mySites = useMemo(
    () => (scopedIds.length > 0 ? state.sites.filter((s) => scopedIds.includes(s.id)) : state.sites),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sites, currentUser],
  );

  const openTasks = state.tasks.filter((t) => !["approved", "closed"].includes(t.status));
  const overdue = openTasks
    .filter((t) => t.scheduledAt && new Date(t.scheduledAt) < new Date())
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  // Open means not resolved and not closed, the same as the incidents list and the web. Bootstrap carries every site's
  // incidents, so a manager with their own sites counts only those.
  const incidentsHere = state.incidents.filter((i) => scopedIds.length === 0 || scopedIds.includes(i.siteId));
  const openIncidents = incidentsHere.filter((i) => !["resolved", "closed"].includes(i.status));
  const openActions = state.correctiveActions.filter((c) => c.status !== "closed");
  // Only people clocked in at this manager's own sites - state.attendance can hold every site's.
  const mySiteIds = new Set(mySites.map((s) => s.id));
  const onShift = Object.values(state.attendance).filter(
    (entry) => entry?.clockedInAt && !entry.locationLostAt && !!entry.siteId && mySiteIds.has(entry.siteId),
  );
  const onShiftBySite = (siteId: string) => onShift.filter((e) => e.siteId === siteId).length;
  const staffedSites = mySites.filter((s) => onShiftBySite(s.id) > 0).length;

  // The empty state that would otherwise read as a broken app. A site-scoped manager with no sites assigned gets
  // nothing from every list endpoint - correctly, per is_site_scoped - and without saying so the app looks like it
  // failed to load.
  const needsSiteAssignment = (currentUser?.siteIds?.length ?? 0) === 0 && currentUser?.role === "site_manager";

  const shortcuts: Shortcut[] = [
    { key: "report", label: "Management report", icon: "document-text-outline", to: "/management-report" },
    ...(scheduleOn ? [{ key: "schedule", label: "Schedule", icon: "calendar-outline" as Glyph, to: "/schedule" }] : []),
    ...(canUsePayroll ? [{ key: "payruns", label: "Pay runs", icon: "cash-outline" as Glyph, to: "/pay-runs" }] : []),
    ...(noticeboardOn ? [{ key: "noticeboard", label: "Noticeboard", icon: "megaphone-outline" as Glyph, to: "/noticeboard" }] : []),
    ...(leaveOn ? [{ key: "leave", label: "Leave", icon: "airplane-outline" as Glyph, to: "/leave" }] : []),
    ...(canOpenStock ? [{ key: "stock", label: "Stock", icon: "cube-outline" as Glyph, to: "/stock" }] : []),
    ...(wayfindingOn
      ? [
          { key: "signs", label: "Wayfinding signs", icon: "compass-outline" as Glyph, to: "/install-beacon" },
          { key: "walk", label: "Walk a path", icon: "walk-outline" as Glyph, to: "/patrol-walk" },
        ]
      : []),
  ];

  return {
    currentUser,
    tasks: state.tasks,
    incidents: incidentsHere,
    attendance: state.attendance,
    users: state.users,
    inspections: state.inspections,
    correctiveActions: state.correctiveActions,
    mySites,
    openTasks,
    overdue,
    openIncidents,
    openActions,
    onShift,
    onShiftBySite,
    staffedSites,
    needsSiteAssignment,
    shortcuts,
    layoutOn,
  };
}

export type ManagerOverviewData = ReturnType<typeof useManagerOverviewData>;
