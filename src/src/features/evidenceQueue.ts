import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import type { QueuedPhoto } from "@/domain/evidenceQueue";

// Photos taken on the phone wait here until they have been uploaded. The list
// is kept in AsyncStorage and each image in the app's own document folder, so a
// photo survives a lost connection, a closed app and a restart. A photo is
// deleted from the phone only after the server has accepted it.
const STORAGE_KEY = "soma.evidence.queue.v1";
const FOLDER = `${FileSystem.documentDirectory ?? ""}evidence-queue/`;

let items: QueuedPhoto[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* the in-memory queue still works; the images are on disk */
  }
}

/** Reads the saved queue once. A photo that was mid-upload when the app closed is waiting again. */
export function loadQueue(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
        items = saved.map((p) => (p.status === "uploading" ? { ...p, status: "queued" as const } : p));
      } catch {
        items = [];
      }
      loaded = true;
      emit();
    })();
  }
  return loading;
}

export const getQueue = () => items;

export function subscribeQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The live queue, for screens. */
export function useEvidenceQueue(): QueuedPhoto[] {
  return useSyncExternalStore(subscribeQueue, getQueue, getQueue);
}

/** Copies a photo into the app's own storage so it outlives the camera cache. */
export async function keepPhoto(fromUri: string, id: string): Promise<string> {
  try {
    await FileSystem.makeDirectoryAsync(FOLDER, { intermediates: true });
    const to = `${FOLDER}${id}.jpg`;
    await FileSystem.copyAsync({ from: fromUri, to });
    return to;
  } catch {
    // The camera's own file is still readable for now; better than losing the photo.
    return fromUri;
  }
}

export async function enqueuePhoto(photo: QueuedPhoto) {
  await loadQueue();
  items = [photo, ...items];
  emit();
  await persist();
}

export async function updatePhoto(id: string, patch: Partial<QueuedPhoto>) {
  items = items.map((p) => (p.id === id ? { ...p, ...patch } : p));
  emit();
  await persist();
}

/** Removes a photo from the queue and deletes its file from the phone. */
export async function removePhoto(id: string) {
  const gone = items.find((p) => p.id === id);
  items = items.filter((p) => p.id !== id);
  emit();
  await persist();
  if (gone?.localUri.startsWith(FOLDER)) {
    FileSystem.deleteAsync(gone.localUri, { idempotent: true }).catch(() => {});
  }
}
