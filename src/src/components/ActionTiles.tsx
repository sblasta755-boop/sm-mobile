import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

export type ActionTile = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  /** Not shown: the label and the count say it. Kept so callers need no change. */
  hint?: string;
  /** A count pill on the tile, for something that needs attention. */
  badge?: number;
};

/**
 * Shortcut tiles: a tidy grid, three to a row, each an icon in a tinted disc over a short label. A count
 * pill sits on the icon when something needs attention. There is no second line of text; the label says
 * what it is, and the count says what is waiting. Colours come from the theme (light and dark).
 */
export function ActionTiles({ items }: { items: ActionTile[] }) {
  useThemeVersion();
  if (items.length === 0) return null;
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.badge ? `${item.label}, ${item.badge} waiting` : item.label}
          onPress={item.onPress}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        >
          <View style={styles.disc}>
            {item.icon}
            {item.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge > 9 ? "9+" : item.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    badge: { position: "absolute", top: -4, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.destructive, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card },
    badgeText: { fontSize: 10, fontWeight: "800", color: colors.white },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
    tile: {
      width: "31.5%",
      flexGrow: 1,
      maxWidth: "33%",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: spacing.sm,
      minHeight: 96,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
    disc: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    label: { fontSize: typography.small, fontWeight: "600", textAlign: "center", color: colors.foreground },
  }),
);
