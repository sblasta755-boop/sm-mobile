import { Stack } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SmartCleanProvider } from "@/features/store";
import { ThemeProvider, useTheme } from "@/theme";
import { DialogHost } from "@/components/Dialog";
import { UpdateRequiredGate } from "@/components/UpdateBanner";
import { useAppUpdateWatcher } from "@/features/appUpdate";
import { usePushRegistration } from "@/features/pushNotifications";
import { useDeviceHealthReporting } from "@/features/deviceHealth";
import { useEvidenceUploader } from "@/features/evidenceUploader";
import { useRememberLocation } from "@/features/lastLocation";

// Keep the native splash image up until our animated in-app splash
// (rendered from app/index.tsx while the session restores) has actually
// painted, so there's no flash of blank content between the two. Hiding
// it is app/index.tsx's job - it, not this root layout, knows when its
// first frame is on screen.
NativeSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SmartCleanProvider>
          <PushNotificationsBridge />
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false }} />
          <UpdateRequiredGate />
          <DialogHost />
        </SmartCleanProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// usePushRegistration() calls useSmartClean(), which throws outside
// SmartCleanProvider - a tiny inner component keeps the hook call inside
// the provider without restructuring RootLayout itself.
function PushNotificationsBridge() {
  usePushRegistration();
  useDeviceHealthReporting();
  // Uploads photos taken offline, in the background, as soon as there is a connection.
  useEvidenceUploader();
  // Looks for a newer app build at launch, on resume and when back online.
  useAppUpdateWatcher();
  // Remembers the screen and scroll position so a lock or a closed app puts the person back.
  useRememberLocation();
  return null;
}

// Light text on a dark app and vice versa.
function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}
