import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { filtersActive } from "@/domain/taskBoard";
import { resetTaskFilters, useTaskFilters } from "@/features/taskFilters";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * On a home screen: says the task lists are filtered, and clears the filters. When the filter is hiding
 * tasks that are due now it is loud about it, because that is how a leftover filter makes tonight's
 * work disappear.
 */
export function ActiveFiltersBar({
  hiddenCount = 0,
  relaxed = false,
  scope = "due now",
}: {
  /** Tasks the filter is hiding while others are shown. */
  hiddenCount?: number;
  /** The filter matched nothing, so everything is listed instead. */
  relaxed?: boolean;
  /** What the hidden tasks are: "due now" on today, "on this day" on another day. */
  scope?: string;
}) {
  useThemeVersion();
  const [filters] = useTaskFilters();
  if (!filtersActive(filters)) return null;
  const parts = [
    filters.query.trim() ? `"${filters.query.trim()}"` : null,
    filters.priority !== "all" ? `${filters.priority} priority` : null,
    filters.overdueOnly ? "overdue" : null,
    ...filters.tags,
  ].filter(Boolean);
  const loud = relaxed || hiddenCount > 0;
  const message = relaxed
    ? `Your filter (${parts.join(", ")}) matched nothing, so everything ${scope} is shown.`
    : hiddenCount > 0
      ? `Filter (${parts.join(", ")}) is hiding ${hiddenCount} task${hiddenCount === 1 ? "" : "s"} ${scope}.`
      : `Filtered: ${parts.join(", ")}`;
  return (
    <View style={[styles.bar, loud && styles.barLoud]} accessibilityRole="alert">
      <Ionicons name={loud ? "alert-circle" : "options-outline"} size={16} color={loud ? colors.warningForeground : colors.primary} />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
      <Pressable accessibilityRole="button" onPress={resetTaskFilters}>
        <Text style={styles.clear}>{loud ? "Show all" : "Clear"}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      marginBottom: spacing.sm,
    },
    barLoud: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning },
    text: { flex: 1, fontSize: typography.small, color: colors.foreground },
    clear: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
  }),
);
