import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerPushToken, unregisterPushToken } from "@/api/client";
import { useSmartClean } from "@/features/store";

// Foreground behavior: still show the banner/sound even while the app is
// open, matching how the backend already treats a push as "a nudge to open
// the app sooner" rather than something that should stay silent just
// because the app happens to be in front already.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  // Push tokens only exist on a real device - the simulator/emulator has
  // no APNs/FCM registration to hand back, and expo-notifications throws
  // if asked anyway. Fail quietly rather than surface an error the
  // developer can't act on.
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

/**
 * Registers this device's Expo push token with the backend whenever a user
 * is signed in, and unregisters it on sign-out - mirrored by
 * app.controllers.push.PushTokenController on the server. Mount once, at
 * the root (inside SmartCleanProvider so useSmartClean works) - see
 * app/_layout.tsx.
 */
export function usePushRegistration() {
  const { state, currentUser, refreshBackendData } = useSmartClean();
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncRegistration() {
      if (!currentUser || !state.accessToken) {
        // Signed out - best-effort unregister whatever we last registered
        // so a stale token doesn't keep receiving this user's pushes on a
        // shared/reused device after they've logged out.
        if (registeredTokenRef.current) {
          const token = registeredTokenRef.current;
          registeredTokenRef.current = null;
          unregisterPushToken(state.accessToken ?? "", token).catch(() => {});
        }
        return;
      }

      const token = await getExpoPushToken();
      if (cancelled || !token || token === registeredTokenRef.current) return;

      try {
        await registerPushToken(state.accessToken, token, Device.osName?.toLowerCase() ?? "unknown");
        registeredTokenRef.current = token;
      } catch {
        // Best-effort - a failed registration just means this device
        // won't get pushes until the next successful sync (app reopen,
        // token refresh); in-app notifications are unaffected.
      }
    }

    syncRegistration();
    return () => {
      cancelled = true;
    };
  }, [currentUser, state.accessToken]);

  // Re-check on app foreground too - covers the case where permission was
  // denied at first prompt and later granted from system Settings while
  // the app was backgrounded, without requiring a full re-login.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && currentUser && state.accessToken && !registeredTokenRef.current) {
        getExpoPushToken().then((token) => {
          if (token) {
            registerPushToken(state.accessToken!, token, Device.osName?.toLowerCase() ?? "unknown")
              .then(() => {
                registeredTokenRef.current = token;
              })
              .catch(() => {});
          }
        });
      }
    });
    return () => sub.remove();
  }, [currentUser, state.accessToken]);

  // Tap handling: a push tap should take the user straight to what it's
  // about, not just "open the app" - see routeForNotificationData below
  // for the category -> screen mapping. Registered once; expo-notifications
  // keeps its own listener list so this doesn't need the dependency array
  // dance the effects above do.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { category?: string; relatedId?: string }
        | undefined;
      navigateForNotificationData(data);
    });
    return () => sub.remove();
  }, []);

  // A push that arrives while the app is already open only ever drove the
  // banner/sound (see setNotificationHandler above) - it never told the
  // store anything changed. The server only sends one of these when a new
  // task, corrective action, etc. actually landed for this user, so it is
  // as good a signal to refetch as any poll and costs nothing extra: no
  // interval, no request unless something real happened. Without this, a
  // task assigned mid-shift stayed invisible until the user force-closed
  // and reopened the app (which is the only other thing that refetches).
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void refreshBackendData();
    });
    return () => sub.remove();
  }, [refreshBackendData]);
}

/**
 * Maps a push's {category, relatedId} (set server-side in
 * app.services.notify.notify's `data` payload) to the screen it should
 * open and navigates there. Falls back to the notifications list for
 * anything without a single-item detail screen in this app (Incidents has
 * no detail view yet, only a creation form; Quality/hourly-compliance and
 * tenant-wide Users broadcasts don't map to a mobile screen at all) rather
 * than guessing. Router.push's typed routes need a literal template
 * prefix to infer the right overload, which is why this branches into
 * separate push() calls instead of building and returning one plain
 * string path.
 */
export function navigateForNotificationData(
  data: { category?: string; relatedId?: string } | undefined,
): void {
  const category = data?.category?.toLowerCase() ?? "";
  const relatedId = data?.relatedId;

  if (relatedId && category === "tasks") {
    router.push(`/tasks/${relatedId}`);
    return;
  }
  if (relatedId && category === "corrective action") {
    router.push(`/corrective-actions/${relatedId}`);
    return;
  }
  router.push("/notifications");
}
