import { useEffect, useState } from "react";
import { getMaintenanceSummary } from "@/api/client";
import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { hasMaintenanceAccess } from "@/domain/maintenance";

/** Maintenance shows only when the organisation has it switched on AND an administrator has given this person
 * access. What else they can do on a job is decided by the server and comes back as the job's `capabilities`. */
export function useMaintenanceOn(): boolean {
  const { currentUser } = useSmartClean();
  return useModules().has("maintenance") && hasMaintenanceAccess(currentUser);
}

/** Deposits and invoices waiting to be paid to contractors. Zero unless this person pays for maintenance (the server
 * tells everyone else zero), refreshed every minute and when the screen is used again. */
export function useMaintenancePayments(): number {
  const { state } = useSmartClean();
  const on = useMaintenanceOn();
  const token = state.accessToken;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!on || !token) {
      setCount(0);
      return;
    }
    let live = true;
    const load = () =>
      getMaintenanceSummary(token)
        .then((s) => live && setCount(s.payments ?? 0))
        .catch(() => live && setCount(0));
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [on, token]);
  return count;
}
