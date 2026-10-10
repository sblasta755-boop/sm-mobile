import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography, useThemeVersion } from "@/theme";

/**
 * The management app: org_admin, operations_manager and site_manager.
 *
 * These roles previously landed in the cleaner's app, which is built
 * entirely around `assigneeId === currentUser.id` - today's shift, a
 * clock-in QR, my assigned tasks. A site manager is assigned none of
 * those: they oversee the people who are. So they saw a clock-in button
 * and an empty task list, which is what prompted this group.
 *
 * Gated on ROLE, not on modules, for the same reason the platform
 * console is: module gating answers "what has this organisation paid
 * for", role gating answers "what is this person for". Both apply, but
 * only the second decides which app you get.
 *
 * Three roles share one shell rather than getting one each because
 * ROLE_ACCESS (the canonical matrix, mirrored in DEFAULT_ROLE_ACCESS
 * server-side) gives them near-identical surfaces - site_manager's is a
 * subset of operations_manager's, which is a subset of org_admin's. The
 * differences are in SCOPE, which the backend already enforces:
 * is_site_scoped filters every list endpoint down to a site manager's
 * own sites, so the same screen shows each role the right rows without
 * the app branching at all.
 */
const MANAGEMENT_ROLES = ["org_admin", "operations_manager", "site_manager"];

export default function ManageTabsLayout() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();

  if (state.sessionRestored && !currentUser) {
    return <Redirect href="/login" />;
  }

  // Defence in depth, matching the platform group: index.tsx already
  // routes by role, but a stale deep link should land somewhere that
  // works rather than on screens whose every request 403s.
  if (
    state.sessionRestored &&
    currentUser &&
    !MANAGEMENT_ROLES.includes(currentUser.role)
  ) {
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
        tabBarLabelStyle: { fontSize: typography.tiny, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="manage-home"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="manage-team"
        options={{
          title: "Team",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="manage-add-staff"
        options={{
          title: "Add staff",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage-approvals"
        options={{
          title: "Approvals",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
