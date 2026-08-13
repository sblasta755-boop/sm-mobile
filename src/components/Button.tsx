import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing, typography } from "@/theme";

type Variant = "primary" | "outline" | "destructive" | "ghost";

export function Button({
  children,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
  fullWidth = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? colors.primaryForeground : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, textStyles[variant]]}>{children}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fullWidth: {
    width: "100%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  text: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

const variantStyles: Record<Variant, ViewStyle> = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  destructive: { backgroundColor: colors.destructive },
  ghost: { backgroundColor: "transparent" },
});

const textStyles = StyleSheet.create({
  primary: { color: colors.primaryForeground },
  outline: { color: colors.foreground },
  destructive: { color: colors.white },
  ghost: { color: colors.primary },
});
