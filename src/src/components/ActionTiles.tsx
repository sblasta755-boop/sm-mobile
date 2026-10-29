import { useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

/** The most tiles a home screen shows at once. More than this and the last one becomes "More". */
export const MAX_TILES = 4;

/**
 * Shortcuts: at most four, in a tidy two-by-two grid, each a tinted icon over a label with a count
 * pill when something is waiting. Anything beyond four (the rarer shortcuts) sits behind a fourth
 * "More" tile that opens a sheet, so the home screen never turns into a wall of buttons.
 * Tiles that need attention are shown first. Colours come from the theme (light and dark).
 */
export function ActionTiles({ items, max = MAX_TILES }: { items: ActionTile[]; max?: number }) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  if (items.length === 0) return null;

  // What needs attention first, otherwise in the order given.
  const ordered = [...items].sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
  const overflow = ordered.length > max;
  const shown = overflow ? ordered.slice(0, max - 1) : ordered;
  const rest = overflow ? ordered.slice(max - 1) : [];
  const restBadge = rest.reduce((sum, item) => sum + (item.badge ?? 0), 0);

  const tiles: ActionTile[] = [
    ...shown,
    ...(overflow
      ? [
          {
            key: "more",
            label: "More",
            icon: <Ionicons name="grid-outline" size={22} color={colors.primary} />,
            onPress: () => setMoreOpen(true),
            badge: restBadge || undefined,
          },
        ]
      : []),
  ];

  return (
    <>
      <View style={styles.grid}>
        {tiles.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.badge ? `${item.label}, ${item.badge} waiting` : item.label}
            onPress={item.onPress}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <View style={styles.topRow}>
              <View style={styles.disc}>{item.icon}</View>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]} onPress={() => undefined}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>More</Text>
            {rest.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                onPress={() => {
                  setMoreOpen(false);
                  item.onPress();
                }}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
              >
                <View style={styles.sheetDisc}>{item.icon}</View>
                <Text style={styles.sheetLabel}>{item.label}</Text>
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
    tile: {
      width: "48.5%",
      flexGrow: 1,
      minHeight: 96,
      justifyContent: "space-between",
      padding: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    disc: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    label: { fontSize: typography.body, fontWeight: "700", color: colors.foreground, marginTop: spacing.sm },
    badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.destructive, alignItems: "center", justifyContent: "center" },
    badgeText: { fontSize: 11, fontWeight: "800", color: colors.white },
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl * 1.5, borderTopRightRadius: radius.xl * 1.5, paddingTop: spacing.sm, paddingHorizontal: spacing.lg, gap: spacing.xs },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
    sheetTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground, marginBottom: spacing.xs },
    sheetRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    sheetDisc: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
    sheetLabel: { flex: 1, fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  }),
);
