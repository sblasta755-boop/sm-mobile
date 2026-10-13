import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskSearchBar } from "@/components/TaskSearchBar";
import { filterTasks, filtersActive, NO_FILTERS, tagsOf, type TaskFilters } from "@/domain/taskBoard";
import { DateStrip, isSameDay, startOfDay } from "@/components/DateStrip";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { TaskStatus } from "@/types/smartclean";

export default function ShiftsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const [activeGroup, setActiveGroup] = useState("Not started");
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  // Hourly-compliance rounds have their own dedicated screen ("My hourly
  // compliance rounds", reached from Home) rather than showing up here
  // alongside regular cleaning tasks - excluded the same way home.tsx
  // excludes them from its own "Assigned tasks"/progress count.
  //
  // Filtered to the selected day, which this screen previously did not
  // do at all: "My shift" listed every open task ever assigned to this
  // cleaner, so yesterday's unfinished work sat on today's shift with
  // nothing to say it was old. Keyed on scheduledAt - the field that
  // says which day a task is FOR - matching how home.tsx filters its own
  // assigned-tasks list.
  const myTasks = useMemo(
    () =>
      filterTasks(
        state.tasks.filter(
          (t) =>
            t.assigneeId === currentUser?.id &&
            !t.isHourlyCompliance &&
            isSameDay(new Date(t.scheduledAt), selectedDate),
        ),
        filters,
      ),
    [state.tasks, currentUser, selectedDate, filters],
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
    <Screen
      headerContent={
        <DateStrip today={today} selectedDate={selectedDate} onSelect={setSelectedDate} />
      }
    >
      <View style={styles.boardRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/kanban")} style={styles.boardButton}>
          <Ionicons name="albums-outline" size={14} color={colors.foreground} />
          <Text style={styles.boardButtonText}>Board view</Text>
        </Pressable>
      </View>
      <TaskSearchBar filters={filters} onChange={setFilters} availableTags={tagsOf(state.tasks)} />
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
        <Text style={styles.mutedSmall}>
          {active.items.length} task{active.items.length === 1 ? "" : "s"}
        </Text>
      </View>

      {active.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.mutedSmall}>
            {filtersActive(filters)
              ? "No tasks match your search or filters."
              : isSameDay(selectedDate, today)
              ? "Nothing here today."
              : `Nothing on ${selectedDate.toLocaleDateString("en-ZA", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}.`}
          </Text>
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

const styles = themedStyles(() => StyleSheet.create({
  boardRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.sm },
  boardButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  boardButtonText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
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
}));
