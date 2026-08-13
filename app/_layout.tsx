import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SmartCleanProvider } from "@/features/store";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SmartCleanProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SmartCleanProvider>
    </SafeAreaProvider>
  );
}
