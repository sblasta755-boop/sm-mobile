import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EvidenceViewMode } from "@/domain/evidenceSections";

// The standing preference for the evidence screen (Settings): focus on the section a
// person opened (the default), or show every section. One setting for the whole app, kept until they change it.
const STORAGE_KEY = "soma.evidenceView.v1";

// Until a person chooses otherwise: the section they opened, not every section.
let current: EvidenceViewMode = "focus";
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Restores the saved preference once at start-up. */
export async function loadEvidenceView(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "all" || raw === "focus") {
      current = raw;
      emit();
    }
  } catch {
    /* start with the default */
  }
}

export function setEvidenceViewMode(next: EvidenceViewMode) {
  current = next;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useEvidenceViewMode(): [
  EvidenceViewMode,
  (next: EvidenceViewMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  return [mode, setEvidenceViewMode];
}

// What a person picked on the screen itself for one task. Remembered while the app is open,
// not saved as a setting: it is for that task only.
const perTask = new Map<string, string>();
export const taskSectionChoice = {
  get: (taskId: string) => perTask.get(taskId),
  set: (taskId: string, section: string) => void perTask.set(taskId, section),
};
