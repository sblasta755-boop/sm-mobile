import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Alert, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { DateStrip, isSameDay, startOfDay } from "@/components/DateStrip";
import { useHasCapability, useHasModule } from "@/features/modules";
import { clockIn as clockInRequest, clockOut as clockOutRequest } from "@/api/client";
import { getCurrentCoords } from "@/services/geolocation";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";

export default function HomeScreen() {
  const { state, currentUser, refreshBackendData } = useSmartClean();
  // Entry points to the three gateable screens a cleaner can reach.
  // Hiding them is presentation only - the server 402s these routes for
  // an organisation whose plan excludes them - but offering a button
  // that can only fail is worse than not offering it. All three fail
  // open until bootstrap lands; see useHasModule.
  const hasHourlyCompliance = useHasModule("hourly_compliance");
  const hasCorrectiveActions = useHasModule("corrective_actions");
  const hasIncidents = useHasModule("incidents");
  // How this organisation lets people clock. Defaults (before bootstrap, or
  // from an older backend) are the original QR-only flow - see
  // useHasCapability. Presentation only; the server authorises the method.
  const hasAttendance = useHasModule("attendance");
  const canScanClock = useHasCapability("qr_attendance");
  const canManualClock = useHasCapability("manual_attendance");
  const canGeofenceClock = useHasCapability("geofence_attendance");
  const hasQr = useHasCapability("qr_codes");
  const [clocking, setClocking] = useState(false);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
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
      Alert.alert(
        direction === "in" ? "Could not clock in" : "Could not clock out",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setClocking(false);
    }
  }
  const canClockWithoutScan = canManualClock || canGeofenceClock;

  return (
    <Screen
      headerContent={
        <DateStrip today={today} selectedDate={selectedDate} onSelect={setSelectedDate} />
      }
    >
      {hasAttendance && (
      <Card padded={false} style={styles.shiftCard}>
        <ImageBackground
          source={
            currentUser?.role === "waiter"
              ? require("../../assets/shift-clock-in-waiter.png")
              : require("../../assets/shift-clock-in.png")
          }
          style={styles.shiftOverlay}
          imageStyle={styles.shiftImage}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.85)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0)"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.shiftTopRow}>
            <View style={styles.shiftInfo}>
              <Text style={styles.shiftEyebrow}>Today&apos;s shift</Text>
              <Text style={styles.shiftTime}>
                {site?.workingHours ? `${site.workingHours.start} - ${site.workingHours.end}` : "07:00 - 16:00"}
              </Text>
              <View style={styles.shiftMetaRow}>
                <Ionicons name="location" size={11} color="rgba(255,255,255,0.8)" />
                <Text style={styles.shiftMeta}>{site?.name}</Text>
              </View>
              {supervisor && <Text style={styles.shiftMeta}>Supervisor: {supervisor.name}</Text>}
            </View>
            <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "Clocked in" : "Not clocked in"} />
          </View>

          {!clocked ? (
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
      )}

      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.sectionTitle}>Task progress</Text>
          <Text style={styles.mutedSmall}>
            {done}/{myTasks.length} completed
          </Text>
        </View>
        <ProgressBar value={myTasks.length ? (done / myTasks.length) * 100 : 0} />
      </Card>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>
          Assigned tasks
          {!isSameDay(selectedDate, today)
            ? ` - ${selectedDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
            : ""}
        </Text>
        <View style={styles.boardLinks}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/kanban")}>
            <Text style={styles.link}>Board</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/shifts")}>
            <Text style={styles.link}>View all</Text>
          </Pressable>
        </View>
      </View>
      {myTasks.length === 0 && (
        <Text style={styles.emptyTasks}>No tasks assigned for this day.</Text>
      )}
      <View style={styles.list}>
        {myTasks.slice(0, 3).map((t) => (
          <Pressable key={t.id} onPress={() => router.push(`/tasks/${t.id}`)}>
            <Card style={styles.taskCard}>
              <View style={styles.taskIcon}>
                <Ionicons name="cube-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.mutedSmall} numberOfLines={1}>
                  {t.locationName} • Due {t.dueTime}
                </Text>
              </View>
              <View style={styles.taskBadges}>
                <StatusBadge tone={toneForTask(t.status)} label={humanStatus(t.status)} />
                {t.priority === "high" && <StatusBadge tone="destructive" label="Priority" />}
              </View>
            </Card>
          </Pressable>
        ))}
      </View>

      {candidateRounds.length > 0 && (
        <View style={styles.caSection}>
          <Text style={styles.caSectionTitle}>Hourly compliance rounds</Text>
          {candidateRounds.map((t) => {
            const claimedByName = t.hourlyComplianceClaimed
              ? (state.users.find((u) => u.id === t.assigneeId)?.name ?? "someone else")
              : null;
            return (
              <Pressable key={t.id} onPress={() => router.push(`/tasks/${t.id}`)}>
                <Card style={styles.taskCard}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.mutedForeground} />
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.mutedSmall} numberOfLines={1}>
                      {claimedByName ? `Taken by ${claimedByName}` : "Not yet claimed - first to scan wins"}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}

      {hasHourlyCompliance && (
      <Pressable onPress={() => router.push("/hourly-compliance")}>
        <Card style={styles.hourlyCard}>
          <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          <View style={styles.taskInfo}>
            <Text style={styles.taskTitle}>My hourly compliance rounds</Text>
            <Text style={styles.mutedSmall}>See the checklist items assigned to you today</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.foreground} />
        </Card>
      </Pressable>
      )}

      {hasCorrectiveActions && openCA.length > 0 && (
        <View style={styles.caSection}>
          <Text style={styles.caSectionTitle}>Open corrective actions</Text>
          {openCA.map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/corrective-actions/${c.id}`)}>
              <Card style={styles.caCard}>
                <Ionicons name="alert-circle" size={20} color={colors.warningForeground} />
                <View style={styles.taskInfo}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {c.reason}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    Due by{" "}
                    {new Date(c.deadline).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.foreground} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.quickActions}>
        {/* Incidents are always tied to a scanned room/zone now, so this
            sends the cleaner to Scan first rather than straight to the
            report form - see app/(app)/incidents/new.tsx. */}
        {hasIncidents && (
          <Button variant="outline" icon={<BrokenGlassIcon size={16} color={colors.foreground} />} onPress={() => router.push(hasQr ? "/scan" : "/incidents/new")}>
            Report incident
          </Button>
        )}
        <Button variant="outline" onPress={() => router.push("/profile")}>
          Sync status
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  boardLinks: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shiftCard: {
    marginBottom: spacing.lg,
  },
  shiftOverlay: {
    backgroundColor: "#182531",
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
    color: "rgba(255,255,255,0.75)",
  },
  shiftTime: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.white,
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
    borderColor: "#efd384",
  },
  quickActions: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
});
