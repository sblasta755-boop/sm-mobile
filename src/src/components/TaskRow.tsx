import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { humanStatus, toneForTask } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";
import type { Task } from "@/types/smartclean";

/**
 * One task in a list. Every list of tasks uses this, so a task looks the same
 * wherever it appears. A task that is not an ordinary cleaning task - done by
 * a supervisor, or for the whole site - gets a small marker and nothing else
 * about the card changes.
 */
export function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="cube-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {task.locationName ?? "Whole site"} • Due {task.dueTime}
          </Text>
        </View>
        <View style={styles.badges}>
          <StatusBadge tone={toneForTask(task.status)} label={humanStatus(task.status)} />
          {task.priority === "high" && <StatusBadge tone="destructive" label="Priority" />}
          {task.isSupervisorTask && <StatusBadge tone="info" label="Supervisor task" />}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  meta: { fontSize: typography.small, color: colors.mutedForeground },
  badges: { alignItems: "flex-end", gap: 4 },
});
