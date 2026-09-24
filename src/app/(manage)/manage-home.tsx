import { useMemo } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography } from "@/theme";

/**
 * What a manager needs on opening the app: is anything wrong at my
 * sites, and who is working right now.
 *
 * Reads from bootstrap rather than fetching: unlike the platform
 * console, a manager IS in the tenant whose data bootstrap carries, and
 * the backend has already scoped every collection to their sites
 * (is_site_scoped). So `state.tasks` here is already "tasks at my
 * sites", with no client-side filtering to get wrong.
 */
export default function ManageHome() {
  const { state, currentUser } = useSmartClean();

  const mySites = useMemo(() => {
    // org_admin and operations_manager are tenant-wide and carry no
    // siteIds; they legitimately see every site. A site_manager's list
    // is their own. Mirrors is_site_scoped server-side.
    const scoped = currentUser?.siteIds ?? [];
    return scoped.length > 0
      ? state.sites.filter((s) => scoped.includes(s.id))
      : state.sites;
  }, [state.sites, currentUser]);

  const openTasks = state.tasks.filter(
    (t) => !["approved", "closed"].includes(t.status),
  );
  const overdue = openTasks.filter(
    (t) => t.scheduledAt && new Date(t.scheduledAt) < new Date(),
  );
  const openIncidents = state.incidents.filter((i) => i.status !== "closed");
  const openActions = state.correctiveActions.filter((c) => c.status !== "closed");
  const clockedIn = Object.entries(state.attendance).filter(
    ([, entry]) => entry?.clockedInAt,
  ).length;

  // The empty state that would otherwise read as a broken app. A
  // site-scoped manager with no sites assigned gets nothing from every
  // list endpoint - correctly, per is_site_scoped - and without saying
  // so the app looks like it failed to load.
  const needsSiteAssignment =
    (currentUser?.siteIds?.length ?? 0) === 0 &&
    currentUser?.role === "site_manager";

  return (
    <Screen title="Overview">
      {needsSiteAssignment && (
        <Card style={styles.warningCard}>
          <Ionicons name="information-circle" size={20} color={colors.warningForeground} />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>No sites assigned yet</Text>
            <Text style={styles.warningText}>
              Your account isn&apos;t linked to a site, so there&apos;s nothing to show here
              yet. Ask your administrator to assign you one.
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.tiles}>
        <Tile label="Open tasks" value={openTasks.length} />
        <Tile
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? "destructive" : undefined}
        />
        <Tile label="On shift now" value={clockedIn} />
        <Tile label="Sites" value={mySites.length} />
      </View>

      {overdue.length > 0 && (
        <Card style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Ionicons name="alert-circle" size={18} color={colors.destructive} />
            <Text style={styles.alertTitle}>
              {overdue.length} task{overdue.length === 1 ? "" : "s"} past due
            </Text>
          </View>
          {overdue.slice(0, 3).map((task) => (
            <View key={task.id} style={styles.alertRow}>
              <Text style={styles.alertRowText} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {task.locationName}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Needs attention</Text>
        <Row
          icon="warning-outline"
          label="Open incidents"
          value={openIncidents.length}
          tone={openIncidents.length > 0 ? "warning" : "success"}
        />
        <Row
          icon="construct-outline"
          label="Open corrective actions"
          value={openActions.length}
          tone={openActions.length > 0 ? "warning" : "success"}
        />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Your sites</Text>
        {mySites.length === 0 ? (
          <Text style={styles.muted}>No sites to show.</Text>
        ) : (
          mySites.map((site) => (
            <View key={site.id} style={styles.siteRow}>
              <Ionicons name="business-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.siteName} numberOfLines={1}>
                {site.name}
              </Text>
              {site.workingHours && (
                <Text style={styles.muted}>
                  {site.workingHours.start}–{site.workingHours.end}
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      <Pressable onPress={() => router.push("/manage-add-staff")}>
        <Card style={styles.ctaCard}>
          <Ionicons name="person-add" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.ctaTitle}>Add a team member</Text>
            <Text style={styles.muted}>
              Create their account and show them a QR code to scan — no email needed.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.foreground} />
        </Card>
      </Pressable>
    </Screen>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "destructive";
}) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, tone === "destructive" && styles.tileValueAlert]}>
        {value}
      </Text>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tone: "warning" | "success";
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <Text style={styles.flex}>{label}</Text>
      <StatusBadge tone={tone} label={String(value)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
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
  tileValueAlert: {
    color: colors.destructive,
  },
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  siteName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  alertCard: {
    marginTop: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  alertTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.destructive,
  },
  alertRow: {
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  alertRowText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
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
  ctaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderColor: colors.primary,
  },
  ctaTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
});
