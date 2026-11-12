import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { ApiError, ensureFreshAccessToken, hasSessionHandlers, refreshSession, sendPresence } from "@/api/client";
import { buildConfig } from "@/domain/geofenceClock";
import {
  BATCH_SIZE,
  enqueue,
  heartbeatIntervalMs,
  isPermanentFailure,
  mapPermission,
  shouldWarn,
  tooSoon,
  type PresencePermission,
  type QueuedSample,
} from "@/domain/presence";
import { ANDROID_CHANNEL_ID } from "@/features/pushNotifications";
import { useSmartClean } from "@/features/store";
import { SecureSessionService } from "@/storage/SecureSessionService";

// Proof of presence. While someone is clocked in, the phone reports where it is every few minutes so the
// server can tell a person at work from a phone that has gone quiet (location switched off, permission
// taken away, app killed). If no on-site heartbeat arrives for the organisation's gap, the server stops
// counting the time from the last confirmed moment and flags the day for a manager.
//
// This is separate from automatic clocking (features/geofenceClock.ts) and runs for everyone who is
// clocked in, whether or not their site clocks people out by location. Where automatic clocking already
// tracks in the background it feeds this too (reportPresenceFix), so there is only one tracker running.

const TASK_PRESENCE = "soma-presence-location";
const ACTIVE_KEY = "soma.presence.active.v1";
const QUEUE_KEY = "soma.presence.queue.v1";

let lastQueuedAt: number | null = null;
let lastWarnedAt: number | null = null;
// One read-modify-write of the queue at a time: the background task and the foreground timer can fire together.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
};

async function isActive(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ACTIVE_KEY)) === "1";
  } catch {
    return false;
  }
}

async function setActive(active: boolean) {
  try {
    if (active) await AsyncStorage.setItem(ACTIVE_KEY, "1");
    else await AsyncStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* the next change writes it again */
  }
}

async function readQueue(): Promise<QueuedSample[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSample[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedSample[]) {
  try {
    if (queue.length) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* heartbeats are best effort; the next one tries again */
  }
}

/** What the phone says about its own location access, right now. */
export async function currentPermission(): Promise<PresencePermission> {
  try {
    const [servicesEnabled, fg] = await Promise.all([Location.hasServicesEnabledAsync(), Location.getForegroundPermissionsAsync()]);
    const bg = fg.granted ? await Location.getBackgroundPermissionsAsync() : null;
    return mapPermission({
      servicesEnabled,
      foregroundGranted: fg.granted,
      foregroundCanAskAgain: fg.canAskAgain,
      backgroundGranted: Boolean(bg?.granted),
    });
  } catch {
    return "unknown";
  }
}

// ---- getting a token with no app around ----

let headlessRefresh: Promise<string | null> | null = null;

/**
 * An access token good for a request. In the running app the session's own renewal is used. In a background
 * task started with the app closed nothing owns the session, so the stored one is renewed here and saved
 * back; the app reads it from the same place at its next launch. Refresh tokens are one-time-use, so this
 * must never race the app's own renewal: it does not, because a headless task and the app never share a runtime.
 */
async function usableToken(): Promise<string | null> {
  const stored = await SecureSessionService.get();
  if (!stored) return null;
  if (Date.parse(stored.expiresAt) - Date.now() > 60_000) return stored.accessToken;
  if (hasSessionHandlers()) return ensureFreshAccessToken(stored.accessToken);
  headlessRefresh ??= (async () => {
    try {
      const fresh = await refreshSession(stored.refreshToken);
      await SecureSessionService.set(fresh);
      return fresh.accessToken;
    } catch {
      return null;
    } finally {
      headlessRefresh = null;
    }
  })();
  return headlessRefresh;
}

/** Sends what is queued. Anything that could not be sent stays queued for the next beat. */
export function flushPresence(): Promise<void> {
  return serial(async () => {
    const queue = await readQueue();
    if (queue.length === 0) return;
    const token = await usableToken();
    if (!token) return;
    const batch = queue.slice(0, BATCH_SIZE);
    try {
      await sendPresence(token, batch);
    } catch (error) {
      // A sample the server refuses would block the queue forever; no signal or a busy server just waits.
      if (!(error instanceof ApiError) || !isPermanentFailure(error.status)) return;
    }
    // Others may have been queued while this was in flight: drop only the ones that went.
    const latest = await readQueue();
    await writeQueue(latest.slice(batch.length));
  });
}

// ---- recording a heartbeat ----

interface Reading {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  mocked?: boolean;
  at?: number;
}

async function record(reading: Reading, source: QueuedSample["source"], permission: PresencePermission) {
  const at = reading.at ?? Date.now();
  await serial(async () => {
    if (tooSoon(lastQueuedAt, at)) return;
    lastQueuedAt = at;
    const sample: QueuedSample = {
      source,
      permission,
      capturedAt: new Date(at).toISOString(),
      ...(reading.latitude !== undefined && reading.longitude !== undefined ? { latitude: reading.latitude, longitude: reading.longitude } : {}),
      ...(typeof reading.accuracy === "number" ? { accuracy: reading.accuracy } : {}),
      ...(typeof reading.mocked === "boolean" ? { mocked: reading.mocked } : {}),
    };
    await writeQueue(enqueue(await readQueue(), sample));
  });
  await flushPresence();
}

/** Called with every background fix (here and from automatic clocking). Does nothing when nobody is clocked in. */
export async function reportPresenceFix(loc: Location.LocationObject, source: QueuedSample["source"] = "native_bg") {
  if (!(await isActive())) return;
  await record(
    { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy, mocked: loc.mocked, at: loc.timestamp },
    source,
    await currentPermission(),
  );
}

TaskManager.defineTask(TASK_PRESENCE, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  for (const loc of locations ?? []) await reportPresenceFix(loc, "native_bg");
});

async function warnLocationOff() {
  const now = Date.now();
  if (!shouldWarn(lastWarnedAt, now)) return;
  lastWarnedAt = now;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Turn your location back on",
        body: "Your location is off, so your hours are not being counted. Switch it on to keep your time.",
        data: { category: "attendance" },
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    /* a missing notification must never stop the heartbeat */
  }
}

/** One heartbeat from the app while it is open. Also what notices location being switched off. */
async function foregroundBeat() {
  if (!(await isActive())) return;
  const permission = await currentPermission();
  if (permission === "off" || permission === "denied") {
    // Say so, with no position: the server flags the day and does not count this as being on site.
    await record({}, "native_fg", permission);
    await warnLocationOff();
    return;
  }
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await record(
      { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy, mocked: loc.mocked, at: loc.timestamp },
      "native_fg",
      permission,
    );
  } catch {
    /* no fix this time; the next beat tries again */
  }
}

async function stopBackground() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK_PRESENCE)) await Location.stopLocationUpdatesAsync(TASK_PRESENCE);
  } catch {
    /* nothing running */
  }
}

async function startBackground(intervalMs: number) {
  try {
    await Location.startLocationUpdatesAsync(TASK_PRESENCE, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: intervalMs,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Šoma360 is counting your shift",
        notificationBody: "Your hours are counted while your location is on.",
      },
    });
  } catch {
    /* without background permission the open app still reports */
  }
}

/**
 * Mount once at the root. While the person is clocked in it keeps the heartbeat going: a background tracker
 * when the phone allows location all the time (and automatic clocking is not already running one), plus a
 * check every few minutes while the app is open. It is also what tells the person when location is off.
 */
export function usePresenceReporting() {
  const { state, currentUser } = useSmartClean();
  const policy = state.subscription?.policy?.attendance?.presence;
  const enabled = policy?.enabled ?? true;
  const gapMinutes = policy?.gapMinutes ?? 75;
  const clockedIn = Boolean(currentUser && state.attendance[currentUser.id]?.clockedInAt);
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  // Automatic clocking already runs a background tracker and feeds reportPresenceFix itself.
  const autoClockTracks = Boolean(
    currentUser && buildConfig({ userId: currentUser.id, site, autoClock: state.subscription?.policy?.attendance?.autoClock }),
  );
  const active = Boolean(currentUser && enabled && clockedIn);
  const intervalMs = heartbeatIntervalMs(gapMinutes);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await setActive(active);
      if (!active) {
        lastQueuedAt = null;
        await stopBackground();
        return;
      }
      if (autoClockTracks) {
        await stopBackground();
        return;
      }
      const permission = await currentPermission();
      if (cancelled) return;
      if (permission === "always") await startBackground(intervalMs);
      else await stopBackground();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, autoClockTracks, intervalMs]);

  useEffect(() => {
    if (!active) return;
    void foregroundBeat();
    const timer = setInterval(() => void foregroundBeat(), intervalMs);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void foregroundBeat();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [active, intervalMs]);
}
