import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * What an auditor opens the app to ask: is this contract being
 * delivered, and what is still outstanding.
 *
 * Reads entirely from bootstrap. An auditor is a member of the tenant
 * whose data bootstrap carries, and the backend has already scoped every
 * collection to the sites they may see (is_site_scoped treats anyone who
 * is not org_admin/operations_manager as site-scoped, which includes
 * this role), so `state.tasks` is already "tasks an auditor may see".
 * No client-side site filtering to get wrong, and no extra endpoint to
 * call - which also means nothing here can 403.
 *
 * Deliberately has no actions at all: no assign, no approve, no
 * clock-in. Every number is a count of something that already happened.
 */
export default function AuditHome() {
  const { state, currentUser } = useSmartClean();
  const hasIncidents = useHasModule("incidents");

  const mySites = useMemo(() => {
    const scoped = currentUser?.siteIds ?? [];
    return scoped.length > 0 ? state.sites.filter((s) => scoped.includes(s.id)) : state.sites;
  }, [state.sites, currentUser]);

  // "Delivered" counts approved and closed together: both mean the work
  // was done and signed off. Anything else is still in flight.
  const completed = state.tasks.filter((t) => ["approved", "closed"].includes(t.status));
  const outstanding = state.tasks.filter(
    (t) => !["approved", "closed", "cancelled"].includes(t.status),
  );
  const overdue = outstanding.filter(
    (t) => t.scheduledAt && new Date(t.scheduledAt) < new Date(),
  );
  const openIncidents = state.incidents.filter((i) => !["resolved", "closed"].includes(i.status));

  // Rounded toward zero so a run of "99%" never stands in for a genuine
  // 100%. With no tasks at all there is no rate to state - showing 0%
  // or 100% would both be assertions the data doesn't support.
  const totalScored = completed.length + outstanding.length;
  const completionRate =
    totalScored > 0 ? Math.floor((completed.length / totalScored) * 100) : null;

  // The same empty state the manager and supervisor screens call out: an
  // auditor with no sites assigned gets nothing from every list
  // endpoint, correctly, and without saying so the app looks broken.
  const noSites = (currentUser?.siteIds?.length ?? 0) === 0 && state.sites.length === 0;

  return (
    <Screen title="Overview">
      {noSites && (
        <Card style={styles.warningCard}>
          <Ionicons name="information-circle" size={20} color={colors.warningForeground} />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>No sites shared with you yet</Text>
            <Text style={styles.warningText}>
              Your account isn&apos;t linked to a site, so there&apos;s nothing to review
              here yet. Ask the organisation&apos;s administrator to give you access.
            </Text>
          </View>
        </Card>
      )}

      <Card style={styles.rateCard}>
        <Text style={styles.rateLabel}>Task completion</Text>
        <Text style={styles.rateValue}>
          {completionRate === null ? "—" : `${completionRate}%`}
        </Text>
        <Text style={styles.muted}>
          {completionRate === null
            ? "No tasks recorded yet."
            : `${completed.length} of ${totalScored} signed off`}
        </Text>
      </Card>

      <View style={styles.tiles}>
        <Tile label="Outstanding" value={outstanding.length} />
        <Tile
          label="Past due"
          value={overdue.length}
          tone={overdue.length > 0 ? "destructive" : undefined}
        />
      </View>

      {hasIncidents && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Open incidents</Text>
          {openIncidents.length === 0 ? (
            <Text style={styles.muted}>Nothing open.</Text>
          ) : (
            openIncidents.slice(0, 5).map((incident) => (
              <View key={incident.id} style={styles.incidentRow}>
                <View style={styles.flex}>
                  <Text style={styles.incidentTitle} numberOfLines={1}>
                    {incident.category}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {incident.locationName}
                  </Text>
                </View>
                <StatusBadge
                  tone={
                    incident.priority === "critical" || incident.priority === "high"
                      ? "destructive"
                      : "warning"
                  }
                  label={incident.priority}
                />
              </View>
            ))
          )}
          {openIncidents.length > 5 && (
            <Text style={styles.muted}>+{openIncidents.length - 5} more</Text>
          )}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Sites in scope</Text>
        {mySites.length === 0 ? (
          <Text style={styles.muted}>No sites to show.</Text>
        ) : (
          mySites.map((site) => (
            <View key={site.id} style={styles.siteRow}>
              <Ionicons name="business-outline" size={16} color={colors.mutedForeground} />
              <View style={styles.flex}>
                <Text style={styles.siteName}>{site.name}</Text>
                {!!site.address && (
                  <Text style={styles.muted} numberOfLines={1}>
                    {site.address}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </Card>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    lineHeight: 18,
  },
  rateCard: {
    marginBottom: spacing.md,
    gap: 2,
  },
  rateLabel: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.mutedForeground,
  },
  rateValue: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.foreground,
  },
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    gap: 2,
  },
  tileLabel: {
    fontSize: typography.small,
    color: colors.mutedForeground,
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
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  incidentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  incidentTitle: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
    textTransform: "capitalize",
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  siteName: {
    fontSize: typography.body,
    color: colors.foreground,
    fontWeight: "600",
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
});
