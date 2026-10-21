import { useCallback, useState } from "react";
import { drainQueue } from "@/features/evidenceUploader";
import { useSmartClean } from "@/features/store";

// Shortest time the spinner shows, so a fast refresh still reads as one.
const MIN_SPIN_MS = 500;

/**
 * Pull down to refresh: sends anything waiting on the phone, then fetches the
 * latest tasks, attendance and notifications from the server. Offline there is
 * nothing to fetch, so it just ends (everything on screen is already what the
 * phone has).
 *
 * `refreshing` and `onRefresh` go straight onto a RefreshControl.
 */
export function usePullToRefresh() {
  const { state, refreshBackendData } = useSmartClean();
  const [refreshing, setRefreshing] = useState(false);
  const offline = state.connectivity === "offline";

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      if (!offline) {
        // Changes made on the phone first, so the fetch does not overwrite them.
        await drainQueue().catch(() => {});
        await refreshBackendData();
      }
    } finally {
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      setRefreshing(false);
    }
  }, [offline, refreshBackendData]);

  return { refreshing, onRefresh };
}
