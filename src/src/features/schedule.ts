import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";

/** Staff scheduling is switched on per organisation by the platform; everyone then sees their own bookings. */
export function useScheduleOn(): boolean {
  return useModules().has("scheduling");
}

/** Managers and supervisors book people; the server enforces who and for which sites. */
export function useCanBook(): boolean {
  const { currentUser } = useSmartClean();
  return !!currentUser && ["org_admin", "operations_manager", "site_manager", "supervisor"].includes(currentUser.role);
}
