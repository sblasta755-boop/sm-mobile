import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { listOrganisationUsers, type OrganisationUser } from "@/api/client";
import { STATE_INFO, initialsOf, roleLabel, userState, type UserState } from "@/features/orgUsers";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

type Filter = "all" | UserState;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "archived", label: "Archived" },
];
const SPLIT_COLOR: Record<UserState, () => string> = {
  active: () => colors.success,
  pending: () => colors.warning,
  archived: () => colors.mutedForeground,
};

/** The platform operator's view of one organisation's people: stats first, then everyone. */
export default function PlatformOrganisationUsers() {
  useThemeVersion();
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const { state } = useSmartClean();
  const [users, setUsers] = useState<OrganisationUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Reloads when coming back from a user, so an edit or archive shows straight away.
  useFocusEffect(
    useCallback(() => {
      if (!state.accessToken || !tenantId) return;
      let cancelled = false;
      setError(null);
      listOrganisationUsers(state.accessToken, tenantId)
        .then((list) => !cancelled && setUsers(list))
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load users"));
      return () => {
        cancelled = true;
      };
    }, [state.accessToken, tenantId]),
  );

  const counts = useMemo(() => {
    const c: Record<UserState, number> = { active: 0, pending: 0, archived: 0 };
    for (const u of users ?? []) c[userState(u.status)] += 1;
    return c;
  }, [users]);

  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users ?? []) map.set(u.role, (map.get(u.role) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [users]);

  const latestLogin = useMemo(() => {
    const times = (users ?? []).map((u) => u.lastLogin).filter((t): t is string => !!t);
    return times.sort().pop() ?? null;
  }, [users]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (filter !== "all" && userState(u.status) !== filter) return false;
      if (!needle) return true;
      return `${u.name} ${u.email} ${roleLabel(u.role)}`.toLowerCase().includes(needle);
    });
  }, [users, query, filter]);

  const total = users?.length ?? 0;
  const maxRole = Math.max(1, ...byRole.map(([, n]) => n));

  return (
    <Screen title="Users" backTo={`/platform-organisation/${tenantId}`}>
      {error && (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      {!users && !error && <Text style={styles.muted}>Loading…</Text>}

      {users && (
        <>
          <View style={styles.card}>
            <View style={styles.label}>
              <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.labelText}>Total users</Text>
            </View>
            <Text style={styles.big}>{total}</Text>
            {total > 0 && (
              <View style={styles.split}>
                {(["active", "pending", "archived"] as UserState[])
                  .filter((k) => counts[k] > 0)
                  .map((k) => (
                    <View key={k} style={{ flex: counts[k], height: 10, borderRadius: 4, backgroundColor: SPLIT_COLOR[k]() }} />
                  ))}
              </View>
            )}
            <View style={styles.legend}>
              {(["active", "pending", "archived"] as UserState[]).map((k) => (
                <View key={k} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: SPLIT_COLOR[k]() }]} />
                  <Text style={styles.small}>
                    {counts[k]} {STATE_INFO[k].label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.labelText}>By role</Text>
            <View style={styles.bars}>
              {byRole.length === 0 && <Text style={styles.small}>No users yet.</Text>}
              {byRole.map(([role, n]) => (
                <View key={role} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {roleLabel(role)}
                  </Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(n / maxRole) * 100}%` }]} />
                  </View>
                  <Text style={styles.barCount}>{n}</Text>
                </View>
              ))}
            </View>
            <View style={styles.kv}>
              <Text style={styles.small}>Last sign-in (any user)</Text>
              <Text style={styles.kvValue}>
                {latestLogin
                  ? new Date(latestLogin).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "Never"}
              </Text>
            </View>
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, email or role"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
            />
          </View>
          <View style={styles.pills}>
            {FILTERS.map((f) => {
              const on = filter === f.key;
              const n = f.key === "all" ? total : counts[f.key];
              return (
                <Pressable key={f.key} accessibilityRole="button" onPress={() => setFilter(f.key)} style={[styles.pill, on && styles.pillOn]}>
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>
                    {f.label} <Text style={styles.pillCount}>{n}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.card, { paddingVertical: spacing.xs }]}>
            {shown.length === 0 && <Text style={[styles.small, { paddingVertical: spacing.md }]}>No one matches.</Text>}
            {shown.map((u, i) => {
              const info = STATE_INFO[userState(u.status)];
              return (
                <Pressable
                  key={u.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: "/platform-org-user/[tenantId]", params: { tenantId: tenantId!, userId: u.id } })
                  }
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {u.name}
                    </Text>
                    <Text style={styles.small} numberOfLines={1}>
                      {roleLabel(u.role)} · {u.email}
                    </Text>
                  </View>
                  <StatusBadge tone={info.tone} label={info.label} />
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
        </>
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
    muted: { color: colors.mutedForeground },
    error: { color: colors.destructive },
    small: { fontSize: typography.small, color: colors.mutedForeground },
    label: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    labelText: { fontSize: typography.small + 1, color: colors.mutedForeground },
    big: { fontSize: 36, fontWeight: "300", color: colors.foreground, marginTop: spacing.sm },
    split: { flexDirection: "row", gap: 3, marginTop: spacing.md },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.lg, rowGap: 4, marginTop: spacing.md },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    bars: { gap: spacing.sm, marginTop: spacing.md },
    barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    barLabel: { width: 110, fontSize: typography.small, color: colors.mutedForeground },
    track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.secondary, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
    barCount: { width: 22, textAlign: "right", fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    kv: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    kvValue: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 46,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: spacing.sm,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: typography.body },
    pills: {
      flexDirection: "row",
      gap: 3,
      padding: 4,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: spacing.sm + 2,
    },
    pill: { flex: 1, minHeight: 34, borderRadius: radius.round, alignItems: "center", justifyContent: "center" },
    pillOn: { backgroundColor: colors.accent },
    pillText: { fontSize: typography.small, color: colors.mutedForeground },
    pillTextOn: { color: colors.primary, fontWeight: "700" },
    pillCount: { opacity: 0.7 },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground },
    name: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  }),
);
