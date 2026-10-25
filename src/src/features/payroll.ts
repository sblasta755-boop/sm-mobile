import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";

/** Pay runs hold people's rates and pay, so only organisation administrators and operations managers
 * may open them, and only when the platform has switched the module on for the organisation. The
 * server enforces both; this just keeps the entry points and screens away from everyone else. */
export function useCanUsePayroll(): boolean {
  const { currentUser } = useSmartClean();
  const modules = useModules();
  if (!currentUser || !["org_admin", "operations_manager"].includes(currentUser.role)) return false;
  return modules.has("payroll");
}
