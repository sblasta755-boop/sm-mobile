// The pure rules for location heartbeats (features/presence.ts carries them out). While someone is
// clocked in the phone reports where it is every few minutes, so the server can tell a person who is
// working from one whose phone has gone quiet.

export type PresencePermission = "always" | "foreground" | "denied" | "off" | "unknown";

export interface QueuedSample {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  source: "native_bg" | "native_fg";
  permission: PresencePermission;
  mocked?: boolean;
  capturedAt: string;
}

/** Samples kept while there is no signal. Beyond this the oldest go: the server ignores samples older than 12 hours anyway. */
export const MAX_QUEUED = 100;
/** The most samples the server takes in one request. */
export const BATCH_SIZE = 100;
/** Two samples closer together than this add nothing. */
export const MIN_SPACING_MS = 45_000;
/** How long between reminders to switch location back on. */
export const WARN_EVERY_MS = 30 * 60_000;

/** Several heartbeats must fit inside the organisation's gap, so one missed fix never costs a person their time. */
export function heartbeatIntervalMs(gapMinutes: number): number {
  const gap = Number.isFinite(gapMinutes) && gapMinutes > 0 ? gapMinutes : 75;
  return Math.max(60_000, Math.min(5 * 60_000, Math.floor((gap * 60_000) / 4)));
}

export function mapPermission(input: {
  foregroundGranted: boolean;
  foregroundCanAskAgain: boolean;
  backgroundGranted: boolean;
  servicesEnabled: boolean;
}): PresencePermission {
  if (!input.servicesEnabled) return "off";
  if (!input.foregroundGranted) return input.foregroundCanAskAgain ? "unknown" : "denied";
  return input.backgroundGranted ? "always" : "foreground";
}

/** Adds a sample, keeping the newest MAX_QUEUED, oldest first. */
export function enqueue(queue: QueuedSample[], sample: QueuedSample): QueuedSample[] {
  const next = [...queue, sample];
  return next.length > MAX_QUEUED ? next.slice(next.length - MAX_QUEUED) : next;
}

/** True when a sample taken at `at` is too soon after the last one to be worth sending. */
export function tooSoon(lastAt: number | null, at: number): boolean {
  return lastAt !== null && at - lastAt < MIN_SPACING_MS && at >= lastAt;
}

export function shouldWarn(lastWarnedAt: number | null, now: number): boolean {
  return lastWarnedAt === null || now - lastWarnedAt >= WARN_EVERY_MS;
}

/** A refusal that retrying will never fix (a bad sample), as opposed to no signal or a busy server. */
export function isPermanentFailure(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}
