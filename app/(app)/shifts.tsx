import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";
import type { TaskStatus } from "@/types/smartclean";

export default function ShiftsScreen() {
  const { state, currentUser } = useSmartClean();
  const [activeGroup, setActiveGroup] = useState("Not started");
  // Hourly-compliance rounds have their own dedicated screen ("My hourly
  // compliance rounds", reached from Home) rather than showing up here
  // alongside regular cleaning tasks - excluded the same way home.tsx
  // excludes them from its own "Assigned tasks"/progress count.
  const myTasks = state.tasks.filter(
    (t) => t.assigneeId === currentUser?.id && !t.isHourlyCompliance,
  );

  const groups = useMemo(() => {
    const inGroup = (statuses: TaskStatus[]) => myTasks.filter((t) => statuses.includes(t.status));
    return [
      { label: "Not started", items: inGroup(["assigned", "not_started", "scheduled"]) },
      { label: "In progress", items: inGroup(["in_progress"]) },
      { label: "Submitted", items: inGroup(["submitted", "awaiting_inspection"]) },
      { label: "Rework", items: inGroup(["rework_required"]) },
      { label: "Completed", items: inGroup(["approved", "closed"]) },
    ];
  }, [myTasks]);
  const active = groups.find((group) => group.label === activeGroup) ?? groups[0];

  return (
    <Screen title="My shift">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsContent}>
        {groups.map((group) => {
          const selected = group.label === active.label;
          return (
            <Pressable
              key={group.label}
              onPress={() => setActiveGroup(group.label)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{group.label}</Text>
              <View style={[styles.count, selected && styles.countSelected]}>
                <Text style={[styles.countText, selected && styles.countTextSelected]}>{group.items.length}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{active.label}</Text>
        <Text style={styles.mutedSmall}>{active.items.length} tasks</Text>
      </View>

      {active.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.mutedSmall}>Nothing here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {active.items.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/tasks/${t.id}`)}>
              <Card style={styles.taskCard}>
                <View style={styles.taskIcon}>
                  <Ionicons name="time-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.mutedSmall} numberOfLines={1}>
                    {t.locationName} • Due {t.dueTime} • {t.estimatedMinutes} min
                  </Text>
                </View>
                <StatusBadge tone={toneForTask(t.status)} label={humanStatus(t.status)} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    marginBottom: spacing.lg,
  },
  tabsContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.mutedForeground,
  },
  tabLabelSelected: {
    color: colors.primaryForeground,
  },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.round,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
  countSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.foreground,
  },
  countTextSelected: {
    color: colors.primaryForeground,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  list: {
    gap: spacing.sm,
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  taskInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  taskTitle: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
});
