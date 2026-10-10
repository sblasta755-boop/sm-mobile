import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { listPlatformOrganisations, type PlatformOrganisation } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import type { StatusTone } from "@/theme";

// Mirrors the web console's STATUS_TONE. past_due is a warning rather
// than a failure on purpose: those organisations are fully functional
// inside their grace window.
const STATUS_TONE: Record<string, StatusTone> = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  suspended: "destructive",
  cancelled: "destructive",
};

function daysRemaining(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Why THIS organisation wants attention, in words a badge can't carry.
 * Same rule as the web console's needsAttention/attentionReason pair. */
function attentionReason(org: PlatformOrganisation): string | null {
  const sub = org.subscription;
  if (!sub) return "No subscription on file";
  if (sub.status === "suspended") return "Suspended";
  if (sub.status === "past_due") return "Payment overdue";
  if (sub.status === "trialing") {
    const days = daysRemaining(sub.trialEndsAt);
    if (days !== null && days <= 0) return "Trial has ended";
    if (days !== null && days <= 3) return `Trial ends in ${days} day${days === 1 ? "" : "s"}`;
  }
  return null;
}

export default function PlatformOrganisations() {
  const { state } = useSmartClean();
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    setError(null);
    try {
      const result = await listPlatformOrganisations(state.accessToken, 1, 100);
      setOrganisations(result.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load organisations");
    } finally {
      setLoading(false);
    }
  }, [state.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? organisations.filter(
          (org) =>
            org.name.toLowerCase().includes(needle) ||
            org.slug.toLowerCase().includes(needle),
        )
      : organisations;
    // Anything needing attention floats to the top - a healthy account
    // never needs looking at, which is the point of a console that deals
    // with subscribers rather than just listing them.
    return [...rows].sort((a, b) => {
      const aFlag = attentionReason(a) ? 0 : 1;
      const bFlag = attentionReason(b) ? 0 : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return a.name.localeCompare(b.name);
    });
  }, [organisations, query]);

  return (
    <Screen title="Organisations">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search organisations…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : filtered.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            {organisations.length === 0
              ? "No organisations yet. Onboard one from the Onboard tab."
              : "Nothing matches that search."}
          </Text>
        </Card>
      ) : (
        filtered.map((org) => {
          const reason = attentionReason(org);
          const status = org.subscription?.status ?? "none";
          return (
            <Pressable
              key={org.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/platform-organisation/[tenantId]",
                  params: { tenantId: org.id },
                })
              }
            >
              <Card style={styles.orgCard}>
                <View style={styles.orgHeader}>
                  <Text style={styles.orgName} numberOfLines={1}>
                    {org.name}
                  </Text>
                  <StatusBadge
                    tone={STATUS_TONE[status] ?? "neutral"}
                    label={status.replace(/_/g, " ")}
                  />
                </View>
                <Text style={styles.orgMeta}>
                  {org.subscription?.tierLabel ?? org.subscription?.tier ?? "No plan"} ·{" "}
                  {org.userCount} {org.userCount === 1 ? "user" : "users"}
                </Text>
                {reason && (
                  <View style={styles.attentionRow}>
                    <Ionicons name="alert-circle" size={13} color={colors.warning} />
                    <Text style={styles.attentionText}>{reason}</Text>
                  </View>
                )}
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: typography.body,
    color: colors.foreground,
  },
  orgCard: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  orgHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  orgName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  orgMeta: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  attentionText: {
    fontSize: typography.small,
    color: colors.warningForeground,
    fontWeight: "600",
  },
  muted: {
    fontSize: typography.small,
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
