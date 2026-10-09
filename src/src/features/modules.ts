import { useMemo } from "react";

import { useSmartClean } from "./store";

/**
 * Subscription-module helpers for the mobile app.
 *
 * Deliberately minimal. The web app has a whole permissions.ts (role ->
 * route allowlists, PATH_MODULE, canAccessWithModules); this app has no
 * role helper at all, and this is not the place to introduce one. Module
 * gating and role gating are separate questions, and a cleaner's screens
 * are almost entirely core modules anyway - only corrective actions,
 * hourly compliance and incident reporting are gateable here.
 *
 * None of this is enforcement. The server 402s a locked module whatever
 * the app renders (see require_module in app/api/deps.py); these hooks
 * exist so the app does not offer a tab that only ever errors.
 */

/** The effective module keys for the signed-in organisation.
 *
 * An EMPTY set means "not known yet", not "nothing unlocked" - bootstrap
 * may not have landed on a cold start, and useHasModule treats that as
 * permissive. */
export function useModules(): ReadonlySet<string> {
  const { state } = useSmartClean();
  return useMemo(() => new Set(state.subscription?.modules ?? []), [state.subscription]);
}

/** Whether the organisation's plan includes `key`.
 *
 * Fails OPEN before bootstrap lands: hiding a cleaner's Actions tab
 * during a cold start - or worse, mid-shift on a slow connection - is
 * worse than briefly showing a tab whose first request would 402. The
 * server is the authority either way.
 */
export function useHasModule(key: string): boolean {
  const modules = useModules();
  return modules.size === 0 || modules.has(key);
}

/** Whether the organisation supports a workflow method (qr_codes,
 * manual_attendance, manual_task_start, ...).
 *
 * Fails OPEN for the QR capabilities until bootstrap lands (or when the
 * backend predates capabilities), because QR is how the product worked
 * before this was configurable: hiding the Scan tab on a cold start would
 * strand a cleaner who needs it. The manual capabilities fail CLOSED -
 * they only exist when the server says so. The server enforces either way.
 */
export function useHasCapability(key: string): boolean {
  const subscription = useSubscription();
  const capabilities = subscription?.capabilities;
  if (!capabilities) return key.startsWith("qr_") || key === "location_based_tasks";
  return capabilities.includes(key);
}

/** The resolved workflow policy, or null before bootstrap lands (or from an
 * older backend). Callers treat null as the original QR-first rules. */
export function useWorkflowPolicy() {
  return useSubscription()?.policy ?? null;
}

/** The organisation's plan, or null before bootstrap lands. Used by the
 * banner that explains a suspended or past-due account. */
export function useSubscription() {
  return useSmartClean().state.subscription;
}
