import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ApiError, putMyHomeLayout, resetMyHomeLayout } from "@/api/client";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { ingestServerLayouts, layoutListeners, readCached, writeCached } from "@/features/homeLayoutCache";
import {
  canCustomiseHome,
  mergeStored,
  resolveActiveHome,
  resolveCustom,
  resolveLayout,
  type Home,
  type ResolvedCard,
  type ResolvedCustom,
  type StorePatch,
  type StoredLayout,
} from "@/domain/homeLayout";

export interface HomeLayoutApi {
  /** Today's screen, arranged: cards to draw from this phone's copy (today's order when nothing valid is saved). */
  cards: ResolvedCard[];
  /** The secondary home: its look and cards (the default Custom home when none is saved). */
  custom: ResolvedCustom;
  /** Which home the person opens on. */
  active: Home;
  /** Whether this person has a customisable home at all. */
  canCustomise: boolean;
  /** An administrator set it; the person cannot change it. */
  locked: boolean;
  /** Saved on this phone, waiting to reach the server. */
  pending: boolean;
  /** Save the arranged Classic home (keeps the Custom home and which one is active). */
  save: (cards: ResolvedCard[]) => Promise<void>;
  /** Save the Custom home's look and cards. */
  saveCustom: (custom: ResolvedCustom) => Promise<void>;
  /** Apply several changes at once, for example a template: one save, one request. */
  apply: (patch: StorePatch) => Promise<void>;
  /** Choose which home to open on. */
  setActive: (home: Home) => Promise<void>;
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

  /** Apply a change on top of what is saved: on this phone first, then to the server. */
  const commit = useCallback(
    async (patch: StorePatch) => {
      if (!canCustomise) return;
      const before = readCached(userId);
      if (before?.locked) {
        appAlert("Home screen locked", LOCKED);
        return;
      }
      const stored = mergeStored(before?.layout, patch);
      // Nothing left that differs from today's screen: forget the saved layout rather than store a copy of the default.
      if (!stored) {
        writeCached(userId, null);
        try {
          if (token) await resetMyHomeLayout(token);
        } catch (error) {
          if (error instanceof ApiError && error.status && error.status < 500) {
            writeCached(userId, before);
            appAlert("Could not save your home screen", error.message || "Try again.");
          }
        }
        return;
      }
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
    [canCustomise, userId, token, send],
  );
  const save = useCallback((cards: ResolvedCard[]) => commit({ classic: cards }), [commit]);
  const saveCustom = useCallback((custom: ResolvedCustom) => commit({ custom }), [commit]);
  const setActive = useCallback((home: Home) => commit({ active: home }), [commit]);

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

  const stored = canCustomise ? entry?.layout : null;
  return {
    cards: resolveLayout(stored),
    custom: resolveCustom(stored),
    active: resolveActiveHome(stored),
    canCustomise,
    locked: !!entry?.locked,
    pending,
    save,
    saveCustom,
    apply: commit,
    setActive,
    reset,
  };
}
