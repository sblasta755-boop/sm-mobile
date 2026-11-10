import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/Screen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ProfileHero, SettingsRow, SettingsSection, SignOutButton } from "@/components/SettingsKit";
import { AppearanceRow, TourRow, ScheduleRow, SyncRow, FeedbackRow, PayRunsRow, ReportsRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";
import { useRoleLabel } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, spacing, themedStyles, useThemeVersion } from "@/theme";
import { TAG } from "@/constants/version";

/**
 * A manager's own account.
 *
 * Deliberately thinner than the cleaner's profile screen: that one leads
 * with shift status, clock-in state and a task completion count, none of
 * which a manager has. What is left is identity, scope (which sites they
 * cover - the thing that silently decides what every other screen shows
 * them), and sign-out.
 */
export default function ManageProfile() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, signOut } = useSmartClean();
  const roleLabel = useRoleLabel();

  const mySites =
    (currentUser?.siteIds?.length ?? 0) > 0
      ? state.sites.filter((s) => currentUser?.siteIds.includes(s.id))
      : state.sites;
  const tenantWide = (currentUser?.siteIds?.length ?? 0) === 0;

  return (
    <Screen title="Profile">
      <UpdateBanner />
      <ProfileHero
        name={currentUser?.name ?? "-"}
        subtitle={roleLabel(currentUser?.role)}
        detail={currentUser?.email}
        initials={currentUser?.initials ?? "?"}
        photoUrl={currentUser?.profilePhotoDataUrl}
      />

      <SettingsSection title="What you cover">
        {tenantWide ? (
          <SettingsRow icon="business-outline" title={`Every site in ${state.tenant?.name ?? "your organisation"}`} />
        ) : mySites.length === 0 ? (
          // The state that would otherwise make the whole app look broken - see is_site_scoped on the backend.
          <SettingsRow
            icon="warning-outline"
            title="No sites assigned yet"
            sub="Your screens will look empty. Ask your administrator to assign you one."
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
        <TourRow />
      </SettingsSection>

      <SettingsSection title="Work">
        <ReportsRow />
        <ScheduleRow />
        <PayRunsRow />
        <SettingsRow icon="people-outline" title="View your team" onPress={() => router.push("/manage-team")} />
        {currentUser?.canOnboardStaff !== false && (
          <SettingsRow icon="person-add-outline" title="Add a team member" onPress={() => router.push("/manage-add-staff")} />
        )}
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
