import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BarRows, GrowthCurve, PillSelector, StackedBar } from "@/components/PlatformHomeKit";
import { useSmartClean } from "@/features/store";
import {
  getPlatformSummary,
  listPlatformOrganisations,
  type PlatformOrganisation,
  type PlatformSummary,
} from "@/api/client";
import {
  ACTIVITY_FILTERS,
  STATUS_LABEL,
  TIER_ORDER,
  actorName,
  activityMeta,
  activityVerb,
  attentionList,
  groupByDay,
  paidCount,
  signupSeries,
  signupsTotal,
  timeAgo,
  type ActivityKind,
  type Tone,
} from "@/domain/platformHome";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The platform operator's home: what is growing, what needs them, and what just happened. Every number comes from
 * the summary and the organisation list the console already uses, so there is nothing new on the server.
 * Colours are theme tokens only (light, dark and an organisation's brand colour all apply).
 */

type Chart = "growth" | "plans" | "health";

const toneColor = (t: Tone) => (t === "good" ? colors.success : t === "bad" ? colors.destructive : t === "warn" ? colors.warning : colors.mutedForeground);

function openOrganisation(tenantId: string) {
  router.push({ pathname: "/platform-organisation/[tenantId]", params: { tenantId } });
}

export default function PlatformDashboard() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [orgs, setOrgs] = useState<PlatformOrganisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chart, setChart] = useState<Chart>("growth");
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    setError(null);
    try {
      // The organisation list only feeds "Needs attention"; the rest of the screen still works without it.
      const [s, list] = await Promise.all([
        getPlatformSummary(state.accessToken),
        listPlatformOrganisations(state.accessToken, 1, 100).catch(() => null),
      ]);
      setSummary(s);
      setOrgs(list?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [state.accessToken]);

  // Reload whenever the tab comes into view, so the numbers are never a stale first load.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const series = useMemo(() => (summary ? signupSeries(summary) : []), [summary]);
  const attention = useMemo(() => attentionList(orgs), [orgs]);
  const activity = useMemo(() => {
    const all = summary?.recentActivity ?? [];
    return filter === "all" ? all : all.filter((e) => activityMeta(e.action).kind === filter);
  }, [summary, filter]);
  const groups = useMemo(() => groupByDay(activity), [activity]);

  const total = summary?.totalOrganisations ?? 0;
  const healthy = summary?.byStatus.active ?? 0;
  const paid = summary ? paidCount(summary) : 0;
  const paidPct = total ? Math.round((paid / total) * 100) : 0;
  const signups = summary ? signupsTotal(summary) : 0;

  return (
    <Screen title="Platform" scroll>
      {error ? (
        <View style={[styles.card, { borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive }}>{error}</Text>
        </View>
      ) : null}

      <PillSelector
        value={chart}
        onChange={setChart}
        options={[
          { value: "growth", label: "Growth", icon: "pulse-outline" },
          { value: "plans", label: "Plans", icon: "layers-outline" },
          { value: "health", label: "Health", icon: "heart-outline" },
        ]}
      />

      <View style={[styles.card, { marginTop: spacing.md }]}>
        {chart === "growth" ? (
          <>
            <View style={styles.cardLabel}>
              <Ionicons name="pulse-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.labelText}>Signups, last 30 days</Text>
            </View>
            <Text style={styles.bigNumber}>
              {summary ? signups : "-"}
              <Text style={styles.unit}>  new organisations</Text>
            </Text>
            <GrowthCurve values={series.map((d) => d.total)} labels={["30 days ago", "15 days ago", "Today"]} />
          </>
        ) : chart === "plans" ? (
          <>
            <View style={styles.cardLabel}>
              <Ionicons name="layers-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.labelText}>Organisations by plan</Text>
            </View>
            <View style={{ marginTop: spacing.lg }}>
              <BarRows
                rows={TIER_ORDER.map((t) => ({
                  label: t[0].toUpperCase() + t.slice(1),
                  value: summary?.byTier[t] ?? 0,
                  tone: t === "trial" ? "muted" : "primary",
                }))}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.cardLabel}>
              <Ionicons name="heart-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.labelText}>Organisation health</Text>
            </View>
            <Text style={styles.bigNumber}>
              {summary ? healthy : "-"}
              <Text style={styles.unit}>  of {total} active</Text>
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <StackedBar
                parts={[
                  { label: STATUS_LABEL.active, value: summary?.byStatus.active ?? 0, tone: "good" },
                  { label: STATUS_LABEL.trialing, value: summary?.byStatus.trialing ?? 0, tone: "muted" },
                  { label: STATUS_LABEL.past_due, value: summary?.byStatus.past_due ?? 0, tone: "warn" },
                  { label: STATUS_LABEL.suspended, value: summary?.byStatus.suspended ?? 0, tone: "bad" },
                ]}
              />
            </View>
          </>
        )}
      </View>

      <View style={styles.pair}>
        <View style={[styles.card, styles.half]}>
          <View style={styles.cardLabel}>
            <Ionicons name="business-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.labelText}>Organisations</Text>
          </View>
          <Text style={styles.bigNumber}>{summary ? total : "-"}</Text>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${total ? (healthy / total) * 100 : 0}%`, backgroundColor: colors.success }]} />
          </View>
          <Text style={styles.sub}>{healthy} healthy</Text>
        </View>
        <View style={[styles.card, styles.half]}>
          <View style={styles.cardLabel}>
            <Ionicons name="card-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.labelText}>Paid plans</Text>
          </View>
          <Text style={styles.bigNumber}>
            {summary ? paidPct : "-"}
            <Text style={styles.unit}> %</Text>
          </Text>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={styles.sub}>
            {paid} of {total}
          </Text>
        </View>
      </View>

      <View style={[styles.card, styles.rowCard]}>
        <View style={styles.cardLabel}>
          <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.labelText}>Active users</Text>
        </View>
        <Text style={styles.rowNumber}>{summary ? summary.totalActiveUsers : "-"}</Text>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Needs attention</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate("/platform-organisations")}>
          <Text style={styles.link}>View all</Text>
        </Pressable>
      </View>
      {attention.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{loading ? "Loading…" : "Nothing needs you right now."}</Text>
        </View>
      ) : (
        attention.slice(0, 3).map(({ org, reason, tone }) => (
          <View key={org.id} style={styles.card}>
            <View style={styles.attTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{org.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.orgName} numberOfLines={1}>
                  {org.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {org.subscription?.tierLabel ?? org.subscription?.tier ?? "No plan"} · {org.userCount} users
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: tone === "bad" ? colors.destructiveSoft : colors.warningSoft }]}>
                <Text style={[styles.tagText, { color: tone === "bad" ? colors.destructive : colors.warningForeground }]}>{reason}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => openOrganisation(org.id)}
              style={({ pressed }) => [styles.review, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.reviewText}>Review</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
      </View>
      <View style={styles.chips}>
        {ACTIVITY_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {!summary ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{filter === "all" ? "Nothing has happened yet." : "Nothing of this kind recently."}</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.dayLabel}>{g.label}</Text>
            <View style={[styles.card, { paddingVertical: 2 }]}>
              {g.items.map((e, i) => {
                const meta = activityMeta(e.action);
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.tenantName} ${activityVerb(e.action)}`}
                    onPress={() => openOrganisation(e.tenantId)}
                    style={[styles.actRow, i > 0 && styles.actDivider]}
                  >
                    <View style={styles.actIcon}>
                      <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={17} color={toneColor(meta.tone)} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.orgName} numberOfLines={1}>
                        {e.tenantName}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {(() => {
                          const v = activityVerb(e.action);
                          return v[0].toUpperCase() + v.slice(1);
                        })()}{" "}
                        · {actorName(e.actorEmail)}
                      </Text>
                    </View>
                    <Text style={styles.time}>{timeAgo(e.occurredAt)}</Text>
                    <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.xl + 6,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.sm + 2,
    },
    cardLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    labelText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    bigNumber: { fontSize: 36, fontWeight: "300", color: colors.foreground, marginTop: spacing.sm, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    pair: { flexDirection: "row", gap: spacing.sm + 2 },
    half: { flex: 1 },
    progress: { height: 5, borderRadius: 3, backgroundColor: colors.secondary, marginTop: spacing.md, overflow: "hidden" },
    progressFill: { height: 5, borderRadius: 3 },
    sub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    rowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
    rowNumber: { fontSize: 26, fontWeight: "300", color: colors.foreground },
    sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: spacing.lg, marginBottom: spacing.sm + 2, paddingHorizontal: 2 },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    link: { fontSize: typography.small + 1, color: colors.primary, fontWeight: "600" },
    muted: { fontSize: typography.body, color: colors.mutedForeground },
    attTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: typography.small + 1, fontWeight: "700", color: colors.mutedForeground },
    orgName: { fontSize: typography.body + 1, fontWeight: "600", color: colors.foreground },
    tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.round, maxWidth: 140 },
    tagText: { fontSize: typography.small - 0.5, fontWeight: "700" },
    review: { height: 42, borderRadius: radius.round, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
    reviewText: { fontSize: typography.body, fontWeight: "700", color: colors.primaryForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.round, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipOn: { backgroundColor: colors.foreground, borderColor: colors.foreground },
    chipText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    chipTextOn: { color: colors.background, fontWeight: "700" },
    dayLabel: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.sm, marginLeft: 2 },
    actRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
    actDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    actIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    time: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
