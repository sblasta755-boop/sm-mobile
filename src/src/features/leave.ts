import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";

/** Leave is switched on per organisation by the platform; everyone then asks for and sees their own. */
export function useLeaveOn(): boolean {
  return useModules().has("leave");
}

/** Supervisors and managers decide leave; the server enforces whose, and not your own. */
export function useCanDecideLeave(): boolean {
  const { currentUser } = useSmartClean();
  return !!currentUser && ["org_admin", "operations_manager", "site_manager", "supervisor"].includes(currentUser.role);
}
