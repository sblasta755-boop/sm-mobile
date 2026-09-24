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
