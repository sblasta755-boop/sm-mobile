import { useModules } from "@/features/modules";

/** Tournaments are switched on per organisation by the platform. */
export function useTournamentsOn(): boolean {
  return useModules().has("tournaments");
}
