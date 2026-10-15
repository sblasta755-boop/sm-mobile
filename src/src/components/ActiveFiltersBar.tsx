import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { filtersActive } from "@/domain/taskBoard";
import { resetTaskFilters, useTaskFilters } from "@/features/taskFilters";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/** On a home screen: says the task lists are filtered, and clears the filters. */
export function ActiveFiltersBar() {
  useThemeVersion();
  const [filters] = useTaskFilters();
  if (!filtersActive(filters)) return null;
  const parts = [
    filters.query.trim() ? `"${filters.query.trim()}"` : null,
    filters.priority !== "all" ? `${filters.priority} priority` : null,
    filters.overdueOnly ? "overdue" : null,
    ...filters.tags,
  ].filter(Boolean);
  return (
    <View style={styles.bar}>
      <Ionicons name="options-outline" size={16} color={colors.primary} />
      <Text style={styles.text} numberOfLines={2}>
        Filtered: {parts.join(", ")}
      </Text>
      <Pressable accessibilityRole="button" onPress={resetTaskFilters}>
        <Text style={styles.clear}>Clear</Text>
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
    text: { flex: 1, fontSize: typography.small, color: colors.foreground },
    clear: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
  }),
);
