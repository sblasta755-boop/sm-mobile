import * as SecureStore from "expo-secure-store";
import { parseCached, reconcile, type CachedLayout, type ServerLayout } from "@/domain/homeLayout";

/**
 * This phone's own copy of a person's home layout, so the home draws from the phone and never waits on the network.
 * The server's copy arrives inside /bootstrap, which the app loads anyway, and replaces this one only when its `rev`
 * is newer (domain/homeLayout.ts `reconcile`). A person's edit is saved here first, then sent in the background.
 *
 * SecureStore is what the app already uses for small preferences, and its getItem is synchronous, so the first frame
 * already has the layout. No store import here, so the session store can clear it on sign-out without a cycle; the
 * hook is in useHomeLayout.ts.
 */

// SecureStore keys may only hold letters, digits, ".", "-" and "_".
const keyOf = (userId: string) => `home.layout.${userId.replace(/[^A-Za-z0-9._-]/g, "_")}.phone`;

const memory = new Map<string, CachedLayout | null>();
export const layoutListeners = new Set<() => void>();
const emit = () => layoutListeners.forEach((l) => l());

/** The saved copy, or null. Anything unreadable counts as nothing saved, which is today's screen. */
export function readCached(userId: string): CachedLayout | null {
  const key = keyOf(userId);
  if (memory.has(key)) return memory.get(key) ?? null;
  let entry: CachedLayout | null = null;
  try {
    entry = parseCached(SecureStore.getItem(key));
  } catch {
    entry = null;
  }
  memory.set(key, entry);
  return entry;
}

export function writeCached(userId: string, entry: CachedLayout | null) {
  const key = keyOf(userId);
  memory.set(key, entry);
  if (entry) SecureStore.setItemAsync(key, JSON.stringify(entry)).catch(() => undefined);
  else SecureStore.deleteItemAsync(key).catch(() => undefined);
  emit();
}

/** Sign-out: the next person on this phone must not inherit this one's home. */
export function clearHomeLayout(userId: string | null | undefined) {
  if (userId) {
    memory.delete(keyOf(userId));
    SecureStore.deleteItemAsync(keyOf(userId)).catch(() => undefined);
  }
  emit();
}

/** Fold the server's copy (from /bootstrap) into this phone's. */
export function ingestServerLayouts(userId: string, server: { phone?: ServerLayout | null } | null | undefined) {
  const result = reconcile(readCached(userId), server);
  if (result.action === "set") writeCached(userId, result.entry);
  else if (result.action === "clear") writeCached(userId, null);
}
