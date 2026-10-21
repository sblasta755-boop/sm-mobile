import type { StaffRole } from "@/types/smartclean";
import { useSmartClean } from "./store";

/**
 * The first role-gate helper on mobile. Deliberately narrow - modules.ts's
 * own docstring explains why this app has no general role->route
 * allowlist the way the web app's permissions.ts does, and this stays
 * true to that: one hook, scoped to exactly the screens that need it,
 * not a reusable RBAC layer.
 *
 * Site layout (floors/rooms arrangement) is management tooling, not
 * field-ops tooling - a cleaner scans a QR to start a task and never
 * needs to see or edit a floor plan. This role set matches
 * _can_manage_site's role check server-side
 * (backend/app/controllers/sites.py), so this hook doesn't offer an
 * action the server would 403 anyway.
 *
 * Not enforcement - the server's has_role + _can_manage_site checks are
 * authoritative either way. This only decides whether the entry point is
 * shown at all.
 */
const SITE_LAYOUT_ROLES = ["org_admin", "operations_manager", "site_manager"] as const;

export function useCanManageSiteLayout(): boolean {
  const { currentUser } = useSmartClean();
  return !!currentUser && (SITE_LAYOUT_ROLES as readonly string[]).includes(currentUser.role);
}

// ---- Where each role lives ----
//
// Every role has its own app (route group) with its own home and tab bar -
// see app/index.tsx. Screens that more than one role reaches (a task, a
// corrective action, the board) live in app/(shared)/ so they open on top of
// whichever app the person came from instead of dragging them into another
// role's. Their "go home" and "scan" targets therefore have to follow the
// ROLE, not assume the cleaner's /home and /scan.

const HOME_BY_ROLE: Record<string, string> = {
  system_admin: "/platform-dashboard",
  org_admin: "/manage-home",
  operations_manager: "/manage-home",
  site_manager: "/manage-home",
  supervisor: "/supervise-home",
  client_auditor: "/audit-home",
};

/** The home screen of the app this role belongs to. Cleaners, waiters and any role this build has not heard of get the field app, as app/index.tsx does. */
export function homePathForRole(role: string | undefined): string {
  return (role && HOME_BY_ROLE[role]) || "/home";
}

/** Is this role served by the cleaner/waiter field app? (False for every role with an app of its own.) */
export function isFieldRole(role: string | undefined): boolean {
  return !role || !(role in HOME_BY_ROLE);
}

/** The QR scanner for this role: the cleaner's full scanner, or the supervisor's. Roles with no scanner fall back to their home. */
export function scanPathForRole(role: string | undefined): string {
  if (role === "supervisor") return "/supervise-scan";
  if (isFieldRole(role)) return "/scan";
  return homePathForRole(role);
}

export function useHomePath(): string {
  const { currentUser } = useSmartClean();
  return homePathForRole(currentUser?.role);
}

export function useScanPath(): string {
  const { currentUser } = useSmartClean();
  return scanPathForRole(currentUser?.role);
}

// ---- Field-staff role definitions ----
//
// Cleaner, waiter and any role a platform operator adds come from the
// backend's staff_roles table (bootstrap.staffRoles). These two are the
// fallback for an older backend, or a bootstrap that has not landed yet, so
// the app never has to guess what a cleaner or waiter is.

const STANDARD_FEATURES = { tables: false, actionsTab: true, ratings: true, reports: true };
const TABLE_SERVICE_FEATURES = { tables: true, actionsTab: false, ratings: true, reports: false };

const BUILTIN_STAFF_ROLES: Record<string, StaffRole> = {
  cleaner: { key: "cleaner", label: "Cleaner", pluralLabel: "Cleaners", template: "standard", features: STANDARD_FEATURES },
  waiter: {
    key: "waiter",
    label: "Waiter",
    pluralLabel: "Waiters",
    template: "table_service",
    features: TABLE_SERVICE_FEATURES,
  },
};

/** The definition for a field-staff role, or null for a management role. An unknown field role gets the standard template. */
export function resolveStaffRole(staffRoles: StaffRole[], role: string | undefined): StaffRole | null {
  if (!role || !isFieldRole(role)) return null;
  return (
    staffRoles.find((item) => item.key === role) ??
    BUILTIN_STAFF_ROLES[role] ?? {
      key: role,
      label: role.replace(/_/g, " "),
      pluralLabel: `${role.replace(/_/g, " ")}s`,
      template: "standard",
      features: STANDARD_FEATURES,
    }
  );
}

const REPORT_MANAGEMENT_ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin", "client_auditor"];

/** Who may produce a client-facing report: management, plus any staff role whose template allows it. */
export function useCanMakeReports(): boolean {
  const { state, currentUser } = useSmartClean();
  if (!currentUser) return false;
  if (REPORT_MANAGEMENT_ROLES.includes(currentUser.role)) return true;
  return !!resolveStaffRole(state.staffRoles, currentUser.role)?.features.reports;
}

/** The signed-in person's role definition, or null when they are management. */
export function useStaffRole(): StaffRole | null {
  const { state, currentUser } = useSmartClean();
  return resolveStaffRole(state.staffRoles, currentUser?.role);
}

/** A readable name for any role: the staff role's label, else the role key with underscores removed. */
export function roleLabel(staffRoles: StaffRole[], role: string | undefined): string {
  if (!role) return "";
  return resolveStaffRole(staffRoles, role)?.label ?? role.replace(/_/g, " ");
}

export function useRoleLabel(): (role: string | undefined) => string {
  const { state } = useSmartClean();
  return (role) => roleLabel(state.staffRoles, role);
}
