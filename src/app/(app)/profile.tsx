import { useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ProfileHero, SettingsRow, SettingsSection, SignOutButton, StatRow, StatTile, sinceLabel } from "@/components/SettingsKit";
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { AppearanceRow, TourRow, ScheduleRow, SyncRow, EvidenceViewRow, FeedbackRow, ReportsRow } from "@/components/ProfilePreferences";
import { BiometricLockRow } from "@/components/BiometricLockRow";
import { useSmartClean } from "@/features/store";
import { readAutoClockDiagnostics, useAutoClockStatus, type LastFixRecord } from "@/features/geofenceClock";
import { useCanManageSiteLayout, useRoleLabel, useStaffRole } from "@/features/roles";
import { fileUrl, getMyRatingSummary, toUserRecord, updateUser, uploadImage } from "@/api/client";
import type { TableRatingSummary } from "@/types/smartclean";
import { colors, spacing, themedStyles, useThemeVersion } from "@/theme";
import { TAG } from "@/constants/version";

export default function ProfileScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, dispatch, currentUser, signOut } = useSmartClean();
  const canManageSiteLayout = useCanManageSiteLayout();
  // The avatar upload had no feedback at all: tapping it opened the
  // picker, then the photo silently uploaded and the user updated while
  // the avatar sat unchanged. People tapped it again mid-upload.
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;
  const myTasks = state.tasks.filter((t) => t.assigneeId === currentUser?.id);
  const done = myTasks.filter((t) => ["approved", "closed"].includes(t.status)).length;

  // "Your rating" only means anything for someone who actually runs
  // table sessions - see the Role union's own comment on why cleaner
  // shares every waiter permission (a cleaner covering a waiter's
  // section can be rated too). Fetched once on mount rather than pulled
  // from the global store, since nothing else in the app needs it and
  // it's specific to this one screen.
  const roleLabel = useRoleLabel();
  const showsRating = !!useStaffRole()?.features.ratings;
  // Hidden diagnostics: tap the version stamp 5 times to show them.
  const autoClock = useAutoClockStatus();
  const [stampTaps, setStampTaps] = useState(0);
  const [lastFix, setLastFix] = useState<LastFixRecord | null>(null);
  const showDiagnostics = stampTaps >= 5;
  useEffect(() => {
    if (showDiagnostics) void readAutoClockDiagnostics().then(setLastFix);
  }, [showDiagnostics]);
  const [ratingSummary, setRatingSummary] = useState<TableRatingSummary | null>(null);
  useEffect(() => {
    if (!showsRating || !state.accessToken) return;
    let cancelled = false;
    getMyRatingSummary(state.accessToken)
      .then((summary) => {
        if (!cancelled) setRatingSummary(summary);
      })
      .catch(() => {
        // Best-effort - the stat just doesn't render if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, [showsRating, state.accessToken]);

  async function pickPhoto() {
    if (!currentUser || !state.accessToken || uploadingPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    // Set only after the picker returns: the upload is the slow part,
    // and spinning while the OS photo picker is open would be wrong.
    setUploadingPhoto(true);
    try {
      const filePath = await uploadImage(state.accessToken, asset.uri, asset.fileName ?? "profile.jpg", mime);
      const photoUrl = fileUrl(filePath);
      await updateUser(state.accessToken, currentUser.id, toUserRecord(currentUser, { profilePhotoDataUrl: photoUrl }));
      dispatch({ type: "UPDATE_USER", userId: currentUser.id, patch: { profilePhotoDataUrl: photoUrl } });
    } catch {
      // best-effort - leave existing photo unchanged
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  const clockedLabel = clocked
    ? new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    : "-";

  return (
    <Screen title="Profile">
      <UpdateBanner />
      <ProfileHero
        name={currentUser?.name ?? "-"}
        subtitle={`${roleLabel(currentUser?.role)}${site ? ` · ${site.name}` : ""}`}
        initials={currentUser?.initials ?? "?"}
        photoUrl={currentUser?.profilePhotoDataUrl}
        onPhotoPress={pickPhoto}
        uploading={uploadingPhoto}
        status={{ label: clocked ? "On shift" : "Off shift", on: !!clocked }}
        // Clocking out re-scans the site QR the same way clocking in does - see scan.tsx, which clocks in or
        // out depending on whether the user is already clocked in.
        shift={{
          clockIn: clockedLabel,
          onSite: sinceLabel(clocked),
          action: { label: clocked ? "Clock out" : "Clock in", onPress: () => router.push("/scan") },
        }}
      />

      {/* All-time rating is its own tile: it answers "how am I doing overall", not "today". Customers rate
          anonymously (the backend's TableSessionRating); this is only ever the aggregate. */}
      <StatRow>
        <StatTile
          label="Tasks today"
          value={`${done}/${myTasks.length}`}
          progress={myTasks.length ? done / myTasks.length : 0}
        />
        {showsRating && (
          <StatTile
            label={ratingSummary?.ratingCount ? `Rating · ${ratingSummary.ratingCount}` : "Rating"}
            value={ratingSummary?.averageRating != null ? `${ratingSummary.averageRating.toFixed(1)} ★` : "-"}
          />
        )}
      </StatRow>

      <SettingsSection title="Settings">
        <SettingsRow icon="person-outline" title="Edit profile" onPress={() => router.push("/profile-edit")} />
        <SettingsRow icon="notifications-outline" title="Notifications" onPress={() => router.push("/notification-settings" as never)} />
        {/* Renders nothing on a device with no sensor or nothing enrolled - see BiometricLockRow. */}
        <BiometricLockRow />
        <AppearanceRow />
        <SyncRow />
        <EvidenceViewRow />
        <SettingsRow icon="document-text-outline" title="Performance profile" onPress={() => router.push("/performance-profile")} />
        <TourRow />
      </SettingsSection>

      <SettingsSection title="Work">
        <ScheduleRow />
        <ReportsRow />
        {/* Incidents are always tied to a scanned room/zone now, so this sends the person to Scan first
            rather than straight to the report form - see app/(app)/incidents/new.tsx. */}
        <SettingsRow
          icon={<BrokenGlassIcon size={17} color={colors.primary} />}
          title="Report incident"
          onPress={() => router.push("/scan")}
        />
        {/* Management tooling, not field-ops - see useCanManageSiteLayout. */}
        {canManageSiteLayout && (
          <SettingsRow icon="grid-outline" title="Site layout" onPress={() => router.push("/site-layout")} />
        )}
      </SettingsSection>

      <SettingsSection title="Support & legal" defaultOpen={false}>
        <FeedbackRow />
        <SettingsRow icon="help-circle-outline" title="Help & support" onPress={() => {}} />
        <SettingsRow icon="shield-checkmark-outline" title="Privacy & POPIA notice" onPress={() => router.push("/privacy")} />
      </SettingsSection>

      <SignOutButton onPress={handleSignOut} />

      {/* Build version stamp - TAG, generated at build/start time by scripts/version.mjs into
          src/constants/version.ts. Lets you confirm which build is running. Tap it 5 times for the
          hidden auto clock-out diagnostics. */}
      <Text style={styles.versionStamp} onPress={() => setStampTaps((n) => n + 1)}>v{TAG}</Text>
      {showDiagnostics && (
        <View style={styles.diagnostics}>
          <Text style={styles.diagnosticsText}>
            Auto clock-out: {autoClock.enabled ? "on" : `off (${autoClock.disabledReason})`}
          </Text>
          <Text style={styles.diagnosticsText}>Location permission: {autoClock.permission}</Text>
          <Text style={styles.diagnosticsText}>
            Last check: {lastFix ? `${new Date(lastFix.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} - ${lastFix.result}, ${lastFix.distanceM} m from site (accuracy ${lastFix.accuracy != null ? Math.round(lastFix.accuracy) + " m" : "unknown"})` : "none yet"}
          </Text>
          <Text style={styles.diagnosticsText}>
            Last automatic clocking: {lastFix?.lastAutoAction ? `${lastFix.lastAutoAction.type === "clock_out" ? "out" : "in"} at ${new Date(lastFix.lastAutoAction.at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : "none"}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  versionStamp: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: 10,
    color: colors.mutedForeground,
  },
  diagnostics: {
    marginTop: spacing.sm,
    gap: 2,
  },
  diagnosticsText: {
    textAlign: "center",
    fontSize: 10,
    color: colors.mutedForeground,
  },
}));
