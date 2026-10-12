import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Corrective actions across this supervisor's sites.
 *
 * Differs from the cleaner's corrective-actions screen, which lists only
 * what is assigned TO them to fix. A supervisor raises these, assigns
 * them and closes them, so the default view is everything open at their
 * sites - filtered by the backend to exactly that (is_site_scoped).
 */
const FILTERS = ["Open", "Overdue", "Mine", "Closed"] as const;
type Filter = (typeof FILTERS)[number];

export default function SuperviseActions() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const [filter, setFilter] = useState<Filter>("Open");

  const actions = useMemo(() => {
    const all = state.correctiveActions;
    const now = Date.now();
    switch (filter) {
      case "Open":
        return all.filter((action) => action.status !== "closed");
      case "Overdue":
        return all.filter(
          (action) =>
            action.status !== "closed" && new Date(action.deadline).getTime() < now,
        );
      case "Mine":
        // Assigned to me. CorrectiveAction has no "raised by" id - the
        // raiser appears only as a display name in `timeline` - so this
        // cannot also mean "ones I opened" without matching on a human
        // name, which would be wrong the moment two people share one.
        return all.filter(
          (action) =>
            action.status !== "closed" && action.assigneeId === currentUser?.id,
        );
      case "Closed":
        return all.filter((action) => action.status === "closed");
    }
  }, [state.correctiveActions, filter, currentUser]);

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      Open: state.correctiveActions.filter((a) => a.status !== "closed").length,
      Overdue: state.correctiveActions.filter(
        (a) => a.status !== "closed" && new Date(a.deadline).getTime() < now,
      ).length,
      Mine: state.correctiveActions.filter(
        (a) => a.status !== "closed" && a.assigneeId === currentUser?.id,
      ).length,
      Closed: state.correctiveActions.filter((a) => a.status === "closed").length,
    } as Record<Filter, number>;
  }, [state.correctiveActions, currentUser]);

  return (
    <Screen title="Corrective actions">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsRow}
        contentContainerStyle={styles.tabsContent}
      >
        {FILTERS.map((option) => {
          const selected = option === filter;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setFilter(option)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                {option}
              </Text>
              <View style={[styles.count, selected && styles.countSelected]}>
                <Text style={[styles.countText, selected && styles.countTextSelected]}>
                  {counts[option]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {actions.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="checkmark-done" size={24} color={colors.success} />
          <Text style={styles.muted}>Nothing here.</Text>
        </Card>
      ) : (
        actions.map((action) => {
          const overdue =
            action.status !== "closed" && new Date(action.deadline).getTime() < Date.now();
          return (
            <Pressable
              key={action.id}
              onPress={() => router.push(`/corrective-actions/${action.id}`)}
            >
              <Card style={[styles.card, overdue && styles.cardOverdue]}>
                <Ionicons
                  name={overdue ? "alert-circle" : "construct-outline"}
                  size={18}
                  color={overdue ? colors.destructive : colors.mutedForeground}
                />
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={2}>
                    {action.reason}
                  </Text>
                  <Text style={styles.muted}>
                    Due{" "}
                    {new Date(action.deadline).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "short",
                    })}
                  </Text>
                </View>
                <StatusBadge
                  tone={
                    action.status === "closed"
                      ? "success"
                      : overdue
                        ? "destructive"
                        : "warning"
                  }
                  label={action.status.replace(/_/g, " ")}
                />
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  tabsRow: {
    marginBottom: spacing.md,
    flexGrow: 0,
  },
  tabsContent: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  tabLabelSelected: {
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.round,
    backgroundColor: colors.secondary,
    alignItems: "center",
  },
  countSelected: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  countText: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.mutedForeground,
  },
  countTextSelected: {
    color: colors.primaryForeground,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardOverdue: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
