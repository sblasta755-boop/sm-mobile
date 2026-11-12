import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { getPaySettings, listPayRuns, type PayRun } from "@/api/client";
import { formatDays, formatHours, formatMoney, periodLabel } from "@/domain/payroll";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { appAlert } from "@/components/Dialog";

export const PAY_STATUS = {
  draft: { label: "Draft", tone: "warning" },
  final: { label: "Final", tone: "success" },
  void: { label: "Void", tone: "destructive" },
} as const;

/** The pay runs made so far, and the way to start a new one. */
export default function PayRunsScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const allowed = useCanUsePayroll();
  const homePath = useHomePath();
  const [runs, setRuns] = useState<PayRun[] | null>(null);
  const [payablesOn, setPayablesOn] = useState(false);
  const [filter, setFilter] = useState<"all" | PayRun["status"]>("all");

  // Money is only added up when every run is in one currency.
  const summary = useMemo(() => {
    const all = runs ?? [];
    const live = all.filter((r) => r.status !== "void");
    const currencies = new Set(live.map((r) => r.currency));
    const gross = live.reduce((sum, r) => sum + Number(r.totals.gross || 0), 0);
    return {
      count: live.length,
      drafts: all.filter((r) => r.status === "draft").length,
      gross: currencies.size === 1 ? formatMoney(gross, [...currencies][0]) : "Mixed",
    };
  }, [runs]);
  const shown = useMemo(() => (runs ?? []).filter((r) => filter === "all" || r.status === filter), [runs, filter]);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    try {
      setRuns(await listPayRuns(state.accessToken));
    } catch (error) {
      appAlert("Could not load pay runs", error instanceof Error ? error.message : "Please try again.");
    }
  }, [state.accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (allowed) void load();
    }, [allowed, load]),
  );
  useFocusEffect(
    useCallback(() => {
      if (allowed && state.accessToken) getPaySettings(state.accessToken).then((s) => setPayablesOn(s.features.payables)).catch(() => undefined);
    }, [allowed, state.accessToken]),
  );
  useEffect(() => {
    if (!allowed) setRuns(null);
  }, [allowed]);

  if (!allowed) return <Redirect href={homePath as never} />;

  return (
    <Screen title="Pay runs">
      <Text style={styles.muted}>Gross pay worked out from approved attendance. Tax and other deductions are not included.</Text>

      {runs && runs.length > 0 && (
        <View style={styles.tiles}>
          <Tile label="Pay runs" value={String(summary.count)} />
          <Tile label="Drafts" value={String(summary.drafts)} accent={summary.drafts > 0} />
          <Tile label="Total gross" value={summary.gross} />
        </View>
      )}

      <Button
        style={styles.newButton}
        icon={<Ionicons name="add" size={20} color={colors.primaryForeground} />}
        onPress={() => router.push("/pay-run-new" as never)}
      >
        New pay run
      </Button>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push("/pay-settings" as never)}>
          <Ionicons name="settings-outline" size={18} color={colors.foreground} />
          <Text style={styles.actionText}>Pay settings</Text>
        </Pressable>
        {payablesOn && (
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push("/pay-payables" as never)}>
            <Ionicons name="bus-outline" size={18} color={colors.foreground} />
            <Text style={styles.actionText}>Suppliers</Text>
          </Pressable>
        )}
      </View>

      {runs && runs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(["all", "draft", "final", "void"] as const).map((key) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === key }}
              onPress={() => setFilter(key)}
              style={[styles.chip, filter === key && styles.chipOn]}
            >
              <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>
                {key === "all" ? "All" : PAY_STATUS[key].label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {!runs && <ActivityIndicator color={colors.primary} />}
      {runs && runs.length === 0 && (
        <Card style={styles.empty}>
          <Ionicons name="cash-outline" size={32} color={colors.primary} />
          <Text style={styles.title}>No pay runs yet</Text>
          <Text style={[styles.muted, styles.center]}>Start one to turn a period&apos;s attendance into pay.</Text>
        </Card>
      )}
      {runs && runs.length > 0 && shown.length === 0 && (
        <Card>
          <Text style={[styles.muted, styles.center]}>No {filter} pay runs.</Text>
        </Card>
      )}
      {shown.map((run) => (
        <Pressable
          key={run.id}
          accessibilityRole="button"
          style={({ pressed }) => [pressed && styles.pressed]}
          onPress={() => router.push(`/pay-runs/${run.id}` as never)}
        >
          <Card style={styles.run}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.title} numberOfLines={1}>
                  {run.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {run.siteNames.join(", ") || "All sites"}
                </Text>
              </View>
              <StatusBadge tone={PAY_STATUS[run.status].tone} label={PAY_STATUS[run.status].label} />
            </View>
            <View style={styles.row}>
              <View>
                <Text style={styles.label}>GROSS PAY</Text>
                <Text style={styles.gross}>{formatMoney(run.totals.gross, run.currency)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </View>
            <View style={styles.meta}>
              <Text style={styles.muted}>{periodLabel(run)}</Text>
              <Text style={styles.muted}>
                {run.totals.people} people · {formatDays(run.totals.daysCounted)} days · {formatHours(run.totals.paidHours)}
              </Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={[styles.tileValue, accent && styles.accent]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    center: { textAlign: "center" },
    flex: { flex: 1 },
    label: { fontSize: 11, letterSpacing: 0.6, color: colors.mutedForeground },
    tiles: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
    tile: { flex: 1, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
    tileValue: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    accent: { color: colors.warning },
    newButton: { marginTop: spacing.md },
    actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 44, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    actionText: { fontSize: typography.small, fontWeight: "600", color: colors.foreground },
    chips: { gap: spacing.sm, paddingVertical: spacing.md },
    chip: { paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    chipTextOn: { color: colors.primaryForeground },
    empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
    pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    run: { marginBottom: spacing.sm, gap: spacing.md },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    meta: { gap: 2, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    gross: { fontSize: 24, fontWeight: "800", color: colors.foreground },
  }),
);
