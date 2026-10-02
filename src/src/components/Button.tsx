import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
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
  /** A handler that returns a promise keeps the button busy (disabled, with a
   * spinner) until it settles, so a second tap can't repeat the action. */
  onPress?: () => unknown;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const handlePress = onPress
    ? () => {
        if (locked.current) return;
        const result = onPress() as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          locked.current = true;
          setPending(true);
          (result as Promise<unknown>)
            .catch((error: unknown) => {
              // A failure nothing else reported - never let it vanish silently.
              Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");
            })
            .finally(() => {
              locked.current = false;
              if (mounted.current) setPending(false);
            });
        }
      }
    : undefined;
  const busy = loading || pending;
  const isDisabled = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {busy ? (
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
