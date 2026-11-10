import { fuzzyFilter } from "@/domain/fuzzySearch";
import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { PillSelector, StackedBar } from "@/components/PlatformHomeKit";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import {
  listPlatformOrganisations,
  setPlatformOrganisationState,
  type PlatformOrganisation,
} from "@/api/client";
import { attentionList } from "@/domain/platformHome";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The platform operator's organisations, built from the same parts as the Overview (platform-dashboard.tsx): a pill
 * selector, a big-number card with a health bar, paired cards with thin bars, a row card, "Needs attention" cards with
 * a full-width action, then the list. Only data and actions the app already has; the web console's phone layout is the
 * same (PlatformOrganisationsMobile.tsx).
 */

type Filter = "all" | "attention" | "trials" | "paid";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

function tag(status: string) {
  if (status === "active") return { bg: colors.successSoft, fg: colors.success };
  if (status === "trialing") return { bg: colors.warningSoft, fg: colors.warningForeground };
  return { bg: colors.destructiveSoft, fg: colors.destructive };
}

function openOrganisation(tenantId: string) {
  router.push({ pathname: "/platform-organisation/[tenantId]", params: { tenantId } });
}

export default function PlatformOrganisations() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const [organisations, setOrganisations] = useState<PlatformOrganisation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

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

  // Reload whenever the tab comes into view, so a change made on the detail screen shows here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => {
    const by = (s: string) => organisations.filter((o) => o.subscription?.status === s).length;
    return {
      total: organisations.length,
      active: by("active"),
      trialing: by("trialing"),
      pastDue: by("past_due"),
      suspended: by("suspended") + by("cancelled"),
      users: organisations.reduce((sum, o) => sum + o.userCount, 0),
    };
  }, [organisations]);
  const attention = useMemo(() => attentionList(organisations), [organisations]);
  const flagged = useMemo(() => new Set(attention.map((a) => a.org.id)), [attention]);

  const list = useMemo(() => {
    let rows = organisations;
    if (filter === "trials") rows = rows.filter((o) => o.subscription?.status === "trialing");
    if (filter === "paid") rows = rows.filter((o) => o.subscription && o.subscription.tier !== "trial");
    if (filter === "all") rows = rows.filter((o) => !flagged.has(o.id)); // the flagged ones are listed above
    rows = fuzzyFilter(rows, query, (o) => [o.name, o.slug]);
    return query.trim() ? rows : [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }, [organisations, filter, query, flagged]);

  async function reactivate(org: PlatformOrganisation) {
    if (!state.accessToken) return;
    setPending(org.id);
    try {
      await setPlatformOrganisationState(state.accessToken, org.id, "reactivate");
      await load();
    } catch (err) {
      appAlert("Could not reactivate", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setPending(null);
    }
  }

  const total = counts.total || 1;
  const activeOrTrial = counts.active + counts.trialing;
  const showAttention = filter === "all" || filter === "attention";
  const showList = filter !== "attention";

  return (
    <Screen title="Organisations">
      <PillSelector
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", icon: "business-outline" },
          { value: "attention", label: "Attention", icon: "warning-outline" },
          { value: "trials", label: "Trials", icon: "time-outline" },
          { value: "paid", label: "Paid", icon: "card-outline" },
        ]}
      />

      {error ? (
        <View style={[styles.card, { marginTop: spacing.md, borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive }}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { marginTop: spacing.md }]}>
        <View style={styles.label}>
          <Ionicons name="business-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.labelText}>Organisations</Text>
        </View>
        <Text style={styles.big}>
          {counts.total}
          <Text style={styles.unit}>  organisations</Text>
        </Text>
        <View style={{ marginTop: spacing.lg }}>
          <StackedBar
            parts={[
              { label: "Active", value: counts.active, tone: "good" },
              { label: "Trial", value: counts.trialing, tone: "muted" },
              { label: "Past due", value: counts.pastDue, tone: "warn" },
              { label: "Suspended", value: counts.suspended, tone: "bad" },
            ]}
          />
        </View>
      </View>

      <View style={styles.pair}>
        <View style={[styles.card, styles.half]}>
          <View style={styles.label}>
            <Ionicons name="checkmark" size={16} color={colors.mutedForeground} />
            <Text style={styles.labelText}>Active or trialing</Text>
          </View>
          <Text style={styles.big}>{activeOrTrial}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(activeOrTrial / total) * 100}%`, backgroundColor: colors.success }]} />
          </View>
          <Text style={styles.sub}>{Math.round((activeOrTrial / total) * 100)}% of all</Text>
        </View>
        <View style={[styles.card, styles.half]}>
          <View style={styles.label}>
            <Ionicons name="warning-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.labelText}>Needs attention</Text>
          </View>
          <Text style={[styles.big, attention.length > 0 && { color: colors.destructive }]}>{attention.length}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(attention.length / total) * 100}%`, backgroundColor: colors.destructive }]} />
          </View>
          <Text style={styles.sub}>
            {counts.suspended} suspended · {counts.pastDue} overdue
          </Text>
        </View>
      </View>

      <View style={[styles.card, styles.rowCard]}>
        <View style={styles.label}>
          <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.labelText}>Users across all</Text>
        </View>
        <Text style={styles.rowNumber}>{counts.users}</Text>
      </View>

      {loading ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : null}

      {!loading && showAttention ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <Text style={styles.link}>{attention.length}</Text>
          </View>
          {attention.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.muted}>Nothing needs you right now.</Text>
            </View>
          ) : (
            attention.map(({ org, reason }) => {
              const status = org.subscription?.status ?? "none";
              const canReactivate = status === "suspended";
              const t = tag(status);
              return (
                <View key={org.id} style={styles.card}>
                  <Pressable accessibilityRole="button" onPress={() => openOrganisation(org.id)} style={styles.top}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{org.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {org.name}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {org.subscription?.tierLabel ?? org.subscription?.tier ?? "No plan"} · {org.userCount} users
                      </Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: t.bg }]}>
                      <Text style={[styles.tagText, { color: t.fg }]} numberOfLines={1}>
                        {reason}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={pending === org.id}
                    onPress={() => (canReactivate ? void reactivate(org) : openOrganisation(org.id))}
                    style={({ pressed }) => [styles.action, (pressed || pending === org.id) && { opacity: 0.7 }]}
                  >
                    <Text style={styles.actionText}>
                      {canReactivate ? (pending === org.id ? "Reactivating…" : "Reactivate") : "Review"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </>
      ) : null}

      {!loading && showList ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {filter === "trials" ? "Trials" : filter === "paid" ? "Paid plans" : "All organisations"}
            </Text>
            <Text style={styles.link}>{list.length}</Text>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search organisations"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {list.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.muted}>
                {organisations.length === 0 ? "No organisations yet. Onboard one from the Onboard tab." : "Nothing matches."}
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { paddingVertical: 2 }]}>
              {list.map((org, i) => {
                const status = org.subscription?.status ?? "none";
                const t = tag(status);
                return (
                  <Pressable
                    key={org.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${org.name}, ${STATUS_LABEL[status] ?? status}`}
                    onPress={() => openOrganisation(org.id)}
                    style={[styles.item, i > 0 && styles.divider]}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{org.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {org.name}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {org.subscription?.tierLabel ?? org.subscription?.tier ?? "No plan"} · {org.userCount} users
                      </Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: t.bg }]}>
                      <Text style={[styles.tagText, { color: t.fg }]}>{STATUS_LABEL[status] ?? status}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </>
      ) : null}
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
    label: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    labelText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    big: { fontSize: 36, fontWeight: "300", color: colors.foreground, marginTop: spacing.sm, letterSpacing: -0.5 },
    unit: { fontSize: typography.body, fontWeight: "400", color: colors.mutedForeground },
    pair: { flexDirection: "row", gap: spacing.sm + 2 },
    half: { flex: 1 },
    track: { height: 5, borderRadius: 3, backgroundColor: colors.secondary, marginTop: spacing.md, overflow: "hidden" },
    fill: { height: 5, borderRadius: 3 },
    sub: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 2 },
    rowCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
    rowNumber: { fontSize: 26, fontWeight: "300", color: colors.foreground },
    muted: { fontSize: typography.body, color: colors.mutedForeground },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: spacing.lg,
      marginBottom: spacing.sm + 2,
      paddingHorizontal: 2,
    },
    sectionTitle: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
    link: { fontSize: typography.small + 1, color: colors.primary, fontWeight: "600" },
    top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: typography.small + 1, fontWeight: "700", color: colors.mutedForeground },
    name: { fontSize: typography.body + 1, fontWeight: "600", color: colors.foreground },
    itemName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.round, maxWidth: 140 },
    tagText: { fontSize: typography.small - 0.5, fontWeight: "700" },
    action: { height: 42, borderRadius: radius.round, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
    actionText: { fontSize: typography.body, fontWeight: "700", color: colors.primaryForeground },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: 44,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm + 2,
    },
    searchInput: { flex: 1, fontSize: typography.body, color: colors.foreground },
    item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  }),
);
