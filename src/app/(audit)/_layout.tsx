import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography, useThemeVersion } from "@/theme";

/**
 * The client auditor's app: read the record, change nothing.
 *
 * A client_auditor is an external party - the customer's own client, or
 * an independent reviewer - given a window onto the work rather than a
 * part in it. Before this group they fell through app/index.tsx's
 * default branch into the cleaner's field app, which is built entirely
 * around `assigneeId === currentUser.id`: they got a shift card, a
 * "Scan site QR to clock in" button they must never press, and an empty
 * task list, because an auditor is never a task's assignee. Same
 * mismatch that prompted the (manage) and (supervise) groups.
 *
 * Every tab here is read-only by construction. That is not a UI
 * convention being observed politely - the backend refuses an auditor's
 * writes, and ROLE_ACCESS on the web gives this role only
 * /dashboard, /reports, /quality, /notifications and /settings (see
 * permissions.ts). So this app offers no action that would 403: no
 * clock-in, no task claim, no inspection decision, no corrective action.
 *
 * Modules are consulted for Quality the way (supervise) does it:
 * inspections is a gateable module and is most of that tab's substance.
 * Role decides which app you get; modules decide which of its tabs
 * exist.
 */
export default function AuditTabsLayout() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();
  // Fails open before bootstrap lands - see useHasModule.
  const hasInspections = useHasModule("inspections");

  if (state.sessionRestored && !currentUser) {
    return <Redirect href="/login" />;
  }

  // Defence in depth, matching the other role groups: index.tsx already
  // routes by role, but a stale deep link should land somewhere that
  // works rather than on screens whose every request 403s.
  if (state.sessionRestored && currentUser && currentUser.role !== "client_auditor") {
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
        name="audit-home"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="analytics" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="audit-quality"
        options={{
          title: "Quality",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ribbon" color={color} size={size} />
          ),
          // href: null both hides the tab and makes it unreachable by
          // router.push - an organisation whose plan omits inspections
          // gets a shorter bar rather than a tab that 402s on tap.
          ...(hasInspections ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="audit-profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
