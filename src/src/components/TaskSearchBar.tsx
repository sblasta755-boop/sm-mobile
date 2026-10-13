import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { filtersActive, NO_FILTERS, type PriorityFilter, type TaskFilters } from "@/domain/taskBoard";
import { useSmartClean } from "@/features/store";
import { tagStyle } from "@/domain/tagColors";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const PRIORITIES: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/**
 * A search box and a Filter button for task lists. Search matches a task's
 * title, room, priority and status; Filter narrows by priority and to overdue
 * work. Controlled, so the list and the bar share one filter.
 */
export function TaskSearchBar({
  filters,
  onChange,
  placeholder = "Search tasks",
  availableTags = [],
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  placeholder?: string;
  /** Tags the list could be narrowed to (shown in their colours). */
  availableTags?: string[];
}) {
  const { state } = useSmartClean();
  const [open, setOpen] = useState(false);
  const activeCount =
    (filters.priority !== "all" ? 1 : 0) + (filters.overdueOnly ? 1 : 0) + filters.tags.length;
  const toggleTag = (tag: string) =>
    onChange({
      ...filters,
      tags: filters.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? filters.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...filters.tags, tag],
    });

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} style={styles.searchIcon} />
          <TextInput
            value={filters.query}
            onChangeText={(query) => onChange({ ...filters, query })}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={placeholder}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
          />
          {filters.query !== "" && (
            <Pressable accessibilityLabel="Clear search" onPress={() => onChange({ ...filters, query: "" })} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activeCount > 0 ? `Filter, ${activeCount} active` : "Filter"}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={[styles.filterButton, (open || activeCount > 0) && styles.filterButtonOn]}
        >
          <Ionicons name="options-outline" size={18} color={open || activeCount > 0 ? colors.primary : colors.foreground} />
          {activeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {open && (
        <View style={styles.panel}>
          <View style={styles.chips}>
            {PRIORITIES.map((option) => {
              const selected = filters.priority === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChange({ ...filters, priority: option.value })}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {availableTags.length > 0 && (
            <View style={styles.chips}>
              {availableTags.map((tag) => {
                const selected = filters.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                const look = tagStyle(tag, state.tagColors);
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => toggleTag(tag)}
                    style={[
                      styles.chip,
                      { borderColor: look.borderColor, backgroundColor: selected ? look.color : look.backgroundColor },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: selected ? colors.white : look.color }]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: filters.overdueOnly }}
            onPress={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
            style={styles.toggleRow}
          >
            <Ionicons
              name={filters.overdueOnly ? "checkbox" : "square-outline"}
              size={18}
              color={filters.overdueOnly ? colors.primary : colors.mutedForeground}
            />
            <Text style={styles.toggleText}>Overdue only</Text>
          </Pressable>
          {filtersActive(filters) && (
            <Pressable onPress={() => onChange(NO_FILTERS)}>
              <Text style={styles.clear}>Clear search and filters</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { marginBottom: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: 2 },
  input: { flex: 1, paddingVertical: 9, fontSize: typography.body, color: colors.foreground },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonOn: { borderColor: colors.primary },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: colors.white },
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
  chipTextOn: { color: colors.primaryForeground },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  toggleText: { fontSize: typography.small, color: colors.foreground },
  clear: { fontSize: typography.small, color: colors.primary },
}));
