import { useCallback, useEffect, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { listPayRuns, type PayRun } from "@/api/client";
import { formatDays, formatHours, formatMoney, periodLabel } from "@/domain/payroll";
import { useCanUsePayroll } from "@/features/payroll";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
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
  useEffect(() => {
    if (!allowed) setRuns(null);
  }, [allowed]);

  if (!allowed) return <Redirect href={homePath as never} />;

  return (
    <Screen title="Pay runs">
      <Text style={styles.muted}>
        Work out each person&apos;s gross pay from approved attendance (or days you type in) and the hourly rate you
        enter. Tax and other deductions are not included.
      </Text>
      <Button style={styles.newButton} onPress={() => router.push("/pay-run-new" as never)}>
        New pay run
      </Button>
      {!runs && <ActivityIndicator color={colors.primary} />}
      {runs && runs.length === 0 && (
        <Card>
          <Text style={styles.muted}>No pay runs yet. Start one to turn a period&apos;s attendance into pay.</Text>
        </Card>
      )}
      {runs?.map((run) => (
        <Pressable key={run.id} accessibilityRole="button" onPress={() => router.push(`/pay-runs/${run.id}` as never)}>
          <Card style={styles.run}>
            <View style={styles.row}>
              <Text style={styles.title} numberOfLines={1}>
                {run.title}
              </Text>
              <StatusBadge tone={PAY_STATUS[run.status].tone} label={PAY_STATUS[run.status].label} />
            </View>
            <Text style={styles.muted}>
              {periodLabel(run)} · {run.siteNames.join(", ") || "All sites"}
            </Text>
            <View style={styles.row}>
              <Text style={styles.muted}>
                {run.totals.people} people · {formatDays(run.totals.daysCounted)} days · {formatHours(run.totals.paidHours)}
              </Text>
              <Text style={styles.gross}>{formatMoney(run.totals.gross, run.currency)}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    newButton: { marginVertical: spacing.md },
    run: { marginBottom: spacing.sm, gap: 4 },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { flex: 1, fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    gross: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
  }),
);
