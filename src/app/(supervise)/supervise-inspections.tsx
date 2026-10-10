import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { taskDestination } from "@/domain/inspections";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import type { TaskStatus } from "@/types/smartclean";

/**
 * Work submitted by cleaners, grouped by what the supervisor needs to do
 * with it.
 *
 * Deliberately the same grouped-tabs shape as the cleaner's shifts
 * screen, because it answers the same question from the other side -
 * but the groups are review states, not personal progress states, and
 * the rows are other people's work rather than your own.
 */
const GROUPS: { label: string; statuses: TaskStatus[] }[] = [
  { label: "To review", statuses: ["submitted", "awaiting_inspection"] },
  { label: "Sent back", statuses: ["rework_required"] },
  { label: "In progress", statuses: ["in_progress"] },
  { label: "Approved", statuses: ["approved", "closed"] },
];

export default function SuperviseInspections() {
  const { state, currentUser } = useSmartClean();
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].label);

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: state.tasks.filter((task) => group.statuses.includes(task.status)),
      })),
    [state.tasks],
  );

  const active = groups.find((group) => group.label === activeGroup) ?? groups[0];

  return (
    <Screen title="Inspections">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={styles.tabsContent}
      >
        {groups.map((group) => {
          const selected = group.label === active.label;
          return (
            <Pressable
              key={group.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setActiveGroup(group.label)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                {group.label}
              </Text>
              <View style={[styles.count, selected && styles.countSelected]}>
                <Text style={[styles.countText, selected && styles.countTextSelected]}>
                  {group.items.length}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {active.items.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="checkmark-done" size={24} color={colors.success} />
          <Text style={styles.muted}>Nothing in &ldquo;{active.label}&rdquo;.</Text>
        </Card>
      ) : (
        active.items.map((task) => (
          <Pressable key={task.id} onPress={() => router.push(taskDestination(task, currentUser, state.inspections) as never)}>
            <Card style={styles.taskCard}>
              <View style={styles.taskIcon}>
                <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {task.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {task.locationName}
                  {task.dueTime ? ` • Due ${task.dueTime}` : ""}
                </Text>
              </View>
              <StatusBadge tone={toneForTask(task.status)} label={humanStatus(task.status)} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  tabsRow: {
    marginBottom: spacing.md,
    flexGrow: 0,
  },
  tabsContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  tabLabelSelected: {
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.round,
    backgroundColor: colors.secondary,
    alignItems: "center",
  },
  countSelected: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.mutedForeground,
  },
  countTextSelected: {
    color: colors.primaryForeground,
  },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  taskIcon: {
    width: 38,
    height: 38,
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
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
