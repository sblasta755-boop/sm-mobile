import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSmartClean } from "@/features/store";
import { Button } from "@/components/Button";
import { colors, radius, spacing, typography } from "@/theme";

export function ProfileMenuSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, currentUser, signOut } = useSmartClean();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const online = state.connectivity === "online";

  async function handleSignOut() {
    onClose();
    await signOut();
    router.replace("/login");
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{currentUser?.initials ?? "SC"}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name}>{currentUser?.name ?? "Guest"}</Text>
            <Text style={styles.role}>
              {currentUser?.role.replace(/_/g, " ")}
              {site ? ` • ${site.name}` : ""}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Close menu" hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons
              name={online ? "wifi" : "cloud-offline-outline"}
              size={18}
              color={online ? colors.success : colors.warningForeground}
            />
            <View>
              <Text style={styles.rowTitle}>{online ? "Online" : "Offline"}</Text>
              <Text style={styles.rowSub}>Network status</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={styles.row}
          onPress={() => {
            onClose();
            router.replace("/login");
          }}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
            <Text style={styles.rowTitle}>Switch role</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        <Button variant="outline" onPress={handleSignOut} style={styles.signOut}>
          Sign out
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.primaryForeground,
    fontWeight: "800",
    fontSize: typography.body,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  role: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowTitle: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  rowSub: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  signOut: {
    marginTop: spacing.sm,
  },
});
