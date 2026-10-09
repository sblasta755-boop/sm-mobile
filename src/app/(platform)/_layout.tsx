import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography } from "@/theme";

/**
 * Šoma360's own operator console, as a separate app from the customer
 * one in app/(app)/.
 *
 * A separate route group rather than extra tabs on the customer shell:
 * a platform admin has no shifts, no assigned tasks and nothing to scan
 * for attendance, so sharing that tab bar would mean gating five tabs
 * down to none and leaving a Scan button that does something completely
 * different depending on who is holding the phone.
 *
 * GATED ON ROLE, NOT ON MODULES - deliberately, and this is the one
 * thing to preserve if these tabs are ever edited. The platform tenant
 * is seeded with an open-ended enterprise subscription (see
 * services/seed.py on the backend) purely so operator staff are not
 * locked out of their own console by the subscription gate. A side
 * effect is that useHasModule() returns true for EVERYTHING here, so a
 * module-gated tab bar would silently hand these users a full set of
 * customer tabs backed by tenant-scoped queries that return nothing.
 * Mirrors get_platform_owner server-side, which likewise carries no
 * module gate.
 */
export default function PlatformTabsLayout() {
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();

  if (state.sessionRestored && !currentUser) {
    return <Redirect href="/login" />;
  }

  // Defence in depth. app/index.tsx already routes by role, but these
  // screens call endpoints that 403 for anyone else, and a customer who
  // reached this group by a stale deep link should land somewhere that
  // works rather than on four screens of permission errors.
  if (state.sessionRestored && currentUser && currentUser.role !== "system_admin") {
    return <Redirect href="/" />;
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
        name="platform-dashboard"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="platform-organisations"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, size }) => <Ionicons name="business" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="platform-onboard"
        options={{
          title: "Onboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="platform-approvals"
        options={{
          title: "Approvals",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="platform-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />

      {/* Real routes in this group, but reached by drilling in rather
          than from the bar. Tabs auto-adds any undeclared file route as
          its own tab, so each needs href: null - same mechanism the
          customer shell uses. */}
      <Tabs.Screen name="platform-organisation/[tenantId]" options={{ href: null }} />
    </Tabs>
  );
}
