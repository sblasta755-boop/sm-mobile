import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography } from "@/theme";

export default function ProfileScreen() {
  const { state, dispatch, currentUser, signOut } = useSmartClean();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;
  const pending = state.syncQueue.filter((s) => s.status !== "synced");
  const myTasks = state.tasks.filter((t) => t.assigneeId === currentUser?.id);
  const done = myTasks.filter((t) => ["approved", "closed"].includes(t.status)).length;

  async function pickPhoto() {
    if (!currentUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const mime = result.assets[0].mimeType ?? "image/jpeg";
    dispatch({
      type: "UPDATE_USER",
      userId: currentUser.id,
      patch: { profilePhotoDataUrl: `data:${mime};base64,${result.assets[0].base64}` },
    });
  }

  function runSync() {
    if (state.connectivity === "offline") return;
    pending.forEach((op) => {
      if (op.status === "queued" || op.status === "local") {
        dispatch({ type: "UPDATE_SYNC", id: op.id, patch: { status: "synced" } });
      }
    });
  }

  function clockOut() {
    if (!currentUser) return;
    dispatch({ type: "CLOCK_OUT", userId: currentUser.id });
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
          <Stat label="Pending sync" value={String(pending.length)} />
        </View>
      </Card>

      <View style={styles.rows}>
        <Row icon="cloud-upload-outline" label={`Sync queue (${pending.length})`} onPress={runSync} />
        <Row icon="notifications-outline" label="Notifications" onPress={() => {}} />
        <Row icon="alert-circle-outline" label="Report an incident" onPress={() => router.push("/incidents/new")} />
        <Row icon="shield-checkmark-outline" label="Privacy & POPIA notice" onPress={() => {}} />
        <Row icon="help-circle-outline" label="Help & support" onPress={() => {}} />
      </View>

      {pending.length > 0 && (
        <Card style={styles.queueCard}>
          <Text style={styles.statsLabel}>Sync queue</Text>
          <View style={styles.queueList}>
            {pending.map((op) => (
              <View key={op.id} style={styles.queueItem}>
                <View>
                  <Text style={styles.queueKind}>{op.kind}</Text>
                  <Text style={styles.mutedSmall}>
                    {op.entity} · {new Date(op.createdAt).toLocaleTimeString("en-ZA")}
                  </Text>
                </View>
                <StatusBadge tone={op.status === "conflict" || op.status === "failed" ? "destructive" : "info"} label={op.status} />
              </View>
            ))}
          </View>
        </Card>
      )}

      <View style={styles.bottomActions}>
        {clocked ? (
          <Button variant="outline" icon={<Ionicons name="time-outline" size={16} color={colors.foreground} />} onPress={clockOut}>
            Clock out
          </Button>
        ) : (
          <Button variant="outline" icon={<Ionicons name="time-outline" size={16} color={colors.foreground} />} onPress={() => router.push("/scan")}>
            Clock in
          </Button>
        )}
        <Button variant="outline" icon={<Ionicons name="refresh" size={16} color={colors.foreground} />} onPress={() => router.replace("/login")}>
          Switch account
        </Button>
      </View>

      <Button variant="destructive" style={styles.signOut} icon={<Ionicons name="log-out-outline" size={16} color={colors.white} />} onPress={handleSignOut}>
        Sign out
      </Button>
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
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={16} color={colors.primary} />
        </View>
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
  queueCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  queueList: {
    gap: spacing.sm,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  queueKind: {
    fontSize: typography.small,
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
});
