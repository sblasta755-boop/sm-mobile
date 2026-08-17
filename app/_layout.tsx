import { useEffect } from "react";
import { Stack } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SmartCleanProvider } from "@/features/store";

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
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SmartCleanProvider>
    </SafeAreaProvider>
  );
}
