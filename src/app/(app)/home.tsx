import { useState } from "react";
import { router } from "expo-router";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useMyProgress } from "@/components/ProgressCard";
import { useUpcomingBooking } from "@/components/UpcomingBookingCard";
import { TodayCard } from "@/components/TodayCard";
import { ActionTiles } from "@/components/ActionTiles";
import { ActiveFiltersBar } from "@/components/ActiveFiltersBar";
import { useTaskFilters } from "@/features/taskFilters";
import { focusTasks } from "@/domain/todayFocus";
import { homeTaskView } from "@/domain/homeTasks";
import { homeTiles } from "@/domain/homeTiles";
import { useLeaveOn } from "@/features/leave";
import { useAutoClockStatus } from "@/features/geofenceClock";
import { useScheduleOn } from "@/features/schedule";
import { useNow } from "@/features/useNow";
import { StatusBadge } from "@/components/StatusBadge";
import { TaskRow } from "@/components/TaskRow";
import { DateStrip, isSameDay } from "@/components/DateStrip";
import { useDaySelection } from "@/features/useDaySelection";
import { useHasCapability, useHasModule } from "@/features/modules";
import { clockIn as clockInRequest, clockOut as clockOutRequest } from "@/api/client";
import { getCurrentCoords } from "@/services/geolocation";
import { fileUrl } from "@/api/client";
import { useStaffRole } from "@/features/roles";
import { useCanOpenStock } from "@/features/stock";
import { useSmartClean } from "@/features/store";
import { hexAlpha } from "@/domain/calendarGrid";
import { colors, radius, spacing, typography, themedStyles, status, useThemeVersion } from "@/theme";
import { appAlert } from "@/components/Dialog";

/** The most tasks "Do now" lists. The rest are one tap away under View all. */
const MAX_DO_NOW = 4;

export default function HomeScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, refreshBackendData } = useSmartClean();
  const staffRole = useStaffRole();
  // Entry points to the three gateable screens a cleaner can reach.
  // Hiding them is presentation only - the server 402s these routes for
  // an organisation whose plan excludes them - but offering a button
  // that can only fail is worse than not offering it. All three fail
  // open until bootstrap lands; see useHasModule.
  const hasHourlyCompliance = useHasModule("hourly_compliance");
  const hasCorrectiveActions = useHasModule("corrective_actions");
  const hasIncidents = useHasModule("incidents");
  const scheduleOn = useScheduleOn();
  const leaveOn = useLeaveOn();
  const nextBooking = useUpcomingBooking();
  const progress = useMyProgress();
  // Stock is offered only to staff roles the organisation has switched on.
  const canOpenStock = useCanOpenStock();
  // How this organisation lets people clock. Defaults (before bootstrap, or
  // from an older backend) are the original QR-only flow - see
  // useHasCapability. Presentation only; the server authorises the method.
  const hasAttendance = useHasModule("attendance");
  const canScanClock = useHasCapability("qr_attendance");
  const canManualClock = useHasCapability("manual_attendance");
  const canGeofenceClock = useHasCapability("geofence_attendance");
  const hasQr = useHasCapability("qr_codes");
  const [clocking, setClocking] = useState(false);
  // Today, and the day being looked at; both reset to today whenever the screen is opened or midnight passes.
  const { today, selectedDate, setSelectedDate } = useDaySelection();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const supervisor = state.users.find((u) => u.id === site?.supervisorId);
  // Hourly-compliance rounds get their own dedicated list/tab (see
  // candidateRounds below and the "My hourly compliance rounds" banner) -
  // excluded here so they don't double up in "Assigned tasks" and skew
  // the "Task progress" done/total count with rounds that already have
  // their own place to live.
  const allMyTasks = state.tasks.filter(
    (t) => t.assigneeId === currentUser?.id && !t.isHourlyCompliance,
  );
  // Hourly-compliance rounds where this user is a named candidate but
  // isn't the current assignee - either still open for them to claim
  // (scan the room QR first) or already claimed by someone else. Kept
  // separate from allMyTasks/myTasks below rather than mixed in, since
  // they're not this user's own work and would corrupt the
  // "done/total" progress count that list drives. Mirrors the web
  // app's mobile.home.tsx.
  const candidateRounds = state.tasks.filter(
    (t) =>
      t.isHourlyCompliance &&
      t.assigneeId !== currentUser?.id &&
      (t.hourlyComplianceCandidateIds ?? []).includes(currentUser?.id ?? "") &&
      // Once the window closes nobody can claim it any more (backend
      // rejects the write), so an unclaimed round just becomes stale
      // clutter here - drop it instead of leaving "Not yet claimed -
      // first to scan wins" up for a slot that's long over.
      !t.hourlyComplianceLocked,
  );
  // Selecting a date on DateStrip narrows "Assigned tasks" down to that
  // day - previously the strip's own selectedDate never left the
  // component, so tapping a date visibly moved the selector but changed
  // nothing else on screen (mirrors the same fix on the web app's
  // mobile.home.tsx).
  const myTasks = allMyTasks.filter((t) => isSameDay(new Date(t.scheduledAt), selectedDate));
  const done = myTasks.filter((t) => ["approved", "closed"].includes(t.status)).length;
  // The filters set on the task lists apply to this list too, until they are changed.
  const [taskFilters] = useTaskFilters();
  // For today, the list is what can be acted on right now, most pressing first
  // (work under way, overdue, then due or starting soon); finished work and
  // tasks for later stay off it. Another day picked on the strip lists that day.
  const now = useNow();
  const viewingToday = isSameDay(selectedDate, today);
  const focus = viewingToday ? focusTasks(allMyTasks, now) : myTasks;
  // A saved filter can narrow what is due, but never hides it without saying so (see homeTasks.ts).
  const taskView = homeTaskView(focus, taskFilters);
  const shownTasks = taskView.list;
  const openCA = state.correctiveActions.filter(
    (c) => c.assigneeId === currentUser?.id && c.status !== "closed",
  );
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  // Clock in/out without scanning, for organisations whose policy allows
  // the "manual" or "geofence" method. A geofence clock-in is the same
  // request with the device position, which the server checks against the
  // site; a manual one records the site selection only. The server decides
  // whether the method is permitted - this just makes the request.
  async function clockWithoutScan(direction: "in" | "out") {
    if (!state.accessToken || !site) return;
    setClocking(true);
    try {
      const method = canManualClock ? "manual" : "geofence";
      const coords = method === "geofence" || state.subscription?.policy?.attendance.requireGeofence
        ? await getCurrentCoords()
        : null;
      const payload = {
        siteId: site.id,
        method,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      } as const;
      if (direction === "in") await clockInRequest(state.accessToken, payload);
      else await clockOutRequest(state.accessToken, payload);
      await refreshBackendData();
    } catch (error) {
      appAlert(
        direction === "in" ? "Could not clock in" : "Could not clock out",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setClocking(false);
    }
  }
  const canClockWithoutScan = canManualClock || canGeofenceClock;
  const autoClock = useAutoClockStatus();
  // The image card is always there. Only the clocking parts of it (the status
  // badge and the buttons) go when this organisation does not clock people in this way.
  const showClockControls = hasAttendance && ((canScanClock && hasQr) || canClockWithoutScan);

  return (
    <Screen
      headerContent={
        <DateStrip today={today} selectedDate={selectedDate} onSelect={setSelectedDate} />
      }
    >
      <Card padded={false} style={styles.shiftCard}>
        <ImageBackground
          source={
            staffRole?.homeImageUrl
              ? { uri: fileUrl(staffRole.homeImageUrl) ?? staffRole.homeImageUrl }
              : staffRole?.template === "table_service"
                ? require("../../assets/shift-clock-in-waiter.png")
                : require("../../assets/shift-clock-in.png")
          }
          style={styles.shiftOverlay}
          imageStyle={styles.shiftImage}
        >
          <LinearGradient
            colors={[hexAlpha(colors.shiftBackground, 0.9), hexAlpha(colors.shiftBackground, 0.6), hexAlpha(colors.shiftBackground, 0)]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.shiftTopRow}>
            <View style={styles.shiftInfo}>
              <Text style={styles.shiftEyebrow}>{staffRole?.homeTitle || "Today's shift"}</Text>
              <Text style={styles.shiftTime}>
                {site?.workingHours ? `${site.workingHours.start} - ${site.workingHours.end}` : "07:00 - 16:00"}
              </Text>
              <View style={styles.shiftMetaRow}>
                <Ionicons name="location" size={11} color={hexAlpha(colors.shiftForeground, 0.8)} />
                <Text style={styles.shiftMeta}>{site?.name}</Text>
              </View>
              {supervisor && <Text style={styles.shiftMeta}>Supervisor: {supervisor.name}</Text>}
            </View>
            {showClockControls && (
              <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "Clocked in" : "Not clocked in"} />
            )}
          </View>

          {!showClockControls ? null : !clocked ? (
            <View style={styles.clockedActions}>
              {canScanClock && hasQr && (
                <Button icon={<Ionicons name="scan" size={18} color={colors.primaryForeground} />} onPress={() => router.push("/scan")}>
                  Scan site QR to clock in
                </Button>
              )}
              {canClockWithoutScan && (
                <Button
                  variant={canScanClock && hasQr ? "outline" : undefined}
                  disabled={clocking || !site}
                  onPress={() => clockWithoutScan("in")}
                >
                  Clock in
                </Button>
              )}
            </View>
          ) : (
            <View style={styles.clockedActions}>
              <View style={styles.clockedPill}>
                <Text style={styles.clockedText}>
                  Clocked in at{" "}
                  {new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
              {canScanClock && hasQr && (
                <Button
                  variant="outline"
                  icon={<Ionicons name="log-out-outline" size={18} color={colors.foreground} />}
                  onPress={() => router.push("/scan")}
                >
                  Scan site QR to clock out
                </Button>
              )}
              {canClockWithoutScan && (
                <Button variant="outline" disabled={clocking} onPress={() => clockWithoutScan("out")}>
                  Clock out
                </Button>
              )}
            </View>
          )}
        </ImageBackground>
      </Card>

      {autoClock.enabled && autoClock.permission !== "always" && (
        <Pressable accessibilityRole="button" onPress={() => router.push("/location-always" as never)} style={styles.autoClockNotice}>
          <Ionicons name="location-outline" size={18} color={colors.warningForeground} />
          <Text style={styles.autoClockText}>
            Your site clocks you out when you leave. Allow location all the time so it works with the app closed.
          </Text>
        </Pressable>
      )}

      <TodayCard done={done} total={myTasks.length} next={nextBooking} progress={progress} />

      {/* At most four shortcuts, the rest behind More. What needs attention (rounds to claim, open
          corrective actions) is shown first. See ActionTiles and domain/homeTiles.ts. */}
      <ActionTiles
        items={homeTiles({
          hourlyCompliance: hasHourlyCompliance,
          roundsToClaim: candidateRounds.filter((t) => !t.hourlyComplianceClaimed).length,
          correctiveActions: hasCorrectiveActions,
          openCorrective: { count: openCA.length, onlyId: openCA.length === 1 ? openCA[0].id : undefined },
          stock: canOpenStock,
          incidents: hasIncidents,
          hasQr,
          schedule: scheduleOn,
          leave: leaveOn,
          progress: !!progress,
        }).map((tile) => ({
          key: tile.key,
          label: tile.label,
          badge: tile.badge,
          hint: tile.hint,
          icon:
            tile.key === "incident" ? (
              <BrokenGlassIcon size={22} color={colors.primary} />
            ) : (
              <Ionicons name={tile.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.primary} />
            ),
          onPress: () => router.push(tile.action.path as never),
        }))}
      />

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>
          {viewingToday ? "Do now" : "Assigned tasks"}
          {!isSameDay(selectedDate, today)
            ? ` - ${selectedDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
            : ""}
        </Text>
        <View style={styles.boardLinks}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/kanban")}>
            <Text style={styles.link}>Board</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/shifts")}>
            <Text style={styles.link}>{shownTasks.length > MAX_DO_NOW ? `View all ${shownTasks.length}` : "View all"}</Text>
          </Pressable>
        </View>
      </View>
      <ActiveFiltersBar hiddenCount={taskView.hiddenCount} relaxed={taskView.relaxed} scope={viewingToday ? "due now" : "on this day"} />
      {focus.length === 0 && (
        <Text style={styles.emptyTasks}>
          {viewingToday ? "Nothing to do right now. You're all caught up." : "No tasks assigned for this day."}
        </Text>
      )}
      {focus.length > 0 && shownTasks.length === 0 && (
        <Text style={styles.emptyTasks}>No tasks match your filters.</Text>
      )}
      <View style={styles.list}>
        {shownTasks.slice(0, MAX_DO_NOW).map((t) => (
          <TaskRow key={t.id} task={t} onPress={() => router.push(`/tasks/${t.id}`)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  boardLinks: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  autoClockNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
  },
  autoClockText: { flex: 1, fontSize: typography.small, color: colors.warningForeground },
  shiftCard: {
    marginBottom: spacing.lg,
  },
  shiftOverlay: {
    backgroundColor: colors.shiftBackground,
    padding: spacing.lg,
    minHeight: 190,
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  shiftImage: {
    resizeMode: "cover",
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
    color: hexAlpha(colors.shiftForeground, 0.75),
  },
  shiftTime: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.shiftForeground,
    marginTop: 2,
  },
  shiftMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  shiftMeta: {
    fontSize: typography.tiny,
    color: hexAlpha(colors.shiftForeground, 0.8),
  },
  clockedActions: {
    gap: spacing.sm,
  },
  clockedPill: {
    borderRadius: radius.lg,
    backgroundColor: hexAlpha(colors.shiftForeground, 0.15),
    borderWidth: 1,
    borderColor: hexAlpha(colors.shiftForeground, 0.2),
    padding: spacing.md,
  },
  clockedText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.shiftForeground,
  },
  progressCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  link: {
    fontSize: typography.small,
    color: colors.primary,
    fontWeight: "600",
  },
  emptyTasks: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    textAlign: "center",
    fontSize: typography.small,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
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
    width: 44,
    height: 44,
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
  taskBadges: {
    alignItems: "flex-end",
    gap: 4,
  },
  hourlyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderColor: colors.primary,
  },
  caSection: {
    marginTop: spacing.lg,
  },
  caSectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.warningForeground,
    marginBottom: spacing.sm,
  },
  caCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderColor: status.warning.border,
  },
  quickActions: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
}));
