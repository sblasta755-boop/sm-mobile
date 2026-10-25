// Remembering where a person was, so the app can put them back there after it locks or
// is closed. Pure rules only (what is worth remembering, when a memory is too old);
// storage lives in features/lastLocation.ts. Mirrored in the web app at
// smart-property-operations/src/src/lib/smartclean/lastLocation.ts - keep both in sync.

/** A saved place older than this is not restored: people expect a fresh start the next day. */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** Drafts (a half-written incident report) are kept a little longer than a screen position. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SavedLocation {
  userId: string;
  /** Path with its query string, e.g. "/tasks/t1/evidence?item=c2". */
  path: string;
  /** How far the screen was scrolled. */
  scrollY: number;
  savedAt: number;
}

// Screens that are part of getting signed in or set up, never somewhere to return to.
const NOT_REMEMBERED = [
  "/",
  "/index",
  "/login",
  "/lock",
  "/welcome",
  "/set-password",
  "/forgot-password",
  "/onboard-scan",
  "/onboard-waiting",
  "/staff-onboard-scan",
  "/staff-onboard-waiting",
];

export function isRememberable(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return !NOT_REMEMBERED.includes(path);
}

/** pathname plus its query. Dynamic route params (already part of the path) are left out. */
export function buildPath(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const pairs: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;
    if (pathname.split("/").includes(value)) continue; // a dynamic segment, e.g. the task id
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return pairs.length ? `${pathname}?${pairs.join("&")}` : pathname;
}

/** The saved place if it belongs to this person and is recent enough, otherwise null. */
export function freshLocation(
  saved: SavedLocation | null | undefined,
  userId: string | undefined,
  now: number,
): SavedLocation | null {
  if (!saved || !userId || saved.userId !== userId) return null;
  if (!isRememberable(saved.path)) return null;
  if (now - saved.savedAt > MAX_AGE_MS || saved.savedAt > now + 60_000)
    return null;
  return saved;
}

/** Whether a restored place is worth navigating to, given where the person already is. */
export function worthRestoring(
  saved: SavedLocation | null,
  home: string,
): saved is SavedLocation {
  return saved !== null && saved.path.split("?")[0] !== home;
}

export function isDraftFresh(savedAt: number, now: number): boolean {
  return now - savedAt <= DRAFT_MAX_AGE_MS && savedAt <= now + 60_000;
}
