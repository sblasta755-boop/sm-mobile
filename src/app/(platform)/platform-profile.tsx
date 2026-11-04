import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/Screen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ProfileHero, SettingsRow, SettingsSection, SignOutButton } from "@/components/SettingsKit";
import { AppearanceRow, TourRow, FeedbackRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";

import { useSmartClean } from "@/features/store";
import { colors, spacing, themedStyles, useThemeVersion } from "@/theme";
import { TAG } from "@/constants/version";

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
      <UpdateBanner />
      <ProfileHero
        name={currentUser?.name ?? "-"}
        subtitle="Šoma360 operator"
        detail={currentUser?.email}
        initials={currentUser?.initials ?? "?"}
        photoUrl={currentUser?.profilePhotoDataUrl}
      />

      <SettingsSection title="Your access">
        <SettingsRow
          icon="globe-outline"
          title="Platform-wide"
          sub="You administer organisations on Šoma360's own platform team, not as a member of one customer. You can review and onboard client organisations across the whole platform."
        />
      </SettingsSection>

      <SettingsSection title="Settings">
        <SettingsRow icon="person-outline" title="Edit profile" onPress={() => router.push("/profile-edit")} />
        <SettingsRow icon="notifications-outline" title="Notifications" onPress={() => router.push("/notification-settings" as never)} />
        <BiometricLockRow />
        <AppearanceRow />
        <TourRow />
      </SettingsSection>

      <SettingsSection title="Support & legal" defaultOpen={false}>
        <FeedbackRow />
        <SettingsRow icon="shield-checkmark-outline" title="Privacy & POPIA notice" onPress={() => router.push("/privacy")} />
      </SettingsSection>

      <SignOutButton onPress={handleSignOut} />

      <Text style={styles.version}>Šoma360 {TAG}</Text>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  version: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: 10,
    color: colors.mutedForeground,
  },
}));
