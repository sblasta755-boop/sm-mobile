import { useRef, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { usePullToRefresh } from "@/features/pullRefresh";
import { rememberScroll, savedScrollFor } from "@/features/lastLocationStore";
import { homePathForRole, useRoleLabel } from "@/features/roles";
import { ProfileMenuSheet } from "@/components/ProfileMenuSheet";
import { SyncBanner } from "@/components/SyncBanner";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// Every group's bottom-tab roots (see each _layout.tsx's <Tabs.Screen>
// entries) don't get a back button - they're always reachable from the
// tab bar, so "back" there would either loop to another root tab or
// exit the app. Every other screen (Notifications, Profile edit, Scan
// results, Hourly compliance, Incidents/new, task Evidence/Declaration,
// Corrective action detail, Privacy, ...) is reached by drilling in
// from one of these, and - with the whole app's headerShown: false -
// had no back affordance at all (no native header, no gesture on iOS,
// nothing on-screen even where Android's hardware back still works).
//
// This listed only the cleaner group's 5 roots at first, because that
// was the only group when it was written. A manager, supervisor or
// auditor sitting on their own home tab therefore got a back button
// that pointed out of their app.
const TAB_ROOT_PATHS = new Set([
  // (app) - the cleaner's field app
  "/home",
  "/shifts",
  "/scan",
  "/tables",
  "/corrective-actions",
  "/profile",
  // (manage)
  "/manage-home",
  "/manage-team",
  "/manage-add-staff",
  "/manage-approvals",
  "/manage-profile",
  // (supervise)
  "/supervise-home",
  "/supervise-inspections",
  "/supervise-actions",
  "/supervise-profile",
  // (audit)
  "/audit-home",
  "/audit-quality",
  "/audit-profile",
]);

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
  /** Overrides the default "go back in history" behaviour with a fixed
   * destination - use when a screen can be reached from more than one
   * place and should always return to one specific screen regardless
   * (e.g. task sub-screens always returning to that task). */
  backTo,
}: {
  children: ReactNode;
  title?: string;
  headerContent?: ReactNode;
  scroll?: boolean;
  backTo?: string;
}) {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const roleLabel = useRoleLabel();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const pathname = usePathname();
  const showBack = !TAB_ROOT_PATHS.has(pathname);

  const unreadCount = state.notifications.filter((n) => !n.read).length;
  const Content = scroll ? ScrollView : View;

  // Put the person back at the same spot after a lock or a closed app. The saved offset is
  // applied once the content is tall enough to reach it (lists fill in after the screen opens),
  // and recording starts only after that, so the first scroll events cannot overwrite it.
  const scrollRef = useRef<ScrollView | null>(null);
  const restoreY = useRef(scroll ? savedScrollFor(pathname, currentUser?.id) : 0);
  const viewportH = useRef(0);
  const [restoring, setRestoring] = useState(restoreY.current > 0);
  const stopRestoring = () => {
    restoreY.current = 0;
    setRestoring(false);
  };
  const onContentSizeChange = (_w: number, h: number) => {
    if (restoreY.current > 0 && h >= restoreY.current + viewportH.current) {
      scrollRef.current?.scrollTo({ y: restoreY.current, animated: false });
      stopRestoring();
    }
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!restoring) rememberScroll(pathname, event.nativeEvent.contentOffset.y);
  };
  // Same two header buttons as the web app: notifications (with an unread
  // badge) and the profile menu.
  const HeaderActions = (
    <View style={styles.headerActions}>
      <NotificationsBell unreadCount={unreadCount} />
      <ProfileTrigger currentUser={currentUser} onPress={() => setMenuOpen(true)} />
    </View>
  );

  const goBack = () => {
    if (backTo) {
      // backTo is caller-supplied (often an interpolated `/tasks/${id}`
      // path - see e.g. tasks/[taskId]/evidence.tsx), so it can't be
      // narrowed to expo-router's typed Href union the way an inline
      // literal path can.
      router.push(backTo as Parameters<typeof router.push>[0]);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homePathForRole(currentUser?.role) as Parameters<typeof router.replace>[0]);
    }
  };

  const BackButton = showBack ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={styles.backButton}>
      <Ionicons name="chevron-back" size={20} color={colors.foreground} />
    </Pressable>
  ) : null;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {headerContent ? (
          <View style={styles.headerRow}>
            {BackButton ?? <View style={styles.headerSpacer} />}
            <View style={styles.headerCenter}>{headerContent}</View>
            {HeaderActions}
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerTextRow}>
                {BackButton}
                <View style={styles.headerText}>
                  <Text style={styles.eyebrow}>{roleLabel(currentUser?.role)}</Text>
                  <Text style={styles.username} numberOfLines={1}>
                    {currentUser?.name ?? "Guest"}
                  </Text>
                </View>
              </View>
              {HeaderActions}
            </View>
            {title && <Text style={styles.title}>{title}</Text>}
            {site && <Text style={styles.siteName}>{site.name}</Text>}
          </>
        )}
      </View>

      <SyncBanner />

      <Content
        {...(scroll
          ? {
              ref: scrollRef,
              scrollEventThrottle: 250,
              onScroll,
              // Their own scrolling wins over a pending restore.
              onScrollBeginDrag: stopRestoring,
              onContentSizeChange,
              onLayout: (event: LayoutChangeEvent) => {
                viewportH.current = event.nativeEvent.layout.height;
              },
            }
          : {})}
        style={styles.content}
        contentContainerStyle={scroll ? styles.contentContainer : undefined}
        // Pull down to refresh, on every screen that scrolls.
        {...(scroll
          ? {
              alwaysBounceVertical: true,
              refreshControl: (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              ),
            }
          : {})}
      >
        {children}
      </Content>

      <ProfileMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

function NotificationsBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      onPress={() => router.push("/notifications")}
      style={styles.iconButton}
    >
      <Ionicons name="notifications-outline" size={18} color={colors.foreground} />
      {unreadCount > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      )}
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open profile menu"
      onPress={onPress}
      style={[styles.iconButton, styles.profileButton]}
    >
      {currentUser?.profilePhotoDataUrl ? (
        <Image source={{ uri: currentUser.profilePhotoDataUrl }} style={styles.profilePhoto} />
      ) : (
        <Ionicons name="person-outline" size={18} color={colors.foreground} />
      )}
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
  headerTextRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  // The photo fills the button, so it clips to the same rounded corners.
  profileButton: {
    overflow: "hidden",
  },
  profilePhoto: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.destructive,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
    color: colors.white,
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
}));
