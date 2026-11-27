/**
 * Who may manage whom. Mirrors _require_can_assign_role on the backend: each management role handles accounts at its
 * own level and below (create, edit, unlock, delete), never above. Everyone else manages nobody. The server enforces it
 * regardless; this only decides what the phone offers.
 */
const RANK: Record<string, number> = { org_admin: 3, operations_manager: 2, site_manager: 1 };

/** Management roles in the order they are offered. Field-staff roles (cleaner, waiter...) all rank 0. */
export const MANAGEMENT_ROLES = [
  { key: "supervisor", label: "Supervisor" },
  { key: "site_manager", label: "Site manager" },
  { key: "operations_manager", label: "Operations manager" },
  { key: "client_auditor", label: "Client auditor" },
  { key: "org_admin", label: "Administrator" },
] as const;

const rankOf = (role: string | undefined) => RANK[role ?? ""] ?? 0;

/** An administrator, operations manager or site manager. */
export function isManagerRole(role: string | undefined): boolean {
  return rankOf(role) > 0;
}

/** Whether `actor` may create, edit or delete an account holding `target`. */
export function canManageRole(actor: string | undefined, target: string | undefined): boolean {
  return isManagerRole(actor) && rankOf(target) <= rankOf(actor);
}

/** The management roles `actor` may hand out: their own level and below. */
export function assignableManagementRoles(actor: string | undefined): { key: string; label: string }[] {
  return MANAGEMENT_ROLES.filter((r) => canManageRole(actor, r.key)).map((r) => ({ key: r.key, label: r.label }));
}
