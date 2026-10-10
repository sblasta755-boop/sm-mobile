import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHasCapability, useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, sizes, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The bottom navigation, for screens that live outside any role's tab group.
 *
 * Every role has its own tab bar (app/(app), (supervise), (manage), (audit),
 * (platform) - their layouts). A task, an inspection, notifications and the
 * other screens in app/(shared)/ are reached from all of them, so they open
 * above the tab groups and would lose the bar. This draws the same bar for the
 * signed-in role under those screens, so navigation is always one tap away and
 * the content never runs under the phone's own system buttons (the bar pads
 * itself by the bottom safe-area inset).
 *
 * It mirrors each group's tab list. If a role gains a tab in its layout, add
 * it here too.
 */
type Tab = { label: string; to: string; icon: keyof typeof Ionicons.glyphMap; primary?: boolean };

export function RoleTabBar() {
  useThemeVersion();
  const { currentUser, state } = useSmartClean();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const hasCorrectiveActions = useHasModule("corrective_actions");
  const hasInspections = useHasModule("inspections");
  const hasQr = useHasCapability("qr_codes");
  const role = currentUser?.role;

  if (!currentUser) return null;

  let tabs: Tab[];
  switch (role) {
    case "system_admin":
      tabs = [
        { label: "Overview", to: "/platform-dashboard", icon: "grid" },
        { label: "Clients", to: "/platform-organisations", icon: "business" },
        { label: "Onboard", to: "/platform-onboard", icon: "qr-code" },
        { label: "Approvals", to: "/platform-approvals", icon: "shield-checkmark" },
        { label: "Profile", to: "/platform-profile", icon: "person" },
      ];
      break;
    case "org_admin":
    case "operations_manager":
    case "site_manager":
      tabs = [
        { label: "Overview", to: "/manage-home", icon: "grid" },
        { label: "Team", to: "/manage-team", icon: "people" },
        { label: "Add staff", to: "/manage-add-staff", icon: "person-add" },
        { label: "Approvals", to: "/manage-approvals", icon: "shield-checkmark" },
        { label: "Profile", to: "/manage-profile", icon: "person" },
      ];
      break;
    case "supervisor":
      tabs = [
        { label: "Today", to: "/supervise-home", icon: "today" },
        ...(hasInspections ? [{ label: "Inspections", to: "/supervise-inspections", icon: "clipboard" } as Tab] : []),
        ...(hasCorrectiveActions ? [{ label: "Actions", to: "/supervise-actions", icon: "checkbox" } as Tab] : []),
        { label: "Profile", to: "/supervise-profile", icon: "person" },
      ];
      break;
    case "client_auditor":
      tabs = [
        { label: "Overview", to: "/audit-home", icon: "analytics" },
        ...(hasInspections ? [{ label: "Quality", to: "/audit-quality", icon: "ribbon" } as Tab] : []),
        { label: "Profile", to: "/audit-profile", icon: "person" },
      ];
      break;
    default: {
      const isWaiter = role === "waiter" && !!state.tenant?.tableServiceEnabled;
      tabs = [
        { label: "Home", to: "/home", icon: "home" },
        { label: "Shifts", to: "/shifts", icon: "calendar" },
        ...(hasQr ? [{ label: "Scan", to: "/scan", icon: "scan", primary: true } as Tab] : []),
        ...(isWaiter ? [{ label: "Tables", to: "/tables", icon: "restaurant" } as Tab] : []),
        ...(hasCorrectiveActions && role !== "waiter"
          ? [{ label: "Actions", to: "/corrective-actions", icon: "checkbox" } as Tab]
          : []),
        { label: "Profile", to: "/profile", icon: "person" },
      ];
    }
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { height: sizes.bottomNavHeight + insets.bottom, paddingBottom: insets.bottom + spacing.xs },
      ]}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Pressable
            key={tab.to}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            // navigate (not push): jump to the tab root rather than stacking a copy.
            onPress={() => router.navigate(tab.to as never)}
            style={styles.tab}
          >
            {tab.primary ? (
              <View style={styles.primary}>
                <Ionicons name={tab.icon} size={24} color={colors.primaryForeground} />
              </View>
            ) : (
              <>
                <Ionicons name={tab.icon} size={22} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingTop: 4 },
  label: { fontSize: typography.tiny, fontWeight: "600", color: colors.mutedForeground },
  labelActive: { color: colors.primary },
  primary: {
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
}));
