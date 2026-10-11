import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { AppearanceRow, ReportsRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import { APP_VERSION } from "@/constants/version";

/**
 * A supervisor's own account and scope.
 *
 * Same shape as the manager's profile - identity, what you cover, sign
 * out - because the question "why am I seeing these rows and not those"
 * has the same answer for both roles: is_site_scoped filters everything
 * to profile.siteIds, and a supervisor with none assigned sees nothing
 * at all. That state is called out explicitly rather than left to look
 * like a loading failure.
 */
export default function SuperviseProfile() {
  const { state, currentUser, signOut } = useSmartClean();

  const mySites = state.sites.filter((site) => currentUser?.siteIds.includes(site.id));

  return (
    <Screen title="Profile">
      <Card style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{currentUser?.initials ?? "?"}</Text>
        </View>
        <View style={styles.identityInfo}>
          <Text style={styles.name}>{currentUser?.name ?? "-"}</Text>
          <Text style={styles.role}>Supervisor</Text>
          {currentUser?.email && <Text style={styles.muted}>{currentUser.email}</Text>}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Your sites</Text>
        {mySites.length === 0 ? (
          <Text style={styles.warningText}>
            No sites assigned yet, so your screens will look empty. Ask your manager to
            assign you one.
          </Text>
        ) : (
          mySites.map((site) => (
            <View key={site.id} style={styles.siteRow}>
              <Ionicons name="business-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.siteName}>{site.name}</Text>
            </View>
          ))
        )}
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
        <ReportsRow />
        <AppearanceRow />
      </Card>

      <Button variant="outline" onPress={() => signOut()}>
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
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  siteName: {
    fontSize: typography.body,
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
  },
  warningText: {
    fontSize: typography.small,
    color: colors.warningForeground,
    backgroundColor: colors.warningSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    lineHeight: 19,
  },
  version: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
}));
