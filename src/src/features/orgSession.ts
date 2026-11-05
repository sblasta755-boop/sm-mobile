import { impersonateOrganisation, refreshImpersonation } from "@/api/client";

/**
 * Acting inside one organisation as its administrator, for the platform operator. The backend's roster is read-only
 * on purpose: changing a customer's people goes through the same short-lived token the web console's "Enter" uses,
 * so the organisation's audit trail records the change under the operator's own name. The token lasts 15 minutes and
 * is refreshed before it runs out; it is only ever asked for when the operator actually changes something.
 */
const REFRESH_AFTER_MS = 10 * 60 * 1000;
const sessions = new Map<string, { value: string; at: number }>();

export async function orgToken(operatorToken: string, tenantId: string): Promise<string> {
  const current = sessions.get(tenantId);
  if (current && Date.now() - current.at < REFRESH_AFTER_MS) return current.value;
  if (current) {
    try {
      const fresh = await refreshImpersonation(current.value);
      sessions.set(tenantId, { value: fresh.accessToken, at: Date.now() });
      return fresh.accessToken;
    } catch {
      sessions.delete(tenantId);
    }
  }
  const session = await impersonateOrganisation(operatorToken, tenantId);
  sessions.set(tenantId, { value: session.accessToken, at: Date.now() });
  return session.accessToken;
}
