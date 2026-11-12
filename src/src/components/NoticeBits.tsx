import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Notice, NoticeCalendarEntry } from "@/api/client";
import { categoryMeta } from "@/domain/noticeboard";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

export const ago = (iso: string | null) => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
};

export function CategoryTag({ category, pinned }: { category: string; pinned?: boolean }) {
  useThemeVersion();
  const meta = categoryMeta(category);
  return (
    <View style={styles.tagRow}>
      <Ionicons name={(pinned ? "pin-outline" : meta.icon) as keyof typeof Ionicons.glyphMap} size={13} color={meta.color} />
      <Text style={[styles.tag, { color: meta.color }]}>
        {meta.label.toUpperCase()}
        {pinned ? " · PINNED" : ""}
      </Text>
    </View>
  );
}

export function WhenPill({ text }: { text: string }) {
  useThemeVersion();
  if (!text) return null;
  return (
    <View style={styles.when}>
      <Ionicons name="calendar-outline" size={13} color={colors.primary} />
      <Text style={styles.whenText}>{text}</Text>
    </View>
  );
}

/** One notice in the list: colour bar, kind, title, a line of the detail, when it applies and what needs doing. */
export function NoticeCard({ notice, compact, onPress }: { notice: Notice; compact?: boolean; onPress: () => void }) {
  useThemeVersion();
  const meta = categoryMeta(notice.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notice.title}${notice.read ? "" : ", unread"}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: meta.color }, notice.pinned && styles.pinned, pressed && styles.pressed]}
    >
      {!notice.read && <View style={styles.dot} />}
      <CategoryTag category={notice.category} pinned={notice.pinned} />
      <Text style={styles.title}>{notice.title}</Text>
      {!compact && !!notice.body && (
        <Text style={styles.body} numberOfLines={2}>
          {notice.body}
        </Text>
      )}
      <View style={styles.meta}>
        <WhenPill text={notice.whenText} />
        {notice.needsAck && <Text style={[styles.badge, styles.badgeRed]}>Needs your ack</Text>}
        {notice.status === "draft" && <Text style={styles.badge}>Draft</Text>}
        {notice.status === "cancelled" && <Text style={[styles.badge, styles.badgeRed]}>Cancelled</Text>}
        {notice.canManage && notice.status === "published" && notice.recipientCount != null && (
          <Text style={styles.small}>
            {notice.requiresAck ? `${notice.ackCount ?? 0} / ${notice.recipientCount} acknowledged` : `${notice.readCount ?? 0} / ${notice.recipientCount} read`}
          </Text>
        )}
        <Text style={styles.small}>
          {notice.authorName} · {ago(notice.publishedAt ?? notice.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

/** A notice on a day of the Schedule: the title and time, opening the notice. */
export function NoticeChips({ entries, onOpen }: { entries: NoticeCalendarEntry[] | undefined; onOpen: (id: string) => void }) {
  useThemeVersion();
  if (!entries?.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map((e) => {
        const meta = categoryMeta(e.category);
        return (
          <Pressable key={`${e.id}-${e.date}`} accessibilityRole="button" onPress={() => onOpen(e.id)} style={[styles.chip, { borderLeftColor: meta.color }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.tagRow}>
                <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={13} color={meta.color} />
                <Text style={[styles.tag, { color: meta.color }]}>NOTICEBOARD</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>
                {e.title}
                {e.startTime ? ` · ${e.startTime}` : ""}
              </Text>
            </View>
            {(!e.read || e.needsAck) && <Text style={[styles.badge, styles.badgePrimary]}>{e.needsAck ? "Needs ack" : "New"}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    tagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    tag: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
    when: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: colors.muted },
    whenText: { fontSize: typography.tiny, fontWeight: "700", color: colors.primary },
    card: { backgroundColor: colors.card, borderWidth: 1, borderLeftWidth: 4, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.md, gap: 4, marginBottom: spacing.sm },
    pinned: { backgroundColor: colors.muted },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    dot: { position: "absolute", right: 12, top: 14, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground, paddingRight: 16 },
    body: { fontSize: typography.small, color: colors.mutedForeground },
    meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: 4 },
    small: { fontSize: typography.tiny, color: colors.mutedForeground },
    badge: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, backgroundColor: colors.muted, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, overflow: "hidden" },
    badgeRed: { color: colors.destructive },
    badgePrimary: { color: colors.primary },
    chip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.card, borderWidth: 1, borderLeftWidth: 4, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.md },
  }),
);
