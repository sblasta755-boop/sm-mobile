import { useEffect, useState } from "react";
import { getStockAccess } from "@/api/client";
import type { StockAccess } from "@/types/smartclean";
import { useHasModule } from "./modules";
import { useSmartClean } from "./store";

const NONE: StockAccess = { issue: false, keep: false, manage: false };

/**
 * What this person may do with stock, from the server (GET /stock/access).
 *
 * Management roles always can; any other staff role only if the organisation
 * has switched it on in its stock policy - which is why this asks the server
 * rather than guessing from the role. Fails CLOSED: until the answer lands
 * (or when the plan has no Inventory module) nothing is offered, unlike the
 * module hooks, because a stock entry point nobody was given is worse than
 * one that appears a moment late. Presentation only - every stock endpoint
 * enforces the same rules.
 */
export function useStockAccess(): StockAccess {
  const { state } = useSmartClean();
  const hasStock = useHasModule("stock");
  const [access, setAccess] = useState<StockAccess>(NONE);
  const token = state.accessToken;

  useEffect(() => {
    if (!token || !hasStock) {
      setAccess(NONE);
      return;
    }
    let cancelled = false;
    getStockAccess(token)
      .then((result) => !cancelled && setAccess(result))
      .catch(() => !cancelled && setAccess(NONE));
    return () => {
      cancelled = true;
    };
  }, [token, hasStock]);

  return access;
}

/** Whether to show a Stock entry point at all. */
export function useCanOpenStock(): boolean {
  const access = useStockAccess();
  return access.issue || access.keep;
}
