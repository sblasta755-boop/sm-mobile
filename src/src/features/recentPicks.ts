import { useCallback, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { parseRecent, pushRecent } from "@/domain/recentPicks";

/**
 * Recent picks, remembered on this device per person and per list ("role", "site", "organisation"). SecureStore is
 * what the app already uses for small preferences; these are only keys, never anything sensitive.
 */
export function useRecentPicks(kind: string, scope: string | undefined) {
  // SecureStore keys may only hold letters, digits, ".", "-" and "_".
  const storeKey = `recent.${kind}.${(scope ?? "anon").replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const [keys, setKeys] = useState<string[]>(() => {
    try {
      return parseRecent(SecureStore.getItem(storeKey));
    } catch {
      return [];
    }
  });
  const remember = useCallback(
    (key: string) => {
      setKeys((prev) => {
        const next = pushRecent(prev, key);
        SecureStore.setItemAsync(storeKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [storeKey],
  );
  return { recent: keys, remember };
}
