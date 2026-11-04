/**
 * The last few choices someone made in a picker (roles, sites, organisations), newest first, so the form can offer
 * them as one-tap shortcuts. Pure; persisted by features/recentPicks.ts.
 */

export const RECENT_LIMIT = 3;

/** `key` moved to the front, without duplicates, capped at `limit`. */
export function pushRecent(list: readonly string[], key: string, limit = RECENT_LIMIT): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, limit);
}

/** The remembered keys that still exist, in remembered order (a role or site may have been removed since). */
export function liveRecent<T>(keys: readonly string[], items: readonly T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  return keys.map((k) => byKey.get(k)).filter((item): item is T => item !== undefined);
}

/** Parses what was stored, tolerating anything that isn't a list of strings. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}
