import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** A small segmented choice: one option pressed at a time, every label always visible. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  small,
  full,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  small?: boolean;
  /** Stretch across the width, options sharing it equally. */
  full?: boolean;
}) {
  useThemeVersion();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.row, full ? styles.full : styles.fit]}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[styles.opt, small && styles.optSmall, full && styles.optFull, on && styles.optOn]}
          >
            <Text style={[styles.text, small && styles.textSmall, on && styles.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.round,
      padding: 3,
      gap: 2,
    },
    fit: { alignSelf: "flex-start" },
    full: { alignSelf: "stretch" },
    opt: { height: 32, paddingHorizontal: spacing.md + 2, borderRadius: radius.round, alignItems: "center", justifyContent: "center" },
    optSmall: { height: 26, paddingHorizontal: spacing.sm + 2 },
    optFull: { flex: 1, height: 36 },
    optOn: { backgroundColor: colors.primary },
    text: { fontSize: typography.small + 1, fontWeight: "600", color: colors.mutedForeground },
    textSmall: { fontSize: typography.small - 0.5 },
    textOn: { color: colors.primaryForeground },
  }),
);
