import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { ProfileMenuSheet } from "@/components/ProfileMenuSheet";
import { colors, spacing, typography } from "@/theme";

/**
 * Shared authenticated-screen chrome: header (title or custom header content),
 * profile menu trigger, offline banner, and a scrollable content area.
 * Mirrors the web MobileShell; the bottom tab bar itself is provided by
 * Expo Router's Tabs navigator in app/(app)/_layout.tsx.
 */
export function Screen({
  children,
  title,
  headerContent,
  scroll = true,
}: {
  children: ReactNode;
  title?: string;
  headerContent?: ReactNode;
  scroll?: boolean;
}) {
  const { state, currentUser } = useSmartClean();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));

  const Content = scroll ? ScrollView : View;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {headerContent ? (
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerCenter}>{headerContent}</View>
            <ProfileTrigger currentUser={currentUser} onPress={() => setMenuOpen(true)} />
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.eyebrow}>{currentUser?.role.replace(/_/g, " ") ?? ""}</Text>
                <Text style={styles.username} numberOfLines={1}>
                  {currentUser?.name ?? "Guest"}
                </Text>
              </View>
              <ProfileTrigger currentUser={currentUser} onPress={() => setMenuOpen(true)} />
            </View>
            {title && <Text style={styles.title}>{title}</Text>}
            {site && <Text style={styles.siteName}>{site.name}</Text>}
          </>
        )}
      </View>

      {state.connectivity === "offline" && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline mode — changes will sync when reconnected.</Text>
        </View>
      )}

      <Content
        style={styles.content}
        contentContainerStyle={scroll ? styles.contentContainer : undefined}
      >
        {children}
      </Content>

      <ProfileMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

function ProfileTrigger({
  currentUser,
  onPress,
}: {
  currentUser: ReturnType<typeof useSmartClean>["currentUser"];
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open profile menu" onPress={onPress} style={styles.avatarButton}>
      <Text style={styles.avatarButtonText}>{currentUser?.initials ?? "SC"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerSpacer: {
    width: 32,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: typography.tiny,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.mutedForeground,
    fontWeight: "700",
  },
  username: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  title: {
    marginTop: spacing.sm,
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
  },
  siteName: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButtonText: {
    fontSize: typography.tiny,
    fontWeight: "800",
    color: colors.foreground,
  },
  offlineBanner: {
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  offlineText: {
    fontSize: typography.tiny,
    color: colors.warningForeground,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
