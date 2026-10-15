import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { useTaskFilters } from "@/features/taskFilters";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskSearchBar } from "@/components/TaskSearchBar";
import { Button } from "@/components/Button";
import { TagChips } from "@/components/TagChip";
import { DateStrip, startOfDay } from "@/components/DateStrip";
import { SelectField } from "@/components/SelectField";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { taskDestination } from "@/domain/inspections";
import { matchesInspectionFilters } from "@/domain/inspectionFilters";
import { filterTasks, filtersActive, NO_FILTERS, tagsOf } from "@/domain/taskBoard";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
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
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].label);
  // Shared across screens and kept until the person changes it (features/taskFilters).
  const [filters, setFilters] = useTaskFilters();
  // Narrow to one cleaner and/or the day the work was submitted.
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const moreFilters = !!cleanerId || !!day;
  const nameOf = (id: string) => state.users.find((user) => user.id === id)?.name ?? "";

  // Search and filters apply to every tab, so the counts show what matches.
  const groups = useMemo(() => {
    const matching = filterTasks(
      state.tasks.filter(
        (task) => !task.isHourlyCompliance && matchesInspectionFilters(task, cleanerId, day),
      ),
      filters,
      (task) => nameOf(task.assigneeId),
    );
    return GROUPS.map((group) => ({
      ...group,
      items: matching.filter((task) => group.statuses.includes(task.status)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tasks, filters, state.users, cleanerId, day]);

  // Only people who actually have work to inspect are offered.
  const cleaners = useMemo(() => {
    const ids = new Set(state.tasks.filter((t) => !t.isHourlyCompliance).map((t) => t.assigneeId));
    return state.users.filter((u) => ids.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.tasks, state.users]);

  const active = groups.find((group) => group.label === activeGroup) ?? groups[0];

  return (
    <Screen title="Inspections">
      <View style={styles.topRow}>
        <Button
          variant="outline"
          fullWidth={false}
          icon={<Ionicons name="albums-outline" size={16} color={colors.foreground} />}
          onPress={() => router.push("/kanban")}
        >
          Board view
        </Button>
      </View>
      <TaskSearchBar
        filters={filters}
        onChange={setFilters}
        placeholder="Search inspections"
        availableTags={tagsOf(state.tasks)}
      />
      <View style={styles.more}>
        <SelectField
          label="Cleaner"
          value={cleaners.find((u) => u.id === cleanerId)?.name ?? "All cleaners"}
          options={["All cleaners", ...cleaners.map((u) => u.name)]}
          onChange={(name) => setCleanerId(cleaners.find((u) => u.name === name)?.id ?? null)}
        />
        {day ? (
          <View style={styles.dayBox}>
            <DateStrip today={startOfDay(new Date())} selectedDate={day} onSelect={setDay} />
            <Pressable accessibilityRole="button" onPress={() => setDay(null)}>
              <Text style={styles.clear}>Any date</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" style={styles.dateButton} onPress={() => setDay(startOfDay(new Date()))}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.dateButtonText}>Pick a submitted date</Text>
          </Pressable>
        )}
      </View>
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
          <Text style={styles.muted}>
            {filtersActive(filters) || moreFilters
              ? `No matches in “${active.label}”.`
              : `Nothing in “${active.label}”.`}
          </Text>
          {(filtersActive(filters) || moreFilters) && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFilters(NO_FILTERS);
                setCleanerId(null);
                setDay(null);
              }}
            >
              <Text style={styles.clear}>Clear search and filters</Text>
            </Pressable>
          )}
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
                  {task.locationName ?? "Whole site"}
                  {nameOf(task.assigneeId) ? ` \u2022 ${nameOf(task.assigneeId)}` : ""}
                  {task.dueTime ? ` \u2022 Due ${task.dueTime}` : ""}
                </Text>
                <TagChips tags={task.tags} />
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
  more: { gap: spacing.sm, marginBottom: spacing.md },
  dayBox: { alignItems: "center", gap: spacing.xs },
  dateButton: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", paddingVertical: spacing.xs },
  dateButtonText: { fontSize: typography.small, fontWeight: "600", color: colors.primary },
  topRow: { alignItems: "flex-end", marginBottom: spacing.sm },
  clear: { fontSize: typography.small, fontWeight: "600", color: colors.primary, marginTop: spacing.xs },
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
