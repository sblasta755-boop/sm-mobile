import { Redirect, Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasCapability, useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography } from "@/theme";

export default function AppTabsLayout() {
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();
  // Corrective actions is the only gateable module with a tab of its
  // own. Fails open before bootstrap lands - see useHasModule.
  const hasCorrectiveActions = useHasModule("corrective_actions");
  // The Scan tab only exists for organisations that use QR codes. Scanning
  // also serves incidents and tables, but all of that is QR - with QR off
  // there is nothing left to scan. Fails open before bootstrap lands.
  const hasQr = useHasCapability("qr_codes");
  // The table-grid tab is for the "waiter" role only. A cleaner CAN
  // still operate a table session (the backend's _WAITER_ROLES allows
  // both, so a cleaner covering a waiter's section is never blocked) -
  // but they don't get a dedicated tab for it, to keep their bar the
  // same 5 tabs it's always been; they'd reach a table session via
  // router.push if they ever scan a table QR, same as any href:null
  // route below. Also requires table service to actually be switched on
  // for this organisation (Tenant.tableServiceEnabled - a business-type
  // toggle a platform operator sets, independent of subscription tier).
  // Hiding the tab is presentation only; the backend enforces the real
  // gate on every table-session request regardless (require_table_service
  // in app/api/deps.py).
  const isWaiter = currentUser?.role === "waiter" && !!state.tenant?.tableServiceEnabled;

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
          ...(hasQr ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="tables/index"
        options={{
          title: "Tables",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} />,
          // Same href:null pattern as corrective-actions below - not a
          // permissions gate, just presentation: everyone but "waiter"
          // (including a cleaner covering a waiter's section) can still
          // reach a table session via router.push if they ever scan a
          // table QR, per _WAITER_ROLES on the backend allowing both.
          ...(isWaiter ? {} : { href: null }),
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
          // 402s on tap. Also dropped for "waiter": Home already surfaces
          // their open corrective actions (see home.tsx's "Open
          // corrective actions" section, which every role gets), so a
          // dedicated tab would just be a second way to reach the same
          // list - and a waiter's bar is already busier than a plain
          // cleaner's (it also carries Tables), so this keeps it from
          // growing to 6. Still reachable via router.push if a waiter
          // taps into one from Home - only the tab itself disappears.
          // Spread rather than `href: undefined`, which is not reliably
          // equivalent to omitting the prop.
          ...(hasCorrectiveActions && currentUser?.role !== "waiter" ? {} : { href: null }),
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
      <Tabs.Screen name="performance-profile" options={{ href: null }} />
      {/* notifications, privacy and profile/edit used to be declared
          here. They now live in app/(shared)/ so that every role's
          profile can reach them, not just the cleaner's - see that
          group's _layout.tsx. */}
      <Tabs.Screen name="incidents/new" options={{ href: null }} />
      <Tabs.Screen name="corrective-actions/[actionId]" options={{ href: null }} />
      <Tabs.Screen name="kanban" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/index" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/declaration" options={{ href: null }} />
      <Tabs.Screen name="tasks/[taskId]/evidence" options={{ href: null }} />
      <Tabs.Screen name="site-layout/index" options={{ href: null }} />
      <Tabs.Screen name="site-layout/photo-backdrop" options={{ href: null }} />
      <Tabs.Screen name="site-layout/sketch" options={{ href: null }} />
      <Tabs.Screen name="site-layout/scan" options={{ href: null }} />
      <Tabs.Screen name="tables/[sessionId]" options={{ href: null }} />
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
