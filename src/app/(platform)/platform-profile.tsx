import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { AppearanceRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { APP_VERSION } from "@/constants/version";

/**
 * A platform operator's own account - the one screen this tab bar was
 * missing (see (platform)/_layout.tsx, which had four tabs and no way
 * to sign out, change the biometric lock, or reach notifications/
 * privacy). Same account rows every other role gets, for the same
 * reason audit-profile.tsx gives them to a read-only auditor: profile
 * settings are not a field-role privilege.
 *
 * Omits the "your sites" scope card every other profile has: a
 * system_admin belongs to no customer tenant and isn't site-scoped at
 * all (see (platform)/_layout.tsx's own comment on why this console is
 * gated on role rather than modules) - there is no siteIds list to show.
 */
export default function PlatformProfile() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { currentUser, signOut } = useSmartClean();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen title="Profile">
      <Card style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{currentUser?.initials ?? "?"}</Text>
        </View>
        <View style={styles.identityInfo}>
          <Text style={styles.name}>{currentUser?.name ?? "-"}</Text>
          <Text style={styles.role}>Šoma360 operator</Text>
          {currentUser?.email && <Text style={styles.muted}>{currentUser.email}</Text>}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Your access</Text>
        <Text style={styles.muted}>
          You administer organisations on Šoma360&apos;s own platform team, not as a member of any
          one customer. You can review and onboard client organisations across the whole platform.
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push("/profile-edit")}>
          <Ionicons name="person-outline" size={18} color={colors.foreground} />
          <Text style={styles.linkText}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push("/notifications")}>
          <Ionicons name="notifications-outline" size={18} color={colors.foreground} />
          <Text style={styles.linkText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push("/privacy")}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.foreground} />
          <Text style={styles.linkText}>Privacy &amp; POPIA notice</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <BiometricLockRow />
        <AppearanceRow />
      </Card>

      <Button variant="outline" onPress={handleSignOut}>
        Sign out
      </Button>

      <Text style={styles.version}>Šoma360 {APP_VERSION}</Text>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: typography.h2,
    fontWeight: "800",
    color: colors.primary,
  },
  identityInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
  },
  role: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.primary,
  },
  section: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 19,
  },
  version: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
}));
