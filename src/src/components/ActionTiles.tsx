import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

export type ActionTile = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  /** A small line under the label, e.g. a count. */
  hint?: string;
  /** A count pill on the tile, for something that needs attention. */
  badge?: number;
};

/**
 * Shortcut tiles, two to a row, replacing a stack of full-width buttons. Each
 * has an icon in a tinted disc and a short label; an odd last tile spans the
 * row so nothing is left hanging. Colours come from the theme (light and dark).
 */
export function ActionTiles({ items }: { items: ActionTile[] }) {
  useThemeVersion();
  if (items.length === 0) return null;
  return (
    <View style={styles.grid}>
      {items.map((item, index) => {
        const alone = items.length % 2 === 1 && index === items.length - 1;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [styles.tile, alone && styles.tileWide, pressed && styles.pressed]}
          >
            <View style={styles.disc}>
              {item.icon}
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 9 ? "9+" : item.badge}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.text}>
              <Text style={styles.label} numberOfLines={2}>
                {item.label}
              </Text>
              {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    badge: { position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: colors.destructive, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 10, fontWeight: "800", color: colors.white },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    tile: {
      flexBasis: "48%",
      flexGrow: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 62,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    tileWide: { flexBasis: "100%" },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    disc: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    text: { flex: 1 },
    label: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground, marginTop: 1 },
  }),
);
