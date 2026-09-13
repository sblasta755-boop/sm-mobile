import { Redirect, Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography } from "@/theme";

export default function AppTabsLayout() {
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();
  // Corrective actions is the only gateable module with a tab of its
  // own. Fails open before bootstrap lands - see useHasModule.
  const hasCorrectiveActions = useHasModule("corrective_actions");

  if (state.sessionRestored && !currentUser) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          height: sizes.bottomNavHeight + insets.bottom,
          paddingBottom: insets.bottom + spacing.xs,
          paddingTop: spacing.xs,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        },
        tabBarLabelStyle: {
          fontSize: typography.tiny,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: "Shifts",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => (
            <View style={styles.primaryTab}>
              <Ionicons name="scan" color={color === colors.primary ? colors.primaryForeground : colors.primaryForeground} size={24} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="corrective-actions/index"
        options={{
          title: "Actions",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" color={color} size={size} />,
          // href: null both hides this from the bar AND makes it
          // unreachable by router.push - the same mechanism the non-tab
          // routes below already use. An organisation whose plan omits
          // corrective actions gets a 4-tab bar rather than a tab that
          // 402s on tap. Spread rather than `href: undefined`, which is
          // not reliably equivalent to omitting the prop.
          ...(hasCorrectiveActions ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />

      {/* Everything below is a real route under this (app) group but not
          one of the 5 tabs above - expo-router's Tabs navigator auto-adds
          any undeclared file route as its own tab (see the extra icons
          that showed up once notifications/privacy/incidents/tasks/etc.
          moved in here from top-level app/), so each needs href: null to
          stay reachable via router.push() without cluttering the bar. */}
      <Tabs.Screen name="hourly-compliance" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="incidents/new" options={{ href: null }} />
      <Tabs.Screen name="corrective-actions/[actionId]" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/index" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/declaration" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/evidence" options={{ href: null }} />
      <Tabs.Screen name="site-layout/index" options={{ href: null }} />
      <Tabs.Screen name="site-layout/photo-backdrop" options={{ href: null }} />
      <Tabs.Screen name="site-layout/sketch" options={{ href: null }} />
      <Tabs.Screen name="site-layout/scan" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  primaryTab: {
    marginTop: -20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
