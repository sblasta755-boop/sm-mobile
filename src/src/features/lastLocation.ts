import { useEffect } from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { buildPath, isRememberable } from "@/domain/lastLocation";
import { remember } from "@/features/lastLocationStore";
import { useSmartClean } from "@/features/store";

/** Keeps the saved place up to date as the person moves around. Mounted once, in the root layout. */
export function useRememberLocation() {
  const { state, currentUser } = useSmartClean();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const userId = currentUser?.id;
  const ready = Boolean(userId) && state.sessionRestored && !state.locked;
  const path = buildPath(
    pathname,
    params as Record<string, string | string[] | undefined>,
  );

  useEffect(() => {
    if (!ready || !userId || !isRememberable(pathname)) return;
    remember(userId, path);
  }, [ready, userId, pathname, path]);
}
