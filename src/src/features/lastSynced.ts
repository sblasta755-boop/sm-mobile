import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// When this phone last talked to the server successfully (sent everything it had, or pulled fresh
// data). Shown on the Sync screen. Kept across restarts; a failed write only loses the time shown.
const STORAGE_KEY = "soma.lastSynced.v1";

let current: number | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadLastSynced(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value) && (current === null || value > current)) {
      current = value;
      emit();
    }
  } catch {
    /* start with nothing shown */
  }
}

export function markSynced(at: number = Date.now()) {
  current = at;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, String(at)).catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The time of the last successful sync, or null if there has not been one on this phone. */
export function useLastSynced(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
