import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addMutation, type OutboxKind, type OutboxMutation } from "@/domain/outbox";

// Changes made on the phone that the server has not accepted yet. Kept in
// AsyncStorage so they survive a closed app and a restart, and replayed in
// order by features/evidenceUploader.ts as soon as there is a connection.
const STORAGE_KEY = "soma.outbox.v1";

let items: OutboxMutation[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* kept in memory; the next change will try again */
  }
}

export function loadOutbox(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as OutboxMutation[]) : [];
        // Whatever was in flight when the app closed is simply waiting again.
        items = saved.map((m) => (m.status === "sending" ? { ...m, status: "pending" as const } : m));
      } catch {
        items = [];
      }
      loaded = true;
      emit();
    })();
  }
  return loading;
}

export const getOutbox = () => items;

export function subscribeOutbox(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOutbox(): OutboxMutation[] {
  return useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
}

export async function enqueueMutation(input: {
  userId: string;
  kind: OutboxKind;
  taskId?: string;
  payload: Record<string, unknown>;
}): Promise<OutboxMutation> {
  await loadOutbox();
  const mutation: OutboxMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    kind: input.kind,
    taskId: input.taskId,
    createdAt: new Date().toISOString(),
    payload: input.payload,
    status: "pending",
    attempts: 0,
  };
  items = addMutation(items, mutation);
  emit();
  await persist();
  return mutation;
}

export async function updateMutation(id: string, patch: Partial<OutboxMutation>) {
  items = items.map((m) => (m.id === id ? { ...m, ...patch } : m));
  emit();
  // "Sending" is not worth a disk write: a restart reverts it to pending anyway.
  if (Object.keys(patch).length === 1 && patch.status === "sending") return;
  await persist();
}

export async function removeMutation(id: string) {
  items = items.filter((m) => m.id !== id);
  emit();
  await persist();
}
