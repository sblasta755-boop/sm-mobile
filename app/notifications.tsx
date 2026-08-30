import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { useSmartClean } from "@/features/store";
import { markNotificationRead } from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";
import type { Notification } from "@/types/smartclean";

// Previously the profile menu's "Notifications" row was a no-op
// (onPress={() => {}}) — this is the real screen it now pushes to. Mirrors
// the web app's mobile.notifications.tsx: bootstrap already scopes
// state.notifications to what this user can see (tenant-wide broadcasts,
// or ones targeted at them), so this reads it directly rather than
// hitting the paged desktop endpoint.
export default function NotificationsScreen() {
  const { state, dispatch } = useSmartClean();
  const mine = state.notifications;

  const markRead = (n: Notification) => {
    if (n.read || !state.accessToken) return;
    dispatch({ type: "MARK_NOTIFICATION_READ", id: n.id, all: false });
    markNotificationRead(state.accessToken, n.id).catch(() => {
      // Best-effort — the read state already flipped locally above; a
      // failed network call here just means the next full sync/reload
      // reconciles it, same tradeoff the web app's version makes.
    });
  };

  return (
    <Screen title="Notifications">
      {mine.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.mutedSmall}>
            Nothing yet — new task assignments and updates will show up here.
          </Text>
        </View>
      ) : (
        mine.map((n) => {
          const iconColor =
            n.severity === "critical" ? colors.destructive : n.severity === "warning" ? colors.warningForeground : colors.primary;
          return (
            <Pressable key={n.id} onPress={() => markRead(n)}>
              <Card style={[styles.card, !n.read && styles.unreadCard]}>
                <View style={styles.row}>
                  <Ionicons name={iconFor(n)} size={16} color={iconColor} style={styles.icon} />
                  <View style={styles.textCol}>
                    <Text style={styles.text}>{n.text}</Text>
                    <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                  </View>
                  {!n.read && <View style={styles.dot} />}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

function iconFor(n: Notification): keyof typeof Ionicons.glyphMap {
  const needle = n.kind.toLowerCase();
  if (needle.includes("task")) return "checkbox-outline";
  if (needle.includes("corrective") || needle.includes("incident")) return "alert-circle-outline";
  if (needle.includes("user") || needle.includes("staff")) return "person-add-outline";
  if (n.severity === "critical" || n.severity === "warning") return "warning-outline";
  return "information-circle-outline";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  empty: {
    padding: spacing.lg,
    alignItems: "center",
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  card: {
    marginBottom: spacing.sm,
  },
  unreadCard: {
    borderColor: colors.primary,
    backgroundColor: colors.accent,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  icon: {
    marginTop: 2,
  },
  textCol: {
    flex: 1,
  },
  text: {
    fontSize: typography.body,
    fontWeight: "500",
    color: colors.foreground,
  },
  time: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
});
