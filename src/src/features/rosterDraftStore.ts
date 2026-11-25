import { useSyncExternalStore } from "react";
import { stageIn, type DraftEntry, type Drafts } from "@/domain/rosterDraft";

/**
 * The schedule changes marked on this phone and not sent yet, shared by every schedule screen (roster, list,
 * calendar, Book staff). They are kept in memory only, so they are gone if the app is closed, which is the same as
 * discarding them: nothing has been sent, so nobody was told.
 */
let drafts: Drafts = {};
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const getDrafts = () => drafts;

export function setDrafts(next: Drafts | ((prev: Drafts) => Drafts)) {
  drafts = typeof next === "function" ? next(drafts) : next;
  emit();
}

/** Marks (or, with null, clears) one person's day at one site. */
export function markDraft(siteId: string, userId: string, date: string, entry: DraftEntry | null) {
  setDrafts((all) => stageIn(all, siteId, userId, date, entry));
}

export function useDrafts(): Drafts {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => drafts,
    () => drafts,
  );
}
