import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ApiError, putMyHomeLayout, resetMyHomeLayout } from "@/api/client";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { ingestServerLayouts, layoutListeners, readCached, writeCached } from "@/features/homeLayoutCache";
import { canCustomiseHome, resolveLayout, toStored, type ResolvedCard, type StoredLayout } from "@/domain/homeLayout";

export interface HomeLayoutApi {
  /** Cards to draw, from this phone's copy: today's screen when nothing valid is saved. */
  cards: ResolvedCard[];
  /** Whether this person has a customisable home at all. */
  canCustomise: boolean;
  /** An administrator set it; the person cannot change it. */
  locked: boolean;
  /** Saved on this phone, waiting to reach the server. */
  pending: boolean;
  save: (cards: ResolvedCard[]) => Promise<void>;
  reset: () => Promise<void>;
}

const LOCKED = "Your administrator set this home screen, so it cannot be changed.";

/** The manager's home layout. See features/homeLayoutCache.ts for how the local copy and the server's stay in step. */
export function useHomeLayout(): HomeLayoutApi {
  const { state, currentUser } = useSmartClean();
  const userId = currentUser?.id ?? "";
  const token = state.accessToken;
  const canCustomise = canCustomiseHome(currentUser?.role) && !!userId;

  const entry = useSyncExternalStore(
    (l) => {
      layoutListeners.add(l);
      return () => {
        layoutListeners.delete(l);
      };
    },
    () => (canCustomise ? readCached(userId) : null),
    () => null,
  );

  // The server's copy rides in /bootstrap; take it when it is newer than ours.
  useEffect(() => {
    if (canCustomise) ingestServerLayouts(userId, state.homeLayout);
  }, [canCustomise, userId, state.homeLayout]);

  const send = useCallback(
    async (stored: StoredLayout) => {
      if (!token) return;
      const { homeLayout } = await putMyHomeLayout(token, stored);
      writeCached(userId, {
        layout: homeLayout.layout as StoredLayout,
        rev: homeLayout.rev,
        locked: homeLayout.locked,
        pending: false,
      });
    },
    [token, userId],
  );

  // An edit made offline goes up when there is a connection again (and on the next visit).
  const pending = !!entry?.pending;
  useEffect(() => {
    if (!canCustomise || !pending || !token || state.connectivity === "offline") return;
    const current = readCached(userId);
    if (current?.pending) void send(current.layout).catch(() => undefined);
  }, [canCustomise, pending, token, userId, state.connectivity, send]);

  const save = useCallback(
    async (cards: ResolvedCard[]) => {
      if (!canCustomise) return;
      const before = readCached(userId);
      if (before?.locked) {
        appAlert("Home screen locked", LOCKED);
        return;
      }
      const stored = toStored(cards);
      // On this phone first, so the change is instant.
      writeCached(userId, { layout: stored, rev: before?.rev ?? 0, locked: false, pending: true });
      try {
        await send(stored);
      } catch (error) {
        if (error instanceof ApiError && error.status && error.status < 500) {
          // Refused (for example, locked in the meantime): go back to what the server has.
          writeCached(userId, before);
          appAlert("Could not save your home screen", error.message || "Try again.");
        }
        // Otherwise it stays saved here, marked pending, and goes up when the connection is back.
      }
    },
    [canCustomise, userId, send],
  );

  const reset = useCallback(async () => {
    if (!canCustomise) return;
    const before = readCached(userId);
    if (before?.locked) {
      appAlert("Home screen locked", LOCKED);
      return;
    }
    writeCached(userId, null);
    try {
      if (token) await resetMyHomeLayout(token);
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) {
        writeCached(userId, before);
        appAlert("Could not reset your home screen", error.message || "Try again.");
      }
    }
  }, [canCustomise, userId, token]);

  return {
    cards: resolveLayout(canCustomise ? entry?.layout : null),
    canCustomise,
    locked: !!entry?.locked,
    pending,
    save,
    reset,
  };
}
