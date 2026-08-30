import { useEffect } from "react";
import { Stack } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SmartCleanProvider } from "@/features/store";
import { usePushRegistration } from "@/features/pushNotifications";

// Keep the native splash image up until our animated in-app splash
// (rendered from app/index.tsx while the session restores) has mounted,
// so there's no flash of blank content between the two.
NativeSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    NativeSplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <SmartCleanProvider>
        <PushNotificationsBridge />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SmartCleanProvider>
    </SafeAreaProvider>
  );
}

// usePushRegistration() calls useSmartClean(), which throws outside
// SmartCleanProvider — a tiny inner component keeps the hook call inside
// the provider without restructuring RootLayout itself.
function PushNotificationsBridge() {
  usePushRegistration();
  return null;
}
