import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const SCALE = 0.62;

/**
 * A miniature of its children: laid out at full width, then drawn smaller, with the height shrunk to match. Touches
 * are switched off so a card's own buttons cannot fire while the home is being arranged.
 */
function Miniature({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: height * SCALE, overflow: "hidden" }}
    >
      {width > 0 ? (
        <View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={{ width: width / SCALE, transform: [{ scale: SCALE }], transformOrigin: "top left" }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.round, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}

/**
 * One card while the home is being arranged (design A-1): a dashed frame with its name, move up, move down and a
 * show/hide eye, around a miniature of the card. No dragging: arrows need no new native library, so a build that has
 * not been updated is never at risk.
 */
export function HomeEditFrame({
  title,
  visible,
  canMoveUp,
  canMoveDown,
  canHide,
  onUp,
  onDown,
  onToggle,
  placeholder,
  children,
}: {
  title: string;
  visible: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** False for the only card still showing. */
  canHide: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
  /** Shown instead of a miniature when the card has nothing to draw right now. */
  placeholder?: string;
  children?: ReactNode;
}) {
  useThemeVersion();
  return (
    <View style={[styles.frame, !visible && styles.frameHidden]}>
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <RoundButton icon="arrow-up" label={`Move ${title} up`} disabled={!canMoveUp} onPress={onUp} />
        <RoundButton icon="arrow-down" label={`Move ${title} down`} disabled={!canMoveDown} onPress={onDown} />
        <RoundButton
          icon={visible ? "eye-outline" : "eye-off-outline"}
          label={visible ? `Hide ${title}` : `Show ${title}`}
          disabled={visible && !canHide}
          onPress={onToggle}
        />
      </View>
      <View style={!visible ? { opacity: 0.35 } : undefined}>
        {placeholder ? <Text style={styles.placeholder}>{placeholder}</Text> : <Miniature>{children}</Miniature>}
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    frame: {
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.primary,
      borderRadius: radius.xl + 8,
      padding: spacing.sm,
      marginBottom: spacing.md,
      backgroundColor: colors.accent,
    },
    frameHidden: { borderColor: colors.mutedForeground, backgroundColor: "transparent" },
    bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm, paddingLeft: spacing.xs },
    title: { flex: 1, fontSize: typography.small + 1, fontWeight: "700", color: colors.foreground },
    round: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    placeholder: { fontSize: typography.small, color: colors.mutedForeground, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  }),
);
