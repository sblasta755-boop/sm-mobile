// When to clock someone out and back in as they leave and return to their site, and when to ask
// about overtime. Pure, so it can be tested without a device: the background task in
// features/geofenceClock.ts feeds it position fixes and carries out what it returns.

import { distanceM } from "./nearestBeacon";

/** Fixes less precise than this say nothing useful about being inside or outside. */
export const MAX_ACCURACY_M = 150;
/** Margin beyond the radius before a fix counts as outside, on top of the fix's own accuracy. */
export const OUTSIDE_MARGIN_M = 15;
/** How long someone must be back inside before they are clocked back in. */
export const RETURN_DWELL_MINUTES = 2;
/** A first fix outside that comes longer than this after the last fix inside proves nothing about when
 * the person left (the page or phone was asleep), so the last time they were provably inside is used. */
export const STALE_GAP_MINUTES = 10;
/** How long after shift end before overtime is asked about. */
export const OVERTIME_ASK_AFTER_MINUTES = 10;

export interface GeofenceConfig {
  userId: string;
  siteId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** Minutes outside before clocking out. */
  graceMinutes: number;
  overtimeCheck: boolean;
  /** "HH:MM" local, or null when the site has no working hours. */
  shiftEnd: string | null;
  /** "HH:MM" local start, so an end earlier than it is read as the next morning. Optional. */
  shiftStart?: string | null;
}

export interface MachineState {
  clockedIn: boolean;
  /** When the person left, as far as can be proved: the first fix outside, or the last fix inside when
   * nothing was seen for a while. That is the time written as the clock-out. */
  outsideSince: string | null;
  /** The latest fix seen inside the site while clocked in. */
  lastInsideAt?: string | null;
  /** When the person was first seen back inside after an automatic clock-out. */
  insideSince: string | null;
  /** Set while the person is out because of the geofence (not a manual clock-out), today. */
  autoOutAt: string | null;
  /** The local day overtime was last asked about, so it is asked once a day. */
  overtimeAskedFor: string | null;
  /** The local day this state belongs to. */
  day: string;
}

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  /** ISO time of the fix. */
  at: string;
}

export type GeofenceAction =
  | { type: "clock_out"; at: string; reason: "left_site"; latitude: number; longitude: number }
  | { type: "clock_in"; at: string; reason: "returned"; latitude: number; longitude: number }
  | { type: "ask_overtime"; day: string };

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface ShiftHours {
  shiftStart?: string | null;
  shiftEnd?: string | null;
}

/**
 * The day the tracking notes are filed under. Normally today's date; but in the morning part of a shift that began
 * yesterday (an overnight site, after midnight and before its end) it is yesterday's, so the notes (outside since,
 * overtime already asked) survive midnight instead of being thrown away mid-shift.
 */
export function stateDayKey(now: Date, shift?: ShiftHours): string {
  const start = hhmm(shift?.shiftStart);
  const end = hhmm(shift?.shiftEnd);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (start !== null && end !== null && end <= start && nowMinutes < end) {
    return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  }
  return dayKey(now);
}

export function freshState(now: Date, clockedIn: boolean, shift?: ShiftHours): MachineState {
  return { clockedIn, outsideSince: null, lastInsideAt: null, insideSince: null, autoOutAt: null, overtimeAskedFor: null, day: stateDayKey(now, shift) };
}

const hhmm = (value: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The moment the current shift ends, or null without working hours.
 *
 * With a start, an end at or before it means the site runs past midnight (19:00 to 04:00): in the evening the
 * shift ends tomorrow at 04:00, and after midnight (before that end) it ends today at 04:00. Without a start the
 * end is read on `now`'s own day, as before.
 */
export function shiftEndAt(now: Date, shiftEnd: string | null, shiftStart?: string | null): Date | null {
  const end = hhmm(shiftEnd);
  if (end === null) return null;
  const start = hhmm(shiftStart);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const overnight = start !== null && end <= start;
  // In the evening part of an overnight shift the end is on the next day.
  const dayOffset = overnight && nowMinutes >= start ? 1 : 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, Math.floor(end / 60), end % 60, 0, 0);
}

const minutesBetween = (fromIso: string, to: Date) => (to.getTime() - new Date(fromIso).getTime()) / 60_000;

/**
 * Brings the machine in line with what the app knows: a clock-in or clock-out made by hand (or
 * on another device) ends any automatic out-of-site tracking, and a new day starts clean.
 */
export function reconcile(state: MachineState, clockedIn: boolean, now: Date, shift?: ShiftHours): MachineState {
  let next = state;
  if (state.day !== stateDayKey(now, shift)) next = freshState(now, clockedIn, shift);
  if (next.clockedIn !== clockedIn) {
    next = { ...next, clockedIn, outsideSince: null, lastInsideAt: null, insideSince: null, autoOutAt: null };
  }
  return next;
}

/** Inside means within the radius; outside means clearly beyond it, allowing for GPS error. */
export function classify(fix: Fix, config: GeofenceConfig): "inside" | "outside" | "unsure" | "unusable" {
  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return "unusable";
  const distance = distanceM(fix, { latitude: config.latitude, longitude: config.longitude });
  if (distance <= config.radiusMeters) return "inside";
  const margin = OUTSIDE_MARGIN_M + Math.min(fix.accuracy ?? 0, 100);
  return distance > config.radiusMeters + margin ? "outside" : "unsure";
}

/** One position fix in; the new state and anything to do out. */
export function step(input: {
  state: MachineState;
  config: GeofenceConfig;
  fix: Fix;
  now: Date;
}): { state: MachineState; actions: GeofenceAction[] } {
  const { config, fix, now } = input;
  let state = reconcile(input.state, input.state.clockedIn, now, config);
  const actions: GeofenceAction[] = [];
  const where = classify(fix, config);
  if (where === "unusable") return { state, actions };

  if (state.clockedIn) {
    if (where === "inside") {
      state = { ...state, outsideSince: null, lastInsideAt: fix.at };
    } else if (where === "outside") {
      const gap = state.lastInsideAt ? minutesBetween(state.lastInsideAt, new Date(fix.at)) : 0;
      const since = state.outsideSince ?? (state.lastInsideAt && gap > STALE_GAP_MINUTES ? state.lastInsideAt : fix.at);
      state = { ...state, outsideSince: since };
      if (minutesBetween(since, now) >= config.graceMinutes) {
        actions.push({ type: "clock_out", at: since, reason: "left_site", latitude: fix.latitude, longitude: fix.longitude });
        state = { ...state, clockedIn: false, outsideSince: null, insideSince: null, autoOutAt: since };
      }
    }
    const end = shiftEndAt(now, config.shiftEnd, config.shiftStart);
    if (
      state.clockedIn &&
      where !== "outside" &&
      config.overtimeCheck &&
      end &&
      now.getTime() >= end.getTime() + OVERTIME_ASK_AFTER_MINUTES * 60_000 &&
      state.overtimeAskedFor !== state.day
    ) {
      actions.push({ type: "ask_overtime", day: state.day });
      state = { ...state, overtimeAskedFor: state.day };
    }
    return { state, actions };
  }

  // Out because the geofence clocked them out: back inside long enough means back on the clock,
  // unless the shift is already over.
  if (state.autoOutAt) {
    const end = shiftEndAt(now, config.shiftEnd, config.shiftStart);
    if (end && now.getTime() >= end.getTime()) {
      return { state: { ...state, autoOutAt: null, insideSince: null }, actions };
    }
    if (where === "inside") {
      const since = state.insideSince ?? fix.at;
      state = { ...state, insideSince: since };
      if (minutesBetween(since, now) >= RETURN_DWELL_MINUTES) {
        actions.push({ type: "clock_in", at: since, reason: "returned", latitude: fix.latitude, longitude: fix.longitude });
        state = { ...state, clockedIn: true, insideSince: null, outsideSince: null, autoOutAt: null };
      }
    } else if (where === "outside") {
      state = { ...state, insideSince: null };
    }
  }
  return { state, actions };
}

/** The tracking settings for this person's site, or null when automatic clocking is off there
 * (switched off, no location set on the site, or no policy yet). The site's own on/off beats
 * the organisation's default. */
export function buildConfig(input: {
  userId: string;
  site: {
    id: string;
    latitude?: number | null;
    longitude?: number | null;
    radiusMeters?: number | null;
    autoClock?: boolean | null;
    workingHours?: { start?: string; end: string } | null;
    effectiveWorkingHours?: { start?: string; end: string } | null;
  } | null | undefined;
  autoClock: { enabled: boolean; graceMinutes: number; overtimeCheck: boolean } | null | undefined;
}): GeofenceConfig | null {
  const { site, autoClock } = input;
  if (!site || !autoClock) return null;
  const on = typeof site.autoClock === "boolean" ? site.autoClock : autoClock.enabled;
  if (!on) return null;
  if (site.latitude == null || site.longitude == null || !site.radiusMeters) return null;
  return {
    userId: input.userId,
    siteId: site.id,
    latitude: site.latitude,
    longitude: site.longitude,
    radiusMeters: site.radiusMeters,
    graceMinutes: autoClock.graceMinutes,
    overtimeCheck: autoClock.overtimeCheck,
    // The hours counting any shift that runs on from them, so a Day shift into a Night shift is not cut at its own end.
    shiftEnd: (site.effectiveWorkingHours ?? site.workingHours)?.end ?? null,
    shiftStart: (site.effectiveWorkingHours ?? site.workingHours)?.start ?? null,
  };
}
