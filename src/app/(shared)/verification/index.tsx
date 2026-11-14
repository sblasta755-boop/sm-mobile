import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import {
  listAvailableVerificationWorkflows,
  listVerificationRuns,
  type VerificationWorkflow,
} from "@/api/client";
import { mixHex } from "@/domain/calendarGrid";
import { ordersRange } from "@/domain/verificationOrders";
import { workflowOutline } from "@/domain/verification";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Pick which verification to run, with how many were done today and a way to see them. */
export default function VerificationIndexScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [workflows, setWorkflows] = useState<VerificationWorkflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setError(null);
    listAvailableVerificationWorkflows(token)
      .then(setWorkflows)
      .catch((e) => {
        setWorkflows([]);
        setError(e instanceof Error ? e.message : "Check your connection and try again.");
      });
    // The count is a nicety: if it cannot be loaded the card just shows a dash.
    const [startDate, endDate] = ordersRange("today");
    listVerificationRuns(token, { startDate, endDate })
      .then((out) => setToday(out.total))
      .catch(() => setToday(null));
  }, [token]);
  useEffect(load, [load]);

  return (
    <Screen title="Verify an order">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My verified orders"
        onPress={() => router.push("/verification/orders" as never)}
        style={styles.hero}
      >
        <LinearGradient
          colors={[colors.primary, mixHex(colors.primary, "#000000", 0.35)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroText}>
          <Text style={styles.heroLabel}>VERIFIED TODAY</Text>
          <Text style={styles.heroCount}>{today === null ? "-" : today}</Text>
          <Text style={styles.heroHint}>{today === 0 ? "Nothing yet. Start one below." : "See them and their photos"}</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="clipboard-outline" size={26} color={colors.primaryForeground} />
        </View>
      </Pressable>

      <Text style={styles.section}>Start a check</Text>

      {workflows === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Could not load the checks</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button variant="outline" onPress={load}>
            Try again
          </Button>
        </View>
      ) : workflows.length === 0 ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="scan-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.cardTitle}>Nothing to run yet</Text>
          <Text style={styles.muted}>Ask your manager to set up an order check.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {workflows.map((w) => (
            <Pressable
              key={w.id}
              accessibilityRole="button"
              accessibilityLabel={`Start ${w.name}`}
              onPress={() => router.push(`/verification/${w.id}` as never)}
              style={({ pressed }) => [styles.card, styles.workflow, pressed && styles.pressed]}
            >
              <View style={styles.workflowIcon}>
                <Ionicons name="scan-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.workflowText}>
                <Text style={styles.cardTitle}>{w.name}</Text>
                {w.description ? (
                  <Text style={styles.muted} numberOfLines={2}>
                    {w.description}
                  </Text>
                ) : null}
                <View style={styles.chips}>
                  {workflowOutline(w.steps).map((chip) => (
                    <View key={chip} style={styles.chip}>
                      <Text style={styles.chipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.go}>
                <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.xl,
      overflow: "hidden",
    },
    heroText: { flex: 1 },
    heroLabel: { fontSize: typography.tiny, fontWeight: "700", letterSpacing: 1, color: colors.primaryForeground, opacity: 0.8 },
    heroCount: { fontSize: 40, fontWeight: "800", color: colors.primaryForeground, marginTop: 2 },
    heroHint: { fontSize: typography.small, color: colors.primaryForeground, opacity: 0.9, marginTop: spacing.xs },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    section: { fontSize: typography.small, fontWeight: "700", color: colors.mutedForeground, marginTop: spacing.lg, marginBottom: spacing.sm },
    list: { gap: spacing.sm },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      backgroundColor: colors.card,
      padding: spacing.md,
      gap: spacing.xs,
    },
    pressed: { transform: [{ scale: 0.985 }] },
    empty: { alignItems: "center", paddingVertical: spacing.xl },
    workflow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    workflowIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.lg,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    workflowText: { flex: 1, gap: 2 },
    cardTitle: { fontSize: typography.body, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.xs },
    chip: { backgroundColor: colors.muted, borderRadius: radius.round, paddingHorizontal: 8, paddingVertical: 2 },
    chipText: { fontSize: typography.tiny, fontWeight: "600", color: colors.mutedForeground },
    go: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
