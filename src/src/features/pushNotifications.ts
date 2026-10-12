import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
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

// Android 8+ delivers every notification through a channel, and a channel's
// importance is fixed at creation time - a push that arrives before any
// channel exists lands on an implicitly-created "Miscellaneous" one at
// default importance, which means no heads-up banner and no sound even
// though delivery technically succeeded. FCMv1 routes to the channel named
// by the expo-notifications plugin's `defaultChannel` in app.json, so this
// id must stay in sync with that value.
export const ANDROID_CHANNEL_ID = "default";

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Task and shift alerts",
      // HIGH, not DEFAULT: these are work assignments a cleaner is expected
      // to act on during a shift, so they warrant a heads-up banner rather
      // than a silent tray entry.
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#21779b",
      sound: "default",
      enableVibrate: true,
    });
  } catch (error) {
    // Never fatal - a missing channel degrades presentation, not delivery.
    console.warn("[push] Failed to create Android notification channel", error);
  }
}

async function getExpoPushToken(): Promise<string | null> {
  // Push tokens only exist on a real device - the simulator/emulator has
  // no APNs/FCM registration to hand back, and expo-notifications throws
  // if asked anyway. Warn rather than throw: this is expected on a
  // simulator, but silence here was previously indistinguishable from a
  // genuinely broken push setup.
  if (!Device.isDevice) {
    console.warn("[push] Not a physical device - push tokens are unavailable");
    return null;
  }

  // Before the permission prompt, so the channel's importance is already
  // fixed by the time the first notification can arrive.
  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.warn("[push] Notification permission not granted, status=%s", finalStatus);
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn("[push] No EAS projectId in expoConfig.extra.eas - cannot fetch a push token");
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log("[push] Expo push token acquired:", data);
    return data;
  } catch (error) {
    // The usual cause on a standalone Android build is missing FCM V1
    // credentials on the EAS project - the build succeeds and permissions
    // are granted, but there is no Firebase sender to register against.
    // See https://docs.expo.dev/push-notifications/fcm-credentials/
    console.warn("[push] getExpoPushTokenAsync failed", error);
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
// Coming back to the app refetches, but not more than this often.
const FOREGROUND_REFRESH_MIN_MS = 15_000;

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
        console.log("[push] Token registered with backend");
      } catch (error) {
        // Best-effort - a failed registration just means this device
        // won't get pushes until the next successful sync (app reopen,
        // token refresh); in-app notifications are unaffected.
        console.warn("[push] Backend token registration failed", error);
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
                console.log("[push] Token registered with backend on foreground");
              })
              .catch((error) => {
                console.warn("[push] Foreground token registration failed", error);
              });
          }
        });
      }
    });
    return () => sub.remove();
  }, [currentUser, state.accessToken]);

  // A push that arrives while the app is closed or in the background runs no
  // app code, so nothing refetched and the new task or notification only showed
  // after a restart. Refetch whenever the app comes back to the front, and when
  // a notification is tapped (below), at most once every few seconds. The ref
  // keeps the listener pointing at the latest refresh function.
  const refreshRef = useRef(refreshBackendData);
  refreshRef.current = refreshBackendData;
  const lastRefreshAt = useRef(0);
  const refreshSoon = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAt.current < FOREGROUND_REFRESH_MIN_MS) return;
    lastRefreshAt.current = now;
    void refreshRef.current();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshSoon();
    });
    return () => sub.remove();
  }, [refreshSoon]);

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
      refreshSoon();
      navigateForNotificationData(data);
    });
    return () => sub.remove();
  }, [refreshSoon]);

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
      // A real event just happened, so always refetch (not throttled).
      lastRefreshAt.current = Date.now();
      void refreshRef.current();
    });
    return () => sub.remove();
  }, []);
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
  // Lives in app/(shared)/ now rather than the cleaner's tab group, so
  // tapping a push lands correctly whichever app the role is in.
  router.push("/notifications");
}
