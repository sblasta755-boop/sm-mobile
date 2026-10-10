import { Stack } from "expo-router";
import { View } from "react-native";
import { RoleTabBar } from "@/components/RoleTabBar";
import { colors, useThemeVersion } from "@/theme";

/**
 * Screens every role reaches, whichever app it came from: tasks, inspections,
 * the board, corrective-action detail, incident reports, notifications,
 * privacy and profile editing.
 *
 * Expo Router groups don't share routes, so a screen needed by several roles
 * lives here and is pushed on top of the role's own tab group. That would
 * normally hide the tab bar, so this layout draws the signed-in role's bar
 * underneath the stack (RoleTabBar): navigation is always one tap away on
 * every screen, and content never runs under the phone's system buttons.
 */
export default function SharedLayout() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      <RoleTabBar />
    </View>
  );
}
