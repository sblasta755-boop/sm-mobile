import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StaffBooking } from "@/api/client";
import { bookingShifts, bookingTimeParts, mapsUrl, summarizeTasks } from "@/domain/schedule";
import { hexAlpha } from "@/domain/calendarGrid";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const SHOWN = 3;

/** One booking: when and where up top, the people-facing details under it, and the tasks as a short checklist. */
export function BookingCard({
  booking: b,
  showPerson = false,
  onCancel,
}: {
  booking: StaffBooking;
  showPerson?: boolean;
  onCancel?: () => void;
}) {
  useThemeVersion();
  const [all, setAll] = useState(false);
  const time = bookingTimeParts(b);
  const shifts = bookingShifts(b);
  const { rounds, others } = summarizeTasks(b.tasks);
  const rows = all ? others : others.slice(0, SHOWN);
  const hidden = others.length - rows.length;

  return (
    <View style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeMain}>{time.main}</Text>
            {!!time.sub && <Text style={styles.timeSub}>{time.sub}</Text>}
          </View>
          <View style={styles.headText}>
            <Text style={styles.site} numberOfLines={2}>{b.site.name}</Text>
            {showPerson && <Text style={styles.person}>{b.userName}</Text>}
            {!!shifts && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{shifts}</Text>
              </View>
            )}
          </View>
        </View>

        {!!b.site.address && (
          <View style={styles.line}>
            <Ionicons name="location-outline" size={14} color={colors.mutedForeground} style={styles.lineIcon} />
            <Text style={styles.address} numberOfLines={2}>{b.site.address}</Text>
          </View>
        )}

        {!!b.instructions && (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.noteText}>{b.instructions}</Text>
          </View>
        )}

        <View style={styles.tasks}>
          <View style={styles.tasksHead}>
            <Text style={styles.tasksTitle}>Tasks</Text>
            <Text style={styles.count}>{b.tasks.length}</Text>
          </View>
          {b.tasks.length === 0 && <Text style={styles.empty}>No tasks set yet</Text>}
          {rounds && (
            <View style={styles.round}>
              <Ionicons name="time-outline" size={16} color={colors.primary} />
              <View style={styles.roundText}>
                <Text style={styles.taskTitle}>
                  Hourly compliance · {rounds.count} round{rounds.count === 1 ? "" : "s"}
                </Text>
                <Text style={styles.taskMeta}>
                  {rounds.count > 1 ? `${rounds.first} to ${rounds.last}` : rounds.first}
                  {rounds.places.length > 0 ? ` · ${rounds.places.join(", ")}` : ""}
                </Text>
              </View>
            </View>
          )}
          {rows.map((t) => (
            <View key={t.id} style={styles.taskRow}>
              <Ionicons
                name={t.done ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={t.done ? colors.success : colors.mutedForeground}
              />
              <Text style={[styles.taskTitle, t.done && styles.done]} numberOfLines={2}>{t.title}</Text>
            </View>
          ))}
          {others.length > SHOWN && (
            <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} hitSlop={8}>
              <Text style={styles.more}>{all ? "Show fewer" : `Show ${hidden} more`}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Directions to ${b.site.name}`} onPress={() => void Linking.openURL(mapsUrl(b.site))} style={styles.directions}>
            <Ionicons name="navigate" size={14} color={colors.primary} />
            <Text style={styles.directionsText}>Directions</Text>
          </Pressable>
          {onCancel && (
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel booking</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    accent: { width: 5, backgroundColor: colors.primary },
    body: { flex: 1, padding: spacing.lg, gap: spacing.md },
    top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    timeBlock: { minWidth: 72, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: hexAlpha(colors.primary, 0.1), alignItems: "center" },
    timeMain: { fontSize: typography.h2, fontWeight: "800", color: colors.primary },
    timeSub: { fontSize: typography.small, color: colors.primary, opacity: 0.85 },
    headText: { flex: 1, gap: 4 },
    site: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    person: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round, backgroundColor: colors.muted },
    badgeText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    line: { flexDirection: "row", gap: 6 },
    lineIcon: { marginTop: 1 },
    address: { flex: 1, fontSize: typography.small, lineHeight: 17, color: colors.mutedForeground },
    note: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: hexAlpha(colors.primary, 0.08) },
    noteText: { flex: 1, fontSize: typography.small, lineHeight: 18, color: colors.foreground },
    tasks: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    tasksHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    tasksTitle: { fontSize: typography.small, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase", color: colors.mutedForeground },
    count: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground, paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.round, backgroundColor: colors.muted, overflow: "hidden" },
    empty: { fontSize: typography.small, color: colors.mutedForeground },
    round: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.muted },
    roundText: { flex: 1, gap: 2 },
    taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    taskTitle: { flex: 1, fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    taskMeta: { fontSize: typography.small, lineHeight: 17, color: colors.mutedForeground },
    done: { textDecorationLine: "line-through", color: colors.mutedForeground },
    more: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    directions: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.round, borderWidth: 1, borderColor: colors.primary },
    directionsText: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    cancel: { paddingVertical: spacing.sm },
    cancelText: { fontSize: typography.small, fontWeight: "700", color: colors.destructive },
  }),
);
