import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { getHomeSummary } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { hydrateSummary, readSummary, summaryListeners, writeSummary } from "@/features/homeSummaryCache";
import {
  applyAnswer,
  blockStatus,
  blocksNeeded,
  isOperationsCard,
  isStale,
  type BlockName,
  type BlockStatus,
  type SummaryState,
} from "@/domain/homeSummary";

const REFRESH_MS = 60_000;

export interface HomeSummaryApi {
  state: SummaryState;
  /** Whether a block is still loading, was left out by the server (hide the card), or is ready. */
  status: (block: BlockName) => BlockStatus;
  /** The answer is old (offline, or the last refresh failed): show a muted "updated ... ago". */
  stale: boolean;
}

/**
 * The summary for the operations cards among the visible card ids. Draws from the phone's last answer straight away,
 * then refreshes: when the home comes into view, every minute while it is, and when the app returns to the front. It
 * skips the network when offline and keeps what is there if a refresh fails. With no blocks to ask for, nothing is
 * fetched.
 */
export function useHomeSummary(visibleIds: string[]): HomeSummaryApi {
  const { state: app, currentUser } = useSmartClean();
  const userId = currentUser?.id ?? "";
  const token = app.accessToken;
  const offline = app.connectivity === "offline";
  const wanted = blocksNeeded(visibleIds.filter(isOperationsCard)).sort().join(",");

  const state = useSyncExternalStore(
    (l) => {
      summaryListeners.add(l);
      return () => {
        summaryListeners.delete(l);
      };
    },
    () => readSummary(userId),
    () => readSummary(userId),
  );

  useEffect(() => {
    if (userId) void hydrateSummary(userId);
  }, [userId]);

  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (!userId || !token || !wanted || offline || inFlight.current) return;
    inFlight.current = true;
    const asked = wanted.split(",") as BlockName[];
    try {
      // The saved copy must be read before it is added to, or a slow first read would overwrite it with less.
      await hydrateSummary(userId);
      const answer = await getHomeSummary(token, asked);
      writeSummary(userId, applyAnswer(readSummary(userId), asked, answer, Date.now()));
    } catch {
      // keep the last answer; it shows as stale once it is old enough
    } finally {
      inFlight.current = false;
    }
  }, [userId, token, wanted, offline]);

  // Only while the home is the screen in front, and when the app comes back to the front.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), REFRESH_MS);
      const sub = AppState.addEventListener("change", (next) => {
        if (next === "active") void refresh();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [refresh]),
  );

  return { state, status: (block) => blockStatus(state, block), stale: isStale(state, Date.now()) };
}
