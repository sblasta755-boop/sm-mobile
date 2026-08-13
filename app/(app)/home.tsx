import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { DateStrip } from "@/components/DateStrip";
import { useSmartClean } from "@/features/store";
import { toneForTask, humanStatus } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";

export default function HomeScreen() {
  const { state, currentUser } = useSmartClean();
  const site = state.sites.find((s) => currentUser?.siteIds.includes(s.id));
  const myTasks = state.tasks.filter((t) => t.assigneeId === currentUser?.id);
  const done = myTasks.filter((t) => ["approved", "closed"].includes(t.status)).length;
  const openCA = state.correctiveActions.filter(
    (c) => c.assigneeId === currentUser?.id && c.status !== "closed",
  );
  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  return (
    <Screen headerContent={<DateStrip />}>
      <Card padded={false} style={styles.shiftCard}>
        <View style={styles.shiftOverlay}>
          <View style={styles.shiftTopRow}>
            <View style={styles.shiftInfo}>
              <Text style={styles.shiftEyebrow}>Today&apos;s shift</Text>
              <Text style={styles.shiftTime}>07:00 - 16:00</Text>
              <View style={styles.shiftMetaRow}>
                <Ionicons name="location" size={11} color="rgba(255,255,255,0.8)" />
                <Text style={styles.shiftMeta}>{site?.name}</Text>
              </View>
              <Text style={styles.shiftMeta}>Supervisor: Thandi Ndlovu</Text>
            </View>
            <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "Clocked in" : "Not clocked in"} />
          </View>

          {!clocked ? (
            <Button icon={<Ionicons name="scan" size={18} color={colors.primaryForeground} />} onPress={() => router.push("/scan")}>
              Scan site QR to clock in
            </Button>
          ) : (
            <View style={styles.clockedPill}>
              <Text style={styles.clockedText}>
                Clocked in at{" "}
                {new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          )}
        </View>
      </Card>

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
        <Text style={styles.sectionTitle}>Assigned tasks</Text>
        <Pressable onPress={() => router.push("/shifts")}>
          <Text style={styles.link}>View all</Text>
        </Pressable>
      </View>
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

      {openCA.length > 0 && (
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
        <Button variant="outline" icon={<Ionicons name="alert-circle-outline" size={16} color={colors.foreground} />} onPress={() => router.push("/incidents/new")}>
          Report issue
        </Button>
        <Button variant="outline" onPress={() => router.push("/profile")}>
          Sync status
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
