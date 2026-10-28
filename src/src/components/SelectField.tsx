import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/** More options than this and the list gets a search box. */
const SEARCH_FROM = 6;

export function SelectField({
  label,
  value,
  options,
  onChange,
  capitalize,
  disabled,
  searchable,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  capitalize?: boolean;
  disabled?: boolean;
  /** Show a search box. Defaults to on once the list is long enough to need one. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const showSearch = searchable ?? options.length > SEARCH_FROM;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Text style={[styles.triggerText, capitalize && styles.capitalize]}>{value}</Text>
        {!disabled && <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={[styles.backdrop, showSearch && styles.backdropTop]} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {showSearch && (
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${options.length} options`}
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                />
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {showSearch && shown.length === 0 && <Text style={styles.empty}>Nothing matches "{query.trim()}".</Text>}
              {shown.map((option) => (
                <Pressable
                  key={option}
                  style={styles.option}
                  onPress={() => {
                    onChange(option);
                    close();
                  }}
                >
                  <Text style={[styles.optionText, capitalize && styles.capitalize, option === value && styles.optionTextSelected]}>
                    {option}
                  </Text>
                  {option === value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerText: {
    fontSize: typography.body,
    color: colors.foreground,
  },
  capitalize: {
    textTransform: "capitalize",
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.xl,
  },
  backdropTop: {
    // Keeps the list clear of the keyboard while searching.
    justifyContent: "flex-start",
    paddingTop: spacing.xxl * 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 16,
    color: colors.foreground,
  },
  empty: {
    padding: spacing.lg,
    textAlign: "center",
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  sheet: {
    maxHeight: 360,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionText: {
    fontSize: typography.body,
    color: colors.foreground,
  },
  optionTextSelected: {
    fontWeight: "700",
    color: colors.primary,
  },
}));
