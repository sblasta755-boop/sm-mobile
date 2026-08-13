import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

export function SelectField({
  label,
  value,
  options,
  onChange,
  capitalize,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  capitalize?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, capitalize && styles.capitalize]}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option}
                  style={styles.option}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, capitalize && styles.capitalize, option === value && styles.optionTextSelected]}>
                    {option}
                  </Text>
                  {option === value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
