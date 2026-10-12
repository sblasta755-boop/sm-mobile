import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { toneColors, type DialogTone } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { markNotificationRead, markNotificationsRead } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { Notification } from "@/types/smartclean";

// bootstrap already scopes state.notifications to what this user can see
// (tenant-wide broadcasts, or ones targeted at them), so this reads it
// directly rather than hitting the paged desktop endpoint.

type Filter = "all" | "unread" | "important";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "important", label: "Important" },
];

const toneOf = (n: Notification): DialogTone =>
  n.severity === "critical" ? "danger" : n.severity === "warning" ? "warning" : n.read ? "info" : "info";

export default function NotificationsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, dispatch } = useSmartClean();
  const [filter, setFilter] = useState<Filter>("all");
  const all = state.notifications;
  const unread = all.filter((n) => !n.read);

  const visible = useMemo(
    () =>
      all.filter((n) =>
        filter === "unread" ? !n.read : filter === "important" ? n.severity !== "info" : true,
      ),
    [all, filter],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const markRead = (n: Notification) => {
    if (n.read || !state.accessToken) return;
    dispatch({ type: "MARK_NOTIFICATION_READ", id: n.id, all: false });
    // Best-effort: the read state already flipped locally; a failed call is
    // reconciled by the next sync.
    markNotificationRead(state.accessToken, n.id).catch(() => {});
  };

  const open = (n: Notification) => {
    markRead(n);
    if (n.relatedId && n.kind.toLowerCase().includes("task")) {
      router.push(`/tasks/${n.relatedId}` as never);
    }
  };

  const markAll = () => {
    const token = state.accessToken;
    const ids = unread.map((n) => n.id);
    dispatch({ type: "MARK_NOTIFICATION_READ", id: "", all: true });
    // One request, not one per notification (a long-lived account has hundreds).
    if (token && ids.length) markNotificationsRead(token, ids).catch(() => {});
  };

  // Day labels and cards in one flat list, so only what is on screen gets built.
  const rows = useMemo<Row[]>(
    () => groups.flatMap((g) => [{ kind: "label", key: `label-${g.label}`, label: g.label } as Row, ...g.items.map((n) => ({ kind: "item", key: n.id, n }) as Row)]),
    [groups],
  );

  const header = (
    <View>
      <View style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>
            {unread.length === 0 ? "You're all caught up" : `${unread.length >= 100 ? "100+" : unread.length} new`}
          </Text>
          <Text style={styles.summarySub}>
            {unread.length === 0 ? "Nothing needs your attention." : "Tap one to open it."}
          </Text>
        </View>
        {unread.length > 0 && (
          <Pressable accessibilityRole="button" onPress={markAll} style={styles.markAll}>
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const selected = filter === f.value;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen title="Notifications" scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        // The first screenful only; the rest is built as you scroll.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        renderItem={({ item: row, index }) =>
          row.kind === "label" ? (
            <Text style={styles.groupLabel}>{row.label}</Text>
          ) : (
            <NotificationCard n={row.n} order={index} onPress={() => open(row.n)} />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === "all" ? "Nothing yet" : filter === "unread" ? "No unread notifications" : "Nothing important"}
            </Text>
            <Text style={styles.emptySub}>
              New task assignments and updates will show up here as they happen.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

type Row = { kind: "label"; key: string; label: string } | { kind: "item"; key: string; n: Notification };

function NotificationCard({ n, order, onPress }: { n: Notification; order: number; onPress: () => void }) {
  const tone = toneColors(toneOf(n));
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // Cards ease in one after another, capped so a long list does not drag.
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      delay: order < 8 ? order * 45 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, order]);

  const squeeze = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: press },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => squeeze(0.98)}
        onPressOut={() => squeeze(1)}
        style={[
          styles.card,
          { borderColor: n.read ? colors.border : tone.fg + "55" },
          // Unread cards carry a wash of their tone; read ones settle back to a plain card.
          { backgroundColor: n.read ? colors.card : tone.bg },
        ]}
      >
        <View style={[styles.accent, { backgroundColor: n.read ? colors.border : tone.fg }]} />
        <View style={[styles.glow, { backgroundColor: tone.fg + "22" }, n.read && styles.glowRead]}>
          <View style={[styles.bubble, { backgroundColor: tone.bg, borderColor: tone.fg + "66" }]}>
            <Ionicons name={iconFor(n)} size={20} color={tone.fg} />
          </View>
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.text, !n.read && styles.textUnread]} numberOfLines={4}>
            {n.text}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
            <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
            {n.severity !== "info" && (
              <View style={[styles.tag, { backgroundColor: tone.bg, borderColor: tone.fg + "55" }]}>
                <Text style={[styles.tagText, { color: tone.fg }]}>
                  {n.severity === "critical" ? "Urgent" : "Heads up"}
                </Text>
              </View>
            )}
          </View>
        </View>
        {!n.read && <View style={[styles.dot, { backgroundColor: tone.fg }]} />}
      </Pressable>
    </Animated.View>
  );
}

function iconFor(n: Notification): keyof typeof Ionicons.glyphMap {
  const needle = n.kind.toLowerCase();
  if (n.severity === "critical") return "alert-circle";
  if (needle.includes("task")) return "checkmark-circle";
  if (needle.includes("corrective") || needle.includes("incident")) return "flag";
  if (needle.includes("user") || needle.includes("staff")) return "person-add";
  if (n.severity === "warning") return "warning";
  return "information-circle";
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return "Earlier";
}

export function groupByDay(items: Notification[]): { label: string; items: Notification[] }[] {
  const order = ["Today", "Yesterday", "Earlier"];
  const buckets = new Map<string, Notification[]>();
  for (const n of items) buckets.set(dayLabel(n.createdAt), [...(buckets.get(dayLabel(n.createdAt)) ?? []), n]);
  return order.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label)! }));
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    list: { padding: spacing.lg, paddingBottom: spacing.xxl },
    summary: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
    summaryText: { flex: 1 },
    summaryTitle: { fontSize: typography.h1, fontWeight: "700", color: colors.foreground },
    summarySub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    markAll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.round,
      backgroundColor: colors.accent,
    },
    markAllText: { fontSize: typography.small, fontWeight: "600", color: colors.primary },
    chips: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.round,
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextSelected: { color: colors.primaryForeground },
    groupLabel: {
      fontSize: typography.tiny,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      paddingVertical: spacing.md,
      paddingRight: spacing.md,
      paddingLeft: spacing.lg,
      marginBottom: spacing.sm,
      overflow: "hidden",
    },
    accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
    // The bubble sits on a faint halo of its own colour, like the reference.
    glow: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      opacity: 1,
    },
    glowRead: { opacity: 0.55 },
    bubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    textCol: { flex: 1, gap: 6 },
    text: { fontSize: typography.body, color: colors.mutedForeground, lineHeight: 20 },
    textUnread: { color: colors.foreground, fontWeight: "600" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    time: { fontSize: typography.small, color: colors.mutedForeground },
    tag: { marginLeft: spacing.xs, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.round, borderWidth: 1 },
    tagText: { fontSize: typography.tiny, fontWeight: "700" },
    dot: { width: 9, height: 9, borderRadius: 5 },
    empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
    emptyIcon: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    emptySub: { fontSize: typography.body, color: colors.mutedForeground, textAlign: "center", maxWidth: 260 },
  }),
);
