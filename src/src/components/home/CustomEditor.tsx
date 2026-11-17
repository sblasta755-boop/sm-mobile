import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Seg } from "@/components/home/Seg";
import {
  customDef,
  moveById,
  patchCustomCard,
  setCardVisible,
  type CardStyle,
  type Density,
  type Period,
  type ResolvedCustom,
} from "@/domain/homeLayout";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
];

function Round({ icon, label, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; disabled?: boolean; onPress: () => void }) {
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
 * The Custom home's settings (design D-3): the look, and for each card whether it shows, where it sits, how it shows
 * its data and over what period. Each card only offers the views it can really draw.
 */
export function CustomEditor({ draft, onChange }: { draft: ResolvedCustom; onChange: (next: ResolvedCustom) => void }) {
  useThemeVersion();
  const shown = draft.cards.filter((c) => c.visible).length;
  return (
    <View>
      <Text style={styles.section}>Density</Text>
      <Seg<Density>
        full
        label="Density"
        value={draft.look.density}
        onChange={(density) => onChange({ ...draft, look: { ...draft.look, density } })}
        options={[
          { id: "comfortable", label: "Comfortable" },
          { id: "compact", label: "Compact" },
        ]}
      />
      <Text style={styles.section}>Card style</Text>
      <Seg<CardStyle>
        full
        label="Card style"
        value={draft.look.cardStyle}
        onChange={(cardStyle) => onChange({ ...draft, look: { ...draft.look, cardStyle } })}
        options={[
          { id: "filled", label: "Filled" },
          { id: "outlined", label: "Outlined" },
        ]}
      />
      <Text style={styles.section}>How each card shows its data</Text>
      {draft.cards.map((card, i) => {
        const def = customDef(card.id);
        if (!def) return null;
        return (
          <View key={card.id} style={[styles.row, !card.visible && styles.rowOff]}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{def.label}</Text>
                <Text style={styles.hint} numberOfLines={1}>{def.hint}</Text>
              </View>
              <Round icon="arrow-up" label={`Move ${def.label} up`} disabled={i === 0} onPress={() => onChange({ ...draft, cards: moveById(draft.cards, card.id, -1) })} />
              <Round icon="arrow-down" label={`Move ${def.label} down`} disabled={i === draft.cards.length - 1} onPress={() => onChange({ ...draft, cards: moveById(draft.cards, card.id, 1) })} />
              <Round
                icon={card.visible ? "eye-outline" : "eye-off-outline"}
                label={card.visible ? `Hide ${def.label}` : `Show ${def.label}`}
                disabled={card.visible && shown <= 1}
                onPress={() => onChange({ ...draft, cards: setCardVisible(draft.cards, card.id, !card.visible) })}
              />
            </View>
            {card.visible && (def.views.length > 1 || def.periods) ? (
              <View style={styles.segs}>
                {def.views.length > 1 ? (
                  <Seg small label={`${def.label} view`} value={card.view} onChange={(view) => onChange(patchCustomCard(draft, card.id, { view }))} options={def.views} />
                ) : null}
                {def.periods ? (
                  <Seg<Period> small label={`${def.label} period`} value={card.period ?? "30"} onChange={(period) => onChange(patchCustomCard(draft, card.id, { period }))} options={PERIOD_OPTIONS} />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {shown <= 1 ? <Text style={styles.hint}>Keep at least one card on your home.</Text> : null}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: {
      fontSize: typography.tiny,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    row: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    rowOff: { backgroundColor: "transparent", borderStyle: "dashed" },
    rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    name: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    segs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
    round: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
