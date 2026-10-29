import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography, useThemeVersion } from "@/theme";

/**
 * The supervisor's app: field quality assurance.
 *
 * Separate from both the cleaner's app and the manager's, because a
 * supervisor's job is neither. They are not assigned cleaning tasks, so
 * the cleaner's shift-and-clock-in shell showed them an empty list; and
 * they do not hire or oversee sites commercially, so the manager's
 * roster and staff-onboarding tabs would be equally wrong. What they do
 * is inspect completed work, raise and close corrective actions, and run
 * hourly compliance rounds - which is exactly what ROLE_ACCESS gives
 * them on the web (permissions.ts), mirrored here.
 *
 * Unlike the manager and platform shells, this one DOES consult modules:
 * inspections, corrective_actions and hourly_compliance are all gateable
 * by subscription tier, and they are most of this role's surface. Role
 * decides which app you get; modules decide which of its tabs exist.
 */
export default function SuperviseTabsLayout() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();
  // All three fail open before bootstrap lands - see useHasModule.
  const hasInspections = useHasModule("inspections");
  const hasCorrectiveActions = useHasModule("corrective_actions");

  if (state.sessionRestored && !currentUser) {
    return <Redirect href="/login" />;
  }

  if (state.sessionRestored && currentUser && currentUser.role !== "supervisor") {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.navForeground,
        tabBarStyle: {
          height: sizes.bottomNavHeight + insets.bottom,
          paddingBottom: insets.bottom + spacing.xs,
          paddingTop: spacing.xs,
          borderTopColor: colors.border,
          backgroundColor: colors.navBackground,
        },
        tabBarLabelStyle: { fontSize: typography.tiny, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="supervise-home"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Ionicons name="today" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="supervise-inspections"
        options={{
          title: "Inspections",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard" color={color} size={size} />
          ),
          // href: null both hides the tab and makes it unreachable by
          // router.push - an organisation whose plan omits inspections
          // gets a shorter bar rather than a tab that 402s on tap.
          ...(hasInspections ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="supervise-actions"
        options={{
          title: "Actions",
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" color={color} size={size} />,
          ...(hasCorrectiveActions ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="supervise-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
      {/* Reachable via router.push("/supervise-scan") from the clock-in
          card on supervise-home, not a tab of its own - href: null keeps
          it out of the bar without making it unreachable. Named
          supervise-scan rather than bare "scan" to avoid colliding with
          (app)/scan.tsx's own "/scan" route - see supervise-scan.tsx's
          own comment for why this is a separate file from the
          cleaner's. */}
      <Tabs.Screen name="supervise-scan" options={{ href: null }} />
    </Tabs>
  );
}
