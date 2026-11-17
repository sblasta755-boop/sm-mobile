import type { StockAccess, StockGrantKey } from "@/types/smartclean";

export const NO_STOCK_TABS: Record<StockGrantKey, boolean> = {
  overview: false,
  restock: false,
  issue: false,
  receive: false,
  count: false,
  loans: false,
  layout: false,
  history: false,
  settings: false,
  countApprove: false,
  issueApprove: false,
};

/** What the server said, with every grant filled in (an older server sends only the three flags). */
export function normaliseStockAccess(raw: Partial<StockAccess> | null | undefined): StockAccess {
  return {
    ...raw,
    tabs: { ...NO_STOCK_TABS, ...(raw?.tabs ?? {}) },
    issue: Boolean(raw?.issue),
    keep: Boolean(raw?.keep),
    manage: Boolean(raw?.manage),
  };
}

/** Stock exists for this person if they were given any tab. */
export const canOpenStock = (access: StockAccess) => Object.values(access.tabs).some(Boolean);

const MANAGEMENT_ROLES = ["org_admin", "operations_manager", "site_manager", "supervisor"];

/** Handing count lines to helpers and changing a count's list: a supervisor or above who also has Count.
 * The server checks the same. */
export const canManageCounts = (access: StockAccess, role: string | null | undefined) =>
  access.tabs.count && MANAGEMENT_ROLES.includes(role ?? "");

/** A count line handed to someone is theirs to count; the rest are open to anyone who counts. */
export const canCountLine = (
  line: { assigneeId?: string | null },
  userId: string,
  manages: boolean,
) => manages || !line.assigneeId || line.assigneeId === userId;
