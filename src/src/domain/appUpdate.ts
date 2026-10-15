// Whether this installed build should be offered (or required to take) a newer one.
// Pure so it can be tested without the device.

export interface AppRelease {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  notes: string;
  minSupportedCode: number;
}

export type UpdateState = "current" | "available" | "required";

/** "required" below the floor, "available" below the newest build, else "current".
 * Anything unknown (no installed code, no release) is "current": a missing answer
 * must never nag or lock anyone out. */
export function updateState(installed: number | null, release: AppRelease | null): UpdateState {
  if (!release || installed == null || !Number.isFinite(installed) || installed <= 0) return "current";
  if (release.minSupportedCode > 0 && installed < release.minSupportedCode) return "required";
  if (installed < release.versionCode) return "available";
  return "current";
}

export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Whether the one-time launch prompt may show: not for a build the person
 * postponed within the last day. A newer build than the postponed one prompts again. */
export function shouldPrompt(
  release: AppRelease,
  snooze: { code: number; until: number } | null,
  now: number,
): boolean {
  if (!snooze) return true;
  if (snooze.code !== release.versionCode) return true;
  return now >= snooze.until;
}

/** Narrows a server answer to a release, or null when it is not one. */
export function parseRelease(raw: unknown): AppRelease | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.versionCode !== "number" || typeof r.downloadUrl !== "string") return null;
  if (!/^https:\/\//.test(r.downloadUrl)) return null;
  return {
    versionCode: r.versionCode,
    versionName: typeof r.versionName === "string" ? r.versionName : String(r.versionCode),
    downloadUrl: r.downloadUrl,
    notes: typeof r.notes === "string" ? r.notes : "",
    minSupportedCode: typeof r.minSupportedCode === "number" ? r.minSupportedCode : 0,
  };
}
