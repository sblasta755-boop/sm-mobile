import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { listAvailableVerificationWorkflows, type VerificationWorkflow } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** Pick which verification to run. The list is whatever the organisation has built and switched on. */
export default function VerificationIndexScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [workflows, setWorkflows] = useState<VerificationWorkflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setError(null);
    listAvailableVerificationWorkflows(token)
      .then(setWorkflows)
      .catch((e) => {
        setWorkflows([]);
        setError(e instanceof Error ? e.message : "Check your connection and try again.");
      });
  }, [token]);
  useEffect(load, [load]);

  return (
    <Screen title="Verify an order">
      {workflows === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : error ? (
        <Card>
          <Text style={styles.title}>Could not load the checks</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : workflows.length === 0 ? (
        <Card>
          <Text style={styles.title}>Nothing to run yet</Text>
          <Text style={styles.muted}>Ask your manager to set up an order check.</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {workflows.map((w) => (
            <Pressable
              key={w.id}
              accessibilityRole="button"
              accessibilityLabel={`Start ${w.name}`}
              onPress={() => router.push(`/verification/${w.id}` as never)}
            >
              <Card>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.title}>{w.name}</Text>
                    <Text style={styles.muted}>
                      {w.description || `${w.steps.length} steps`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    list: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    rowText: { flex: 1, gap: 2 },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    retry: { marginTop: spacing.sm },
    retryText: { color: colors.primary, fontWeight: "700" },
  }),
);
