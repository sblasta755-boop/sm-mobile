import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isDraftFresh } from "@/domain/lastLocation";
import { useSmartClean } from "@/features/store";

// A form someone had started, kept on this phone so a lock or a closed app does not lose it.
// Like useState, but the value survives; clear it when the form is sent.
const PREFIX = "soma.draft.v1:";
const WRITE_DELAY_MS = 400;

interface Stored<T> {
  userId: string;
  value: T;
  savedAt: number;
}

export function clearDraft(key: string) {
  AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}

type Next<T> = T | ((previous: T) => T);

export function useDraft<T>(
  key: string,
  initial: T,
): [T, (next: Next<T>) => void, () => void] {
  const { currentUser } = useSmartClean();
  const userId = currentUser?.id;
  const [value, setValue] = useState<T>(initial);
  // The latest value, so an updater function (as with useState) sees what was just typed.
  const latest = useRef<T>(initial);
  // Once the person has typed, a draft that finishes loading later must not overwrite it.
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (!live || touched.current || !raw) return;
        const stored = JSON.parse(raw) as Stored<T>;
        if (
          stored.userId === userId &&
          isDraftFresh(stored.savedAt, Date.now())
        )
          setValue(stored.value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, userId]);

  const set = useCallback(
    (update: Next<T>) => {
      touched.current = true;
      const next =
        typeof update === "function"
          ? (update as (previous: T) => T)(latest.current)
          : update;
      latest.current = next;
      setValue(next);
      if (!userId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const record: Stored<T> = { userId, value: next, savedAt: Date.now() };
        AsyncStorage.setItem(PREFIX + key, JSON.stringify(record)).catch(
          () => {},
        );
      }, WRITE_DELAY_MS);
    },
    [key, userId],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    clearDraft(key);
    latest.current = initialRef.current;
    setValue(initialRef.current);
  }, [key]);

  return [value, set, clear];
}
