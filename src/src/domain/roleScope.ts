/**
 * Which staff roles a site manager or supervisor books at one site. Kept in step with the web app's
 * RoleScopeEditor and the backend's role_scope (controllers/common.py): no entry, or mode "all", means every role.
 */
export type RoleScope = { mode: "all" | "roles"; roles: string[]; extraRoles: string[] };
export type RoleLevel = "primary" | "extra" | "none";

export const ALL_ROLES_SCOPE: RoleScope = { mode: "all", roles: [], extraRoles: [] };

/** The scope a person has at a site, or "all" when they have none. */
export function scopeFor(scopes: Record<string, RoleScope> | undefined, siteId: string): RoleScope {
  const found = scopes?.[siteId];
  return found && found.mode === "roles" ? found : ALL_ROLES_SCOPE;
}

export function levelOf(scope: RoleScope, role: string): RoleLevel {
  return scope.roles.includes(role) ? "primary" : scope.extraRoles.includes(role) ? "extra" : "none";
}

/** Moves one role between "looks after", "can also book" and "not theirs". */
export function withLevel(scope: RoleScope, role: string, level: RoleLevel): RoleScope {
  return {
    mode: "roles",
    roles: [...scope.roles.filter((k) => k !== role), ...(level === "primary" ? [role] : [])],
    extraRoles: [...scope.extraRoles.filter((k) => k !== role), ...(level === "extra" ? [role] : [])],
  };
}

export const sameScope = (a: RoleScope, b: RoleScope) =>
  a.mode === b.mode && a.roles.join("|") === b.roles.join("|") && a.extraRoles.join("|") === b.extraRoles.join("|");

/** Whether the booking list can be widened to extra roles at this site. */
export const hasExtraRoles = (scopes: Record<string, RoleScope> | undefined, siteId: string) =>
  (scopes?.[siteId]?.extraRoles?.length ?? 0) > 0;

/** The bookable roles to offer: every staff role plus supervisors. */
export function bookableRoleOptions(staffRoles: { key: string; label: string }[]): { key: string; label: string }[] {
  const roles = staffRoles.map((r) => ({ key: r.key, label: r.label }));
  return roles.some((r) => r.key === "supervisor") ? roles : [...roles, { key: "supervisor", label: "Supervisor" }];
}
