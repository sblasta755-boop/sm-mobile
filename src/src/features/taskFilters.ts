import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NO_FILTERS, type TaskFilters } from "@/domain/taskBoard";

// The search and filters a person has set on task lists. One shared set for the
// whole app: it stays when they leave a screen, is applied on the home screen
// too, and only changes when they change it (or clear it, or sign out).
const STORAGE_KEY = "soma.taskFilters.v1";

let current: TaskFilters = NO_FILTERS;
const listeners = new Set<() => void>();
let loaded = false;

const emit = () => listeners.forEach((l) => l());

/** Restores the saved filters once at start-up. */
export async function loadTaskFilters(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<TaskFilters>;
      current = { ...NO_FILTERS, ...saved, tags: Array.isArray(saved.tags) ? saved.tags : [] };
      emit();
    }
  } catch {
    /* start with none */
  }
}

export function setTaskFilters(next: TaskFilters) {
  current = next;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

export const resetTaskFilters = () => setTaskFilters(NO_FILTERS);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** [filters, setFilters], shared by every screen that lists tasks. */
export function useTaskFilters(): [TaskFilters, (next: TaskFilters) => void] {
  const filters = useSyncExternalStore(subscribe, () => current, () => current);
  return [filters, setTaskFilters];
}
