import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { buildConfig, freshState, reconcile, step, type Fix, type GeofenceAction, type GeofenceConfig, type MachineState } from "@/domain/geofenceClock";
import { enqueueMutation } from "@/features/outbox";
import { ANDROID_CHANNEL_ID } from "@/features/pushNotifications";
import { useSmartClean } from "@/features/store";

// Clocks someone out when they leave their site and back in when they return, even with the app
// closed. The decisions are in domain/geofenceClock.ts; this file feeds it positions and carries
// out what it says. Whatever it does is written to the outbox (domain: "attendance.clock"), so it
// works with no signal and is sent, with the time it really happened, when the app next syncs.

const TASK_LOCATION = "soma-geofence-location";
const TASK_REGION = "soma-geofence-region";
const STORAGE_KEY = "soma.geofenceClock.v1";
const PROMPT_KEY = "soma.overtimePrompt.v1";
/** While the app is open and has no background permission, it still checks this often. */
const FOREGROUND_CHECK_MS = 60_000;

interface Snapshot {
  config: GeofenceConfig;
  state: MachineState;
}

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: Snapshot | null) {
  try {
    if (snapshot) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* the next fix will write it again */
  }
}

// One fix is handled at a time: the location task, the region task and the foreground check can
// all fire together, and each reads the state the last one left.
let chain: Promise<unknown> = Promise.resolve();

async function notify(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { category: "attendance" }, ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}) },
      trigger: null,
    });
  } catch {
    /* a missing notification must never stop the clocking */
  }
}

const clockText = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

async function carryOut(config: GeofenceConfig, action: GeofenceAction) {
  if (action.type === "ask_overtime") {
    try {
      await AsyncStorage.setItem(PROMPT_KEY, JSON.stringify({ day: action.day, askedAt: new Date().toISOString() }));
    } catch {
      /* the notification still goes */
    }
    promptListeners.forEach((l) => l());
    await notify("Working overtime?", "Your shift has ended. Open the app to say whether you are working overtime.");
    return;
  }
  await enqueueMutation({
    userId: config.userId,
    kind: "attendance.clock",
    payload: {
      direction: action.type === "clock_out" ? "out" : "in",
      siteId: config.siteId,
      method: "geofence_auto",
      reason: action.reason,
      latitude: action.latitude,
      longitude: action.longitude,
      at: action.at,
    },
  });
  if (action.type === "clock_out") {
    await notify("Clocked out", `You left the site at ${clockText(action.at)}. You will be clocked back in when you return.`);
  } else {
    await notify("Clocked back in", `You were back on site at ${clockText(action.at)}.`);
  }
}

/** Handles one position fix. Safe to call from the background task. */
export function processFix(fix: Fix, now: Date = new Date()): Promise<void> {
  chain = chain.then(async () => {
    const snapshot = await readSnapshot();
    if (!snapshot) return;
    const result = step({ state: snapshot.state, config: snapshot.config, fix, now });
    await writeSnapshot({ config: snapshot.config, state: result.state });
    for (const action of result.actions) await carryOut(snapshot.config, action);
  });
  return chain as Promise<void>;
}

TaskManager.defineTask(TASK_LOCATION, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  for (const loc of locations ?? []) {
    await processFix({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      at: new Date(loc.timestamp).toISOString(),
    });
  }
});

// Crossing the fence wakes the app promptly instead of waiting for the next interval.
TaskManager.defineTask(TASK_REGION, async ({ error }) => {
  if (error) return;
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await processFix({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      at: new Date(loc.timestamp).toISOString(),
    });
  } catch {
    /* the interval updates will pick it up */
  }
});

// ---- the "working overtime?" prompt ----

const promptListeners = new Set<() => void>();

export async function pendingOvertimePrompt(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_KEY);
    return raw ? (JSON.parse(raw) as { day: string }).day : null;
  } catch {
    return null;
  }
}

export async function clearOvertimePrompt() {
  try {
    await AsyncStorage.removeItem(PROMPT_KEY);
  } catch {
    /* ignore */
  }
  promptListeners.forEach((l) => l());
}

export function subscribeOvertimePrompt(listener: () => void) {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}

// ---- permissions ----

export type TrackingPermission = "unknown" | "always" | "foreground" | "denied";

export async function trackingPermission(): Promise<TrackingPermission> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return fg.canAskAgain === false ? "denied" : "unknown";
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.granted ? "always" : "foreground";
  } catch {
    return "unknown";
  }
}

/** Asks for location "all the time". Must be called from a button press, after explaining why. */
export async function requestAlwaysPermission(): Promise<TrackingPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? "always" : "foreground";
}

async function stopTracking() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK_LOCATION)) await Location.stopLocationUpdatesAsync(TASK_LOCATION);
    if (await TaskManager.isTaskRegisteredAsync(TASK_REGION)) await Location.stopGeofencingAsync(TASK_REGION);
  } catch {
    /* nothing running */
  }
}

async function startTracking(config: GeofenceConfig) {
  try {
    await Location.startLocationUpdatesAsync(TASK_LOCATION, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 2 * 60_000,
      distanceInterval: 40,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "Šoma360 is tracking your shift",
        notificationBody: "Your hours are counted while you are on site.",
      },
    });
    await Location.startGeofencingAsync(TASK_REGION, [
      { identifier: config.siteId, latitude: config.latitude, longitude: config.longitude, radius: Math.max(100, config.radiusMeters), notifyOnEnter: true, notifyOnExit: true },
    ]);
  } catch {
    /* without background permission the foreground check below still runs */
  }
}

/** For a screen to say whether automatic clocking applies to this person and whether the phone lets it work. */
export function useAutoClockStatus(): { enabled: boolean; permission: TrackingPermission } {
  const { state, currentUser } = useSmartClean();
  const [permission, setPermission] = useState<TrackingPermission>("unknown");
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const enabled = Boolean(
    currentUser && buildConfig({ userId: currentUser.id, site, autoClock: state.subscription?.policy?.attendance?.autoClock }),
  );
  useEffect(() => {
    if (!enabled) return;
    void trackingPermission().then(setPermission);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void trackingPermission().then(setPermission);
    });
    return () => sub.remove();
  }, [enabled]);
  return { enabled, permission };
}

/**
 * Mount once at the root. Works out whether this person's site uses automatic clocking, hands the
 * background task what it needs, and starts or stops tracking. Also checks every minute while the
 * app is open, so it still works if background location was not allowed.
 */
export function useGeofenceClock(): { permission: TrackingPermission; enabled: boolean } {
  const { state, currentUser } = useSmartClean();
  const [permission, setPermission] = useState<TrackingPermission>("unknown");
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const policy = state.subscription?.policy?.attendance?.autoClock;
  const config = currentUser ? buildConfig({ userId: currentUser.id, site, autoClock: policy }) : null;
  const clockedIn = Boolean(currentUser && state.attendance[currentUser.id]?.clockedInAt);
  const configKey = config ? JSON.stringify(config) : "";
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = configRef.current;
      if (!cfg) {
        await writeSnapshot(null);
        await stopTracking();
        return;
      }
      const now = new Date();
      const existing = await readSnapshot();
      const base = existing && existing.config.userId === cfg.userId ? existing.state : freshState(now, clockedIn);
      const next = reconcile(base, clockedIn, now);
      await writeSnapshot({ config: cfg, state: next });
      if (cancelled) return;
      const perm = await trackingPermission();
      setPermission(perm);
      // Track while on the clock, and while out because the geofence clocked them out.
      if (perm === "always" && (next.clockedIn || next.autoOutAt)) await startTracking(cfg);
      else await stopTracking();
    })();
    return () => {
      cancelled = true;
    };
  }, [configKey, clockedIn]);

  // Foreground fallback.
  useEffect(() => {
    if (!config) return;
    const check = async () => {
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (!fg.granted) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await processFix({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          at: new Date(loc.timestamp).toISOString(),
        });
      } catch {
        /* no fix this time */
      }
    };
    void check();
    const timer = setInterval(check, FOREGROUND_CHECK_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void trackingPermission().then(setPermission);
        void check();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [configKey]);

  return { permission, enabled: Boolean(config) };
}
