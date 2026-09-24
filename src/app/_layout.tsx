import { Stack } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SmartCleanProvider } from "@/features/store";
import { usePushRegistration } from "@/features/pushNotifications";
import { useDeviceHealthReporting } from "@/features/deviceHealth";

// Keep the native splash image up until our animated in-app splash
// (rendered from app/index.tsx while the session restores) has actually
// painted, so there's no flash of blank content between the two. Hiding
// it is app/index.tsx's job — it, not this root layout, knows when its
// first frame is on screen.
NativeSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
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
// SmartCleanProvider - a tiny inner component keeps the hook call inside
// the provider without restructuring RootLayout itself.
function PushNotificationsBridge() {
  usePushRegistration();
  useDeviceHealthReporting();
  return null;
}
