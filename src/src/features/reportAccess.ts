import { useEffect, useState } from "react";
import { request } from "@/api/client";
import { isFieldRole } from "./roles";
import { useSmartClean } from "./store";

export type ReportKey =
  | "management"
  | "verification"
  | "stock"
  | "handover"
  | "maintenance"
  | "leave"
  | "schedule"
  | "attendance"
  | "timesheet"
  | "overtime";

const KEYS: ReportKey[] = [
  "management",
  "verification",
  "stock",
  "handover",
  "maintenance",
  "leave",
  "schedule",
  "attendance",
  "timesheet",
  "overtime",
];
const NONE = Object.fromEntries(KEYS.map((k) => [k, false])) as Record<ReportKey, boolean>;
const ALL = Object.fromEntries(KEYS.map((k) => [k, true])) as Record<ReportKey, boolean>;

/**
 * Which reports this person may open, from the server (GET /reports/access).
 *
 * Managers and supervisors have all of them. Anyone else - a cleaner, a waiter, any staff role - has only what
 * management gave their role or them. Fails closed until the answer lands. Presentation only: the server
 * returns a staff member only their own records for the people reports, and the stock and maintenance
 * reports still need the stock or maintenance access.
 */
export function useReportAccess(): Record<ReportKey, boolean> {
  return useReportAccessState().grants;
}

/** The same, with whether the server has answered yet, so a screen can wait instead of sending the person away. */
export function useReportAccessState(): { grants: Record<ReportKey, boolean>; ready: boolean } {
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  const field = isFieldRole(currentUser?.role);
  const [grants, setGrants] = useState(NONE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token || !currentUser || !field) {
      setGrants(NONE);
      setReady(true);
      return;
    }
    let cancelled = false;
    request<{ grants: Partial<Record<ReportKey, boolean>> }>("/reports/access", {}, token)
      .then((out) => !cancelled && setGrants({ ...NONE, ...out.grants }))
      .catch(() => !cancelled && setGrants(NONE))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [token, currentUser, field]);

  if (!currentUser) return { grants: NONE, ready: true };
  if (field) return { grants, ready };
  // The client auditor has the management report only; the platform operator has none.
  if (currentUser.role === "client_auditor") return { grants: { ...NONE, management: true }, ready: true };
  return { grants: currentUser.role === "system_admin" ? NONE : ALL, ready: true };
}
