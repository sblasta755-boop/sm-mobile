import { useMemo } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { ActiveFiltersBar } from "@/components/ActiveFiltersBar";
import { useTaskFilters } from "@/features/taskFilters";
import { filterTasks } from "@/domain/taskBoard";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ActionTiles } from "@/components/ActionTiles";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskRow } from "@/components/TaskRow";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import { toneForTask, humanStatus } from "@/domain/status";
import { taskDestination } from "@/domain/inspections";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * A supervisor's day: what is waiting to be inspected, and what they
 * have raised that is still open.
 *
 * Built around work SUBMITTED BY OTHERS, not work assigned to this
 * person - which is the whole difference from the cleaner's home screen
 * they used to land on. A supervisor is never a task's assignee, so
 * every "my tasks" list was empty for them.
 */
export default function SuperviseHome() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const wayfindingOn = useHasModule("wayfinding");
  const hasInspections = useHasModule("inspections");
  const hasCorrectiveActions = useHasModule("corrective_actions");
  const hasHourlyCompliance = useHasModule("hourly_compliance");

  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  // Tasks handed in and waiting on a decision. The backend has already
  // scoped these to this supervisor's sites (is_site_scoped), so no
  // client-side site filter is needed or wanted.
  const awaitingReview = useMemo(
    () =>
      state.tasks.filter((task) =>
        ["submitted", "awaiting_inspection"].includes(task.status),
      ),
    [state.tasks],
  );

  // Tasks a manager gave THIS person to do (a "supervisor task"), as opposed
  // to work submitted by others waiting on their review.
  const myTasks = useMemo(
    () =>
      state.tasks.filter(
        (task) =>
          task.assigneeId === currentUser?.id &&
          ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status),
      ),
    [state.tasks, currentUser],
  );

  // The filters set on the task lists apply here too, until they are changed.
  const [taskFilters] = useTaskFilters();
  const shownTasks = useMemo(() => filterTasks(myTasks, taskFilters), [myTasks, taskFilters]);

  const reworkOut = useMemo(
    () => state.tasks.filter((task) => task.status === "rework_required"),
    [state.tasks],
  );

  // "Assigned to me", not "raised by me": CorrectiveAction carries an
  // assigneeId but no raiser - who raised one is only recorded as a name
  // inside `timeline`, which is display text rather than an id to match
  // on. Filtering on it would mean string-matching a human name.
  const myOpenActions = useMemo(
    () =>
      state.correctiveActions.filter(
        (action) => action.status !== "closed" && action.assigneeId === currentUser?.id,
      ),
    [state.correctiveActions, currentUser],
  );

  const noSites = (currentUser?.siteIds?.length ?? 0) === 0;

  return (
    <Screen title="Today">
      {!noSites && (
        <Card padded={false} style={styles.shiftCard}>
          <View style={styles.shiftOverlay}>
            <View style={styles.shiftTopRow}>
              <View style={styles.shiftInfo}>
                <Text style={styles.shiftEyebrow}>Today&apos;s shift</Text>
                {site?.name && (
                  <View style={styles.shiftMetaRow}>
                    <Ionicons name="location" size={11} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.shiftMeta}>{site.name}</Text>
                  </View>
                )}
              </View>
              <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "Clocked in" : "Not clocked in"} />
            </View>

            {!clocked ? (
              <Button icon={<Ionicons name="scan" size={18} color={colors.primaryForeground} />} onPress={() => router.push("/supervise-scan")}>
                Scan site QR to clock in
              </Button>
            ) : (
              <View style={styles.clockedActions}>
                <View style={styles.clockedPill}>
                  <Text style={styles.clockedText}>
                    Clocked in at{" "}
                    {new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Button
                  variant="outline"
                  icon={<Ionicons name="log-out-outline" size={18} color={colors.foreground} />}
                  onPress={() => router.push("/supervise-scan")}
                >
                  Scan site QR to clock out
                </Button>
              </View>
            )}
          </View>
        </Card>
      )}

      {noSites && (
        <Card style={styles.warningCard}>
          <Ionicons name="information-circle" size={20} color={colors.warningForeground} />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>No sites assigned yet</Text>
            <Text style={styles.warningText}>
              You&apos;re not linked to a site yet, so there&apos;s nothing to inspect
              here. Ask your manager to assign you one.
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Text style={styles.tileLabel}>Awaiting review</Text>
          <Text style={styles.tileValue}>{awaitingReview.length}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text style={styles.tileLabel}>Sent for rework</Text>
          <Text style={styles.tileValue}>{reworkOut.length}</Text>
        </Card>
      </View>

      <ActionTiles
        items={[
          { key: "board", label: "Task board", icon: <Ionicons name="albums-outline" size={20} color={colors.primary} />, onPress: () => router.push("/kanban") },
          { key: "report", label: "Management report", icon: <Ionicons name="document-text-outline" size={20} color={colors.primary} />, onPress: () => router.push("/management-report") },
          ...(wayfindingOn
            ? [
                { key: "signs", label: "Wayfinding signs", icon: <Ionicons name="compass-outline" size={20} color={colors.primary} />, onPress: () => router.push("/install-beacon" as never) },
                { key: "walk", label: "Walk a path", icon: <Ionicons name="walk-outline" size={20} color={colors.primary} />, onPress: () => router.push("/patrol-walk" as never) },
              ]
            : []),
        ]}
      />

      <ActiveFiltersBar />

      {myTasks.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My tasks</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/my-tasks")}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          </View>
          {shownTasks.length === 0 && <Text style={styles.muted}>No tasks match your filters.</Text>}
          {shownTasks.slice(0, 3).map((task) => (
            <TaskRow key={task.id} task={task} onPress={() => router.push(`/tasks/${task.id}`)} />
          ))}
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Waiting on you</Text>
        {hasInspections && awaitingReview.length > 0 && (
          <Pressable onPress={() => router.push("/supervise-inspections")}>
            <Text style={styles.link}>View all</Text>
          </Pressable>
        )}
      </View>

      {awaitingReview.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="checkmark-done" size={24} color={colors.success} />
          <Text style={styles.muted}>Nothing waiting to be inspected.</Text>
        </Card>
      ) : (
        awaitingReview.slice(0, 5).map((task) => (
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
                </Text>
              </View>
              <StatusBadge tone={toneForTask(task.status)} label={humanStatus(task.status)} />
            </Card>
          </Pressable>
        ))
      )}

      {hasCorrectiveActions && myOpenActions.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your open actions</Text>
            <Pressable onPress={() => router.push("/supervise-actions")}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          </View>
          {myOpenActions.slice(0, 3).map((action) => (
            <Pressable
              key={action.id}
              onPress={() => router.push(`/corrective-actions/${action.id}`)}
            >
              <Card style={styles.actionCard}>
                <Ionicons name="alert-circle" size={18} color={colors.warningForeground} />
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {action.reason}
                  </Text>
                  <Text style={styles.muted}>
                    Due{" "}
                    {new Date(action.deadline).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.foreground} />
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {hasHourlyCompliance && (
        <Pressable onPress={() => router.push("/hourly-compliance")}>
          <Card style={styles.hourlyCard}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <View style={styles.taskInfo}>
              <Text style={styles.taskTitle}>Hourly compliance</Text>
              <Text style={styles.muted}>Review today&apos;s rounds</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.foreground} />
          </Card>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  shiftCard: {
    marginBottom: spacing.lg,
  },
  shiftOverlay: {
    backgroundColor: "#182531",
    padding: spacing.lg,
    gap: spacing.md,
  },
  shiftTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  shiftInfo: {
    flex: 1,
    minWidth: 0,
  },
  shiftEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.75)",
  },
  shiftMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  shiftMeta: {
    fontSize: typography.tiny,
    color: "rgba(255,255,255,0.8)",
  },
  clockedActions: {
    gap: spacing.sm,
  },
  clockedPill: {
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    padding: spacing.md,
  },
  clockedText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.white,
  },
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    gap: spacing.xs,
  },
  tileLabel: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
    fontWeight: "600",
  },
  tileValue: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  link: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.primary,
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
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderColor: "#efd384",
  },
  hourlyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderColor: colors.primary,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  warningCard: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  warningTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.warningForeground,
  },
  warningText: {
    fontSize: typography.small,
    color: colors.warningForeground,
    lineHeight: 19,
  },
}));
