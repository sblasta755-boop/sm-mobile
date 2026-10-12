import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { isSameDay } from "@/components/DateStrip";
import { toneForTask, humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography, themedStyles, status, useThemeVersion } from "@/theme";

// LEGACY SCREEN, NOW READ FROM REAL TASKS - superseded by tagged Tasks
// (see the "Hourly compliance" tab on the web app's /tasks and
// SiteController.upsert_hourly_compliance_schedule on the backend): a
// cleaner's own hourly-compliance rounds now show up as ordinary
// assigned Tasks (see Task.isHourlyCompliance/hourlyComplianceSlot/
// hourlyComplianceCandidateIds/hourlyComplianceClaimed, and home.tsx's
// own candidateRounds, which reads this same data), going through the
// exact same lifecycle as any other task instead of this screen's own
// fixed-catalogue checklist grid.
//
// This screen used to be its own read/write grid against the legacy
// listHourlyComplianceAssignments/listHourlyComplianceChecks endpoints
// (a fixed 10-item/8-slot catalogue every site shared, superseded by
// each site's own configurable checklist/interval) - by the time a
// site had switched to a real configured schedule, that data source no
// longer reflected anything a cleaner actually needed to do, so
// checking here showed stale/disconnected items instead of today's
// real rounds. Now reads state.tasks directly instead, same source
// home.tsx's own allMyTasks/candidateRounds already use for this exact
// data, and links straight into each task rather than recording
// anything itself.
export default function HourlyComplianceScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();

  // Every hourly-compliance Task this cleaner has a stake in today:
  // either the current assignee (claimed, or still the placeholder
  // first-candidate from generation) or one of the other eligible
  // candidates who hasn't claimed it yet - mirrors home.tsx's own
  // allMyTasks/candidateRounds split, just combined into one list here
  // since this screen has no separate "progress today" count to
  // protect from being skewed by rounds that aren't really "mine" yet.
  //
  // Grouped by location (each site can now run several concurrent
  // schedules, one per location - see SiteController.
  // upsert_hourly_compliance_schedule on the backend) rather than one
  // flat list sorted only by time - a cleaner covering several rooms
  // needs "everything for the bathroom" together, not the bathroom's
  // 08:00 round interleaved with the kitchen's. Locations sorted
  // alphabetically, slots within each location by time.
  const today = useMemo(() => new Date(), []);
  const roundsByLocation = useMemo(() => {
    if (!currentUser) return [];
    const rounds = state.tasks.filter(
      (t) =>
        t.isHourlyCompliance &&
        (t.assigneeId === currentUser.id ||
          (t.hourlyComplianceCandidateIds ?? []).includes(currentUser.id)) &&
        // Scoped to today's rounds only, same as every other "my tasks
        // today" list in this app (home.tsx's own myTasks) - a round
        // generated on an earlier day (scheduledAt is set to the instant
        // it was generated, one per day) is a closed chapter by now, not
        // something to keep surfacing here indefinitely.
        isSameDay(new Date(t.scheduledAt), today) &&
        // Drop rounds whose window has already closed and were never
        // completed - the backend locks these out of every write
        // (TaskController._assert_hourly_compliance_window_open) so
        // there's nothing left to do, and leaving a missed round sitting
        // here forever ("Still open - first to scan wins" on a slot that
        // ended hours ago) is just stale clutter. A round that *was*
        // completed before its window closed still shows, same as any
        // other finished task.
        (!t.hourlyComplianceLocked || ["approved", "closed"].includes(t.status)),
    );
    const groups = new Map<string, typeof rounds>();
    for (const task of rounds) {
      const key = task.locationName || "Other";
      const existing = groups.get(key);
      if (existing) existing.push(task);
      else groups.set(key, [task]);
    }
    return Array.from(groups.entries())
      .map(([locationName, tasks]) => ({
        locationName,
        tasks: tasks.sort((a, b) =>
          (a.hourlyComplianceSlot ?? "").localeCompare(b.hourlyComplianceSlot ?? ""),
        ),
      }))
      .sort((a, b) => a.locationName.localeCompare(b.locationName));
  }, [state.tasks, currentUser]);
  const totalRounds = useMemo(
    () => roundsByLocation.reduce((sum, group) => sum + group.tasks.length, 0),
    [roundsByLocation],
  );

  // Collapsed by default - tracked by which are explicitly expanded
  // rather than which are collapsed, so a newly-appearing location
  // (e.g. a fresh round generated while this screen is open) starts
  // collapsed too instead of needing its own default-state bookkeeping.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (locationName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(locationName)) next.delete(locationName);
      else next.add(locationName);
      return next;
    });
  };

  return (
    <Screen title="My hourly compliance">
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Hourly compliance rounds are assigned as regular tasks - each one below opens straight
          into your task list.
        </Text>
      </View>
      {totalRounds === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.mutedSmall}>
            No hourly compliance rounds are assigned to you today. Check back later or ask your
            supervisor.
          </Text>
        </View>
      ) : (
        <View style={styles.groupList}>
          {roundsByLocation.map((group) => {
            const isOpen = expanded.has(group.locationName);
            return (
              <View key={group.locationName} style={styles.group}>
                <Pressable
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(group.locationName)}
                >
                  <Ionicons
                    name={isOpen ? "chevron-down" : "chevron-forward"}
                    size={14}
                    color={colors.mutedForeground}
                  />
                  <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                  <Text style={styles.groupTitle}>{group.locationName}</Text>
                  <Text style={styles.groupCount}>
                    {group.tasks.length} round{group.tasks.length === 1 ? "" : "s"}
                  </Text>
                </Pressable>
                {isOpen && (
                  <View style={styles.list}>
                    {group.tasks.map((task) => {
                      const isMine = task.assigneeId === currentUser?.id;
                      return (
                        <Pressable key={task.id} onPress={() => router.push(`/tasks/${task.id}`)}>
                          <Card style={styles.card}>
                            <View style={styles.headerRow}>
                              <Text style={styles.itemTitle} numberOfLines={1}>
                                {task.title}
                              </Text>
                              <StatusBadge
                                tone={toneForTask(task.status)}
                                label={humanStatus(task.status)}
                              />
                            </View>

                            <View style={styles.metaRow}>
                              {task.hourlyComplianceSlot && (
                                <>
                                  <Ionicons
                                    name="time-outline"
                                    size={12}
                                    color={colors.mutedForeground}
                                  />
                                  <Text style={styles.mutedSmall}>
                                    {task.hourlyComplianceSlot} slot
                                  </Text>
                                </>
                              )}
                            </View>

                            <View style={styles.footerRow}>
                              <Text style={styles.mutedSmall}>
                                {isMine
                                  ? task.hourlyComplianceClaimed
                                    ? "Claimed by you - scan the room QR to work through it."
                                    : "Assigned to you - scan the room QR to claim and start it."
                                  : "Still open - first to scan the room QR claims this round."}
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={14}
                                color={colors.mutedForeground}
                              />
                            </View>
                          </Card>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  banner: {
    borderWidth: 1,
    // Same info-tone border as StatusBadge's own "info" pill (see
    // theme/status.ts) - colors.ts has no dedicated infoBorder token.
    borderColor: status.info.border,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  bannerText: {
    fontSize: typography.small,
    color: colors.info,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  groupList: {
    gap: spacing.lg,
  },
  group: {
    gap: spacing.xs,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  groupTitle: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
    textTransform: "uppercase",
  },
  groupCount: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
