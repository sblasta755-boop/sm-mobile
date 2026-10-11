import { useCallback, useEffect, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { getPlatformSummary, type PlatformSummary } from "@/api/client";
import { colors, spacing, typography, themedStyles } from "@/theme";

// Plain-language gloss for the audit action slugs the activity feed
// surfaces. Mirrors ACTIVITY_VERB in the web console's
// platform.organisations.tsx - "organisation_provisioned" means
// something to a codebase, not to someone scanning a feed.
const ACTIVITY_VERB: Record<string, string> = {
  organisation_provisioned: "was provisioned",
  organisation_self_provisioned: "signed up",
  organisation_suspended: "was suspended",
  organisation_reactivated: "was reactivated",
  organisation_cancelled: "was cancelled",
  subscription_updated: "had its plan changed",
  impersonation_started: "had a support session started",
  onboarding_code_revealed: "had an onboarding code shown",
  onboarding_code_scanned: "had its code scanned",
  onboarding_approved: "was approved",
  onboarding_rejected: "was rejected",
  onboarding_completed: "finished onboarding",
};

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PlatformDashboard() {
  const { state } = useSmartClean();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    setError(null);
    try {
      setSummary(await getPlatformSummary(state.accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [state.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const paidCount = summary
    ? summary.totalOrganisations - (summary.byTier.trial ?? 0)
    : 0;
  const signups = summary
    ? Object.values(summary.signupsLast30Days).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <Screen title="Platform">
      <View style={styles.refreshWrap}>
        <RefreshControl refreshing={loading} onRefresh={() => void load()} />
      </View>

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <View style={styles.tiles}>
        <Tile label="Organisations" value={summary?.totalOrganisations ?? "-"} />
        <Tile label="Active users" value={summary?.totalActiveUsers ?? "-"} />
        <Tile label="Signups, 30d" value={summary ? signups : "-"} />
        <Tile label="On a paid plan" value={summary ? paidCount : "-"} />
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>By status</Text>
        {!summary ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          ["trialing", "active", "past_due", "suspended", "cancelled"]
            .filter((s) => (summary.byStatus[s] ?? 0) > 0)
            .map((s) => (
              <View key={s} style={styles.statusRow}>
                <StatusBadge
                  tone={
                    s === "active"
                      ? "success"
                      : s === "trialing"
                        ? "info"
                        : s === "past_due"
                          ? "warning"
                          : "destructive"
                  }
                  label={s.replace(/_/g, " ")}
                />
                <Text style={styles.statusCount}>{summary.byStatus[s]}</Text>
              </View>
            ))
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {!summary ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : summary.recentActivity.length === 0 ? (
          <Text style={styles.muted}>Nothing has happened yet.</Text>
        ) : (
          summary.recentActivity.map((entry) => (
            <View key={entry.id} style={styles.activityRow}>
              <Text style={styles.activityText} numberOfLines={2}>
                <Text style={styles.activityName}>{entry.tenantName}</Text>{" "}
                {ACTIVITY_VERB[entry.action] ?? entry.action.replace(/_/g, " ")}
              </Text>
              <Text style={styles.activityTime}>{timeAgo(entry.occurredAt)}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </Card>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  refreshWrap: {
    height: 0,
    overflow: "hidden",
  },
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
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusCount: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityText: {
    flex: 1,
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  activityName: {
    fontWeight: "700",
    color: colors.foreground,
  },
  activityTime: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  errorCard: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.small,
    fontWeight: "600",
  },
}));
