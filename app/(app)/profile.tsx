import type { ReactNode } from "react";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { useSmartClean } from "@/features/store";
import { useCanManageSiteLayout } from "@/features/roles";
import { fileUrl, toUserRecord, updateUser, uploadImage } from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";
import { APP_VERSION } from "@/constants/version";

export default function ProfileScreen() {
  const { state, dispatch, currentUser, signOut } = useSmartClean();
  const canManageSiteLayout = useCanManageSiteLayout();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;
  const myTasks = state.tasks.filter((t) => t.assigneeId === currentUser?.id);
  const done = myTasks.filter((t) => ["approved", "closed"].includes(t.status)).length;

  async function pickPhoto() {
    if (!currentUser || !state.accessToken) return;
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
    try {
      const filePath = await uploadImage(state.accessToken, asset.uri, asset.fileName ?? "profile.jpg", mime);
      const photoUrl = fileUrl(filePath);
      await updateUser(state.accessToken, currentUser.id, toUserRecord(currentUser, { profilePhotoDataUrl: photoUrl }));
      dispatch({ type: "UPDATE_USER", userId: currentUser.id, patch: { profilePhotoDataUrl: photoUrl } });
    } catch {
      // best-effort — leave existing photo unchanged
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen title="Profile">
      <Card style={styles.profileCard}>
        <Pressable style={styles.avatarWrap} onPress={pickPhoto} accessibilityLabel="Change profile photo">
          {currentUser?.profilePhotoDataUrl ? (
            <Image source={{ uri: currentUser.profilePhotoDataUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{currentUser?.initials}</Text>
          )}
          <View style={styles.avatarBadge}>
            <Ionicons name="camera" size={12} color={colors.foreground} />
          </View>
        </Pressable>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName} numberOfLines={1}>
            {currentUser?.name}
          </Text>
          <Text style={styles.profileRole}>{currentUser?.role.replace(/_/g, " ")}</Text>
          {site && (
            <View style={styles.siteRow}>
              <Ionicons name="location" size={11} color={colors.mutedForeground} />
              <Text style={styles.mutedSmall}>{site.name}</Text>
            </View>
          )}
        </View>
        <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "On shift" : "Off shift"} />
      </Card>

      <Card style={styles.statsCard}>
        <Text style={styles.statsLabel}>Today</Text>
        <View style={styles.statsRow}>
          <Stat label="Tasks" value={`${done}/${myTasks.length}`} />
          <Stat
            label="Clock-in"
            value={clocked ? new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}
          />
        </View>
      </Card>

      <View style={styles.rows}>
        <Row icon={<Ionicons name="person-outline" size={16} color={colors.primary} />} label="Edit profile" onPress={() => router.push("/profile/edit")} />
        <Row icon={<Ionicons name="notifications-outline" size={16} color={colors.primary} />} label="Notifications" onPress={() => router.push("/notifications")} />
        {/* Incidents are always tied to a scanned room/zone now, so this
            sends the cleaner to Scan first rather than straight to the
            report form - see app/(app)/incidents/new.tsx. */}
        <Row icon={<BrokenGlassIcon size={16} color={colors.primary} />} label="Report incident" onPress={() => router.push("/scan")} />
        <Row icon={<Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />} label="Privacy & POPIA notice" onPress={() => router.push("/privacy")} />
        {/* Management tooling, not field-ops - a cleaner never needs to
            arrange a floor plan. See useCanManageSiteLayout. */}
        {canManageSiteLayout && (
          <Row icon={<Ionicons name="grid-outline" size={16} color={colors.primary} />} label="Site layout" onPress={() => router.push("/site-layout")} />
        )}
        <Row icon={<Ionicons name="help-circle-outline" size={16} color={colors.primary} />} label="Help & support" onPress={() => {}} />
      </View>

      <View style={styles.bottomActions}>
        {/* Clocking out re-scans the site QR the same way clocking in
            does — see scan.tsx, which clocks in or out depending on
            whether the user is already clocked in. Previously this
            button called clockOut() directly with an empty qrValue,
            which the backend always rejected (it requires a real,
            matching site code) — clock-out silently never worked. */}
        <Button variant="outline" icon={<Ionicons name="time-outline" size={16} color={colors.foreground} />} onPress={() => router.push("/scan")}>
          {clocked ? "Clock out" : "Clock in"}
        </Button>
      </View>

      <Button variant="destructive" style={styles.signOut} icon={<Ionicons name="log-out-outline" size={16} color={colors.white} />} onPress={handleSignOut}>
        Sign out
      </Button>

      {/* Build version stamp - APP_VERSION, generated at build/start
          time by scripts/version.mjs (git describe --tags --always,
          same mechanism the web app's vite.config.ts uses for its own
          VITE_GIT_VERSION - see mobile.profile.tsx there) into
          src/constants/version.ts (gitignored, regenerated every run -
          see package.json's generate-version script, now actually
          wired into start/android/ios/web/export:web, which it wasn't
          before). Lets you confirm which build is actually running
          without digging through devtools. */}
      <Text style={styles.versionStamp}>v{APP_VERSION}</Text>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  // ReactNode rather than a bare Ionicons glyph name so a call site can
  // also pass a non-Ionicons icon (e.g. BrokenGlassIcon below, which
  // Ionicons has no equivalent for) - every existing caller just wraps
  // its glyph name in <Ionicons name=... /> instead of passing the name
  // directly.
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarText: {
    color: colors.primaryForeground,
    fontWeight: "800",
    fontSize: typography.h2,
  },
  avatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileName: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  profileRole: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  statsCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  statsLabel: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  rows: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  bottomActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  signOut: {
    marginTop: spacing.sm,
  },
  versionStamp: {
    marginTop: spacing.lg,
    textAlign: "center",
    fontSize: 10,
    color: colors.mutedForeground,
  },
});
