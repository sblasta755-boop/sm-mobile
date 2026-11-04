import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/Screen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ProfileHero, SettingsRow, SettingsSection, SignOutButton } from "@/components/SettingsKit";
import { AppearanceRow, TourRow, ScheduleRow, SyncRow, EvidenceViewRow, FeedbackRow, ReportsRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";

import { useSmartClean } from "@/features/store";
import { colors, spacing, themedStyles, useThemeVersion } from "@/theme";
import { TAG } from "@/constants/version";

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
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, signOut } = useSmartClean();

  const mySites = state.sites.filter((site) => currentUser?.siteIds.includes(site.id));

  return (
    <Screen title="Profile">
      <UpdateBanner />
      <ProfileHero
        name={currentUser?.name ?? "-"}
        subtitle="Supervisor"
        detail={currentUser?.email}
        initials={currentUser?.initials ?? "?"}
        photoUrl={currentUser?.profilePhotoDataUrl}
      />

      <SettingsSection title="Your sites">
        {mySites.length === 0 ? (
          <SettingsRow
            icon="warning-outline"
            title="No sites assigned yet"
            sub="Your screens will look empty. Ask your manager to assign you one."
          />
        ) : (
          mySites.map((site) => <SettingsRow key={site.id} icon="business-outline" title={site.name} />)
        )}
      </SettingsSection>

      <SettingsSection title="Settings">
        <SettingsRow icon="person-outline" title="Edit profile" onPress={() => router.push("/profile-edit")} />
        <SettingsRow icon="notifications-outline" title="Notifications" onPress={() => router.push("/notification-settings" as never)} />
        <BiometricLockRow />
        <AppearanceRow />
        <SyncRow />
        <EvidenceViewRow />
        <TourRow />
      </SettingsSection>

      <SettingsSection title="Work">
        <ReportsRow />
        <ScheduleRow />
      </SettingsSection>

      <SettingsSection title="Support & legal" defaultOpen={false}>
        <FeedbackRow />
        <SettingsRow icon="shield-checkmark-outline" title="Privacy & POPIA notice" onPress={() => router.push("/privacy")} />
      </SettingsSection>

      <SignOutButton onPress={() => signOut()} />

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
