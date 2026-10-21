import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from "react-native";
import { Screen } from "@/components/Screen";
import { useTaskFilters } from "@/features/taskFilters";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskSearchBar } from "@/components/TaskSearchBar";
import { TagChips } from "@/components/TagChip";
import { useSmartClean } from "@/features/store";
import { taskDestination } from "@/domain/inspections";
import { boardColumns, filterTasks, isOverdue, tagsOf } from "@/domain/taskBoard";
import { isOnToday } from "@/domain/todayFocus";
import { useNow } from "@/features/useNow";
import { usePullToRefresh } from "@/features/pullRefresh";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The same tasks as My shift, laid out as a board: one column per stage,
 * left to right. Read-only - a task moves by being worked on, not by
 * dragging - and every card opens the task. A supervisor sees every task at
 * their sites and can narrow to their own.
 */
export default function KanbanScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const { width } = useWindowDimensions();
  // Shared across screens and kept until the person changes it (features/taskFilters).
  const [filters, setFilters] = useTaskFilters();
  const isSupervisor = currentUser?.role === "supervisor";
  const [mineOnly, setMineOnly] = useState(!isSupervisor);
  // Today's work by default: earlier days are locked records, not things to act
  // on, so they only appear when asked for.
  const [allDays, setAllDays] = useState(false);
  const now = useNow();
  const { refreshing, onRefresh } = usePullToRefresh();

  const tasks = useMemo(
    () =>
      state.tasks.filter(
        (task) =>
          !task.isHourlyCompliance &&
          (!mineOnly || task.assigneeId === currentUser?.id) &&
          (allDays || isOnToday(task, now)),
      ),
    [state.tasks, mineOnly, currentUser, allDays, now],
  );
  const nameOf = (id: string) => state.users.find((user) => user.id === id)?.name ?? "";
  const visible = useMemo(
    () => filterTasks(tasks, filters, (task) => nameOf(task.assigneeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, filters, state.users],
  );
  const columns = boardColumns(visible);
  // One column fills most of the phone at a time; the rest scroll sideways.
  const columnWidth = Math.min(320, Math.round(width * 0.8));

  return (
    <Screen title="Task board" scroll={false}>
      <View style={styles.top}>
        <TaskSearchBar filters={filters} onChange={setFilters} availableTags={tagsOf(tasks)} />
        <View style={styles.dayRow}>
          {[
            { value: false, label: "Today" },
            { value: true, label: "All days" },
          ].map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected: allDays === option.value }}
              onPress={() => setAllDays(option.value)}
              style={[styles.dayChip, allDays === option.value && styles.dayChipOn]}
            >
              <Text style={[styles.dayChipText, allDays === option.value && styles.dayChipTextOn]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {isSupervisor && (
          <View style={styles.mineRow}>
            <Switch value={mineOnly} onValueChange={setMineOnly} />
            <Text style={styles.mineText}>Only tasks assigned to me</Text>
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={columnWidth + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={styles.board}
      >
        {columns.map(({ column, items }) => (
          <View key={column.key} style={[styles.column, { width: columnWidth }]}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>{column.label}</Text>
              <View style={styles.count}>
                <Text style={styles.countText}>{items.length}</Text>
              </View>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cards}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            >
              {items.length === 0 ? (
                <Text style={styles.empty}>Nothing here.</Text>
              ) : (
                items.map((task) => (
                  <Pressable key={task.id} onPress={() => router.push(taskDestination(task, currentUser, state.inspections) as never)}>
                    <Card style={styles.card}>
                      <Text style={styles.cardTitle}>{task.title}</Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {task.locationName ?? "Whole site"} • Due {task.dueTime}
                      </Text>
                      <TagChips tags={task.tags} />
                      {isSupervisor && !mineOnly && (
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {nameOf(task.assigneeId)}
                        </Text>
                      )}
                      <View style={styles.badges}>
                        {task.priority === "high" && <StatusBadge tone="destructive" label="Priority" />}
                        {isOverdue(task) && <StatusBadge tone="warning" label="Overdue" />}
                        {task.isSupervisorTask && <StatusBadge tone="info" label="Supervisor task" />}
                      </View>
                    </Card>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  dayRow: { flexDirection: "row", gap: 6, marginBottom: spacing.sm },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
  dayChipTextOn: { color: colors.primaryForeground },
  mineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  mineText: { fontSize: typography.small, color: colors.foreground },
  board: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  column: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.sm,
    maxHeight: "100%",
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  columnTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 10, fontWeight: "700", color: colors.foreground },
  cards: { gap: spacing.sm, paddingBottom: spacing.sm },
  card: { gap: 2 },
  cardTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: typography.small, color: colors.mutedForeground },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.xs },
  empty: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
    padding: spacing.md,
  },
}));
