import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { hasMaintenanceAccess } from "@/domain/maintenance";

/** Maintenance shows only when the organisation has it switched on AND an administrator has given this person
 * access. What else they can do on a job is decided by the server and comes back as the job's `capabilities`. */
export function useMaintenanceOn(): boolean {
  const { currentUser } = useSmartClean();
  return useModules().has("maintenance") && hasMaintenanceAccess(currentUser);
}
