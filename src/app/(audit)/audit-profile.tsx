import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/Screen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ProfileHero, SettingsRow, SettingsSection, SignOutButton } from "@/components/SettingsKit";
import { AppearanceRow, TourRow, FeedbackRow, ReportsRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";

import { useSmartClean } from "@/features/store";
import { colors, spacing, themedStyles, useThemeVersion } from "@/theme";
import { TAG } from "@/constants/version";

/**
 * An auditor's own account and scope.
 *
 * Same shape as the manager's and supervisor's profiles - identity, what
 * you can see, account settings, sign out - and the same account rows
 * every other role gets, which is the point: profile settings are not a
 * field-role privilege.
 *
 * What it deliberately omits is the cleaner profile's shift block:
 * clock-in state, task counts and the Clock in/out button. An auditor
 * has no shift, and the backend would refuse the attendance write
 * anyway.
 */
export default function AuditProfile() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, signOut } = useSmartClean();

  // An auditor is site-scoped server-side (is_site_scoped covers every role but org_admin/operations_manager),
  // so siteIds is the honest answer to "what can I see". Empty means the whole app will look empty, which is
  // called out rather than left looking like a failure.
  const mySites = state.sites.filter((site) => currentUser?.siteIds.includes(site.id));

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen title="Profile">
      <UpdateBanner />
      <ProfileHero
        name={currentUser?.name ?? "-"}
        subtitle="Client auditor"
        detail={currentUser?.email}
        initials={currentUser?.initials ?? "?"}
        photoUrl={currentUser?.profilePhotoDataUrl}
      />

      <SettingsSection title="Your access">
        <SettingsRow
          icon="eye-outline"
          title="Read-only"
          sub={`You can review work and quality results in ${state.tenant?.name ?? "this organisation"}, but not change them.`}
        />
        {mySites.length === 0 ? (
          <SettingsRow
            icon="warning-outline"
            title="No sites shared with you yet"
            sub="Your screens will look empty. Ask the organisation's administrator to give you access."
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
        <TourRow />
      </SettingsSection>

      <SettingsSection title="Work">
        <ReportsRow />
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
