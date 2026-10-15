import { useEffect, useSyncExternalStore } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { API_BASE_URL } from "@/api/client";
import { appAlert } from "@/components/Dialog";
import {
  parseRelease,
  shouldPrompt,
  SNOOZE_MS,
  updateState,
  type AppRelease,
  type UpdateState,
} from "@/domain/appUpdate";

// Which build of the app is current, and whether this install should update.
// Offline-safe: the last answer is cached, a failed check changes nothing.
const RELEASE_KEY = "soma.appUpdate.release.v1";
const SNOOZE_KEY = "soma.appUpdate.snooze.v1";
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

/** The installed build's version code (the Android versionCode), or null when unknown. */
export const installedBuild: number | null =
  Platform.OS === "android" && Application.nativeBuildVersion ? Number(Application.nativeBuildVersion) || null : null;
export const installedVersionName: string | null = Application.nativeApplicationVersion ?? null;

let release: AppRelease | null = null;
let checkedAt = 0;
let restored = false;
let promptedCode = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

async function restore() {
  if (restored) return;
  restored = true;
  try {
    const raw = await AsyncStorage.getItem(RELEASE_KEY);
    if (raw && !release) {
      release = parseRelease(JSON.parse(raw));
      emit();
    }
  } catch {
    /* nothing cached */
  }
}

/** Asks the server for the newest build. Silent on any failure. */
export async function checkForUpdate(force = false): Promise<void> {
  if (Platform.OS !== "android") return;
  await restore();
  if (!force && Date.now() - checkedAt < CHECK_EVERY_MS) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/app/release?platform=android`, { signal: controller.signal });
    checkedAt = Date.now();
    if (res.status === 204) {
      release = null;
    } else if (res.ok) {
      const next = parseRelease(await res.json());
      if (!next) return;
      release = next;
      AsyncStorage.setItem(RELEASE_KEY, JSON.stringify(next)).catch(() => {});
    } else {
      return;
    }
    emit();
    await maybePrompt();
  } catch {
    /* offline or unreachable: keep what we had */
  } finally {
    clearTimeout(timer);
  }
}

export function openUpdate(): void {
  if (release) Linking.openURL(release.downloadUrl).catch(() => {});
}

const HINT =
  "Your phone will download the update and ask you to confirm the install. If it says installs from this source are blocked, allow it for your browser once, then open the download again. Your data is kept.";

async function maybePrompt() {
  if (!release || updateState(installedBuild, release) !== "available") return;
  if (promptedCode === release.versionCode) return; // once per launch
  let snooze: { code: number; until: number } | null = null;
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    snooze = raw ? JSON.parse(raw) : null;
  } catch {
    /* no snooze */
  }
  if (!shouldPrompt(release, snooze, Date.now())) return;
  const code = release.versionCode;
  promptedCode = code;
  appAlert(
    "Update available",
    `Version ${release.versionName} is ready.${release.notes ? `\n\n${release.notes}` : ""}\n\n${HINT}`,
    [
      {
        text: "Later",
        onPress: () => {
          AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify({ code, until: Date.now() + SNOOZE_MS })).catch(() => {});
        },
      },
      { text: "Update now", onPress: openUpdate },
    ],
    "info",
  );
}

export interface AppUpdateInfo {
  state: UpdateState;
  release: AppRelease | null;
}

let snapshot: AppUpdateInfo = { state: "current", release: null };
function getSnapshot(): AppUpdateInfo {
  const state = updateState(installedBuild, release);
  if (snapshot.state !== state || snapshot.release !== release) snapshot = { state, release };
  return snapshot;
}

/** The update state for banners and the blocking screen. */
export function useAppUpdate(): AppUpdateInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Mounted once at the root: checks at launch, on returning to the app and when
 * the connection comes back. */
export function useAppUpdateWatcher() {
  useEffect(() => {
    checkForUpdate();
    const app = AppState.addEventListener("change", (next) => {
      if (next === "active") checkForUpdate();
    });
    let wasOnline = true;
    const net = NetInfo.addEventListener((s) => {
      const online = !!s.isConnected && s.isInternetReachable !== false;
      if (online && !wasOnline) checkForUpdate();
      wasOnline = online;
    });
    return () => {
      app.remove();
      net();
    };
  }, []);
}
