import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/theme";

export function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[
        styles.box,
        checked && styles.boxChecked,
        disabled && styles.boxDisabled,
      ]}
      hitSlop={8}
    >
      {checked && <Ionicons name="checkmark" size={16} color={colors.primaryForeground} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  boxDisabled: {
    opacity: 0.5,
  },
});
