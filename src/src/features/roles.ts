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
