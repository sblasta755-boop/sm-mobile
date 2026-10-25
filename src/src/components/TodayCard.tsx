import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { ProgressBar } from "@/components/ProgressBar";
import type { ActiveProgress } from "@/components/ProgressCard";
import type { StaffBooking } from "@/api/client";
import { bookingTime, dayHeading } from "@/domain/schedule";
import { rankLabel } from "@/domain/gamification";
import { todayRows } from "@/domain/homeTiles";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** One card for what used to be three: the next booking, this week's points, and today's task count.
 * The booking and points rows appear only when their feature is on and has something to say. */
export function TodayCard({
  done,
  total,
  next,
  progress,
  showTasks = true,
}: {
  done?: number;
  total?: number;
  /** Leave out the task count, for screens that have their own. */
  showTasks?: boolean;
  /** The bookings on the person's next booked day, from useUpcomingBooking(). */
  next: StaffBooking[] | null;
  /** This week's progress, from useMyProgress(). */
  progress: ActiveProgress | null;
}) {
  useThemeVersion();
  const first = next?.[0];
  const rows = todayRows({ hasBooking: !!first, hasPoints: !!progress }).filter((r) => showTasks || r !== "tasks");
  if (rows.length === 0) return null;
  const doneCount = done ?? 0;
  const totalCount = total ?? 0;

  return (
    <Card style={styles.card}>
      {rows.map((row, index) => {
        const divider = index > 0 ? styles.divider : null;
        if (row === "booking" && first) {
          return (
            <Pressable key={row} accessibilityRole="button" accessibilityLabel="Open my schedule" style={[styles.row, divider]} onPress={() => router.push("/schedule" as never)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>{first.site.name}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {dayHeading(first.date)} · {bookingTime(first)}
                  {next && next.length > 1 ? ` (+${next.length - 1})` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          );
        }
        if (row === "points" && progress) {
          return (
            <Pressable key={row} accessibilityRole="button" accessibilityLabel="Open my progress" style={[styles.row, divider]} onPress={() => router.push("/progress" as never)}>
              <Ionicons name="trophy-outline" size={18} color={colors.primary} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>{progress.points} points this week</Text>
                <Text style={styles.sub} numberOfLines={1}>{rankLabel(progress.rank, progress.of)}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="flame" size={15} color={colors.warning} />
                <Text style={styles.statText}>{progress.streak}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          );
        }
        return (
          <View key={row} style={[styles.tasks, divider]}>
            <View style={styles.taskLine}>
              <Text style={styles.title}>Task progress</Text>
              <Text style={styles.sub}>{doneCount}/{totalCount} completed</Text>
            </View>
            <ProgressBar value={totalCount ? (doneCount / totalCount) * 100 : 0} />
          </View>
        );
      })}
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { padding: 0, marginBottom: spacing.md, overflow: "hidden", borderRadius: radius.xl },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    text: { flex: 1, minWidth: 0 },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    stat: { flexDirection: "row", alignItems: "center", gap: 3 },
    statText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    tasks: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.xs },
    taskLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  }),
);
