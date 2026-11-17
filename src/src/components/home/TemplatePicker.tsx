import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appAlert } from "@/components/Dialog";
import { customDef, isDefaultCustom } from "@/domain/homeLayout";
import {
  matchingTemplate,
  TEMPLATES,
  templateCustom,
  templatePatch,
  type HomeTemplate,
} from "@/domain/homeTemplates";
import type { HomeLayoutApi } from "@/features/useHomeLayout";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/** The ready-made Custom homes, one card each. `current` is the one in use, if the person's home still matches it. */
export function TemplateList({
  current,
  onPick,
  busy,
}: {
  current?: string;
  onPick: (template: HomeTemplate) => void;
  busy?: boolean;
}) {
  useThemeVersion();
  return (
    <View accessibilityLabel="Templates">
      {TEMPLATES.map((t) => {
        const selected = current === t.id;
        const look = templateCustom(t).look;
        return (
          <View key={t.id} style={[styles.card, selected && styles.cardOn]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {t.name}
                {selected ? "  ·  In use" : ""}
              </Text>
              <Text style={styles.blurb}>{t.blurb}</Text>
              <Text style={styles.meta}>
                For: {t.forWho}.{" "}
                {look.density === "compact" ? "Compact" : "Roomy"},{" "}
                {look.cardStyle === "outlined" ? "outlined" : "filled"} cards.
              </Text>
              <Text style={styles.cards}>
                {t.cards
                  .map((c) => customDef(c.id)?.label ?? c.id)
                  .join("  ·  ")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use the ${t.name} template`}
              accessibilityState={{ disabled: !!busy || selected }}
              disabled={busy || selected}
              onPress={() => onPick(t)}
              style={[styles.use, selected && styles.useOff]}
            >
              <Text
                style={[
                  styles.useText,
                  selected && { color: colors.mutedForeground },
                ]}
              >
                {selected ? "In use" : "Use"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A chip that opens the list of ready-made Custom homes under it. Choosing one replaces the person's Custom home
 * (after asking, if they had made their own) and opens it; they can change anything afterwards.
 */
export function TemplatePicker({ home }: { home: HomeLayoutApi }) {
  useThemeVersion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (home.locked) return null;

  const current = matchingTemplate(home.custom);
  const hasOwn = !isDefaultCustom(home.custom) && !current;

  const apply = async (t: HomeTemplate) => {
    setBusy(true);
    try {
      await home.apply(templatePatch(t));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  const choose = (t: HomeTemplate) => {
    if (!hasOwn) return void apply(t);
    appAlert(
      `Use the ${t.name} template?`,
      "Your own Custom home is replaced. You can change the template afterwards.",
      [
        { text: "Keep mine", style: "cancel" },
        { text: "Use template", onPress: () => void apply(t) },
      ],
    );
  };

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a template"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.chip}
      >
        <Ionicons name="albums-outline" size={15} color={colors.foreground} />
        <Text style={styles.chipText}>Templates</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.mutedForeground}
        />
      </Pressable>
      {open && (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={styles.intro}>
            Pick the one closest to your day. It sets the look and the cards of
            your Custom home.
          </Text>
          <TemplateList current={current?.id} onPick={choose} busy={busy} />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    chip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      height: 32,
      paddingHorizontal: spacing.md,
      borderRadius: radius.round,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipText: {
      fontSize: typography.small + 1,
      fontWeight: "600",
      color: colors.foreground,
    },
    intro: {
      fontSize: typography.small + 1,
      color: colors.mutedForeground,
      marginBottom: spacing.sm,
    },
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: spacing.sm,
    },
    cardOn: { borderColor: colors.primary },
    name: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    blurb: {
      fontSize: typography.small + 1,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    meta: {
      fontSize: typography.small,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    cards: {
      fontSize: typography.small,
      color: colors.mutedForeground,
      marginTop: spacing.xs + 2,
    },
    use: {
      height: 34,
      minWidth: 58,
      paddingHorizontal: spacing.md,
      borderRadius: radius.round,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    useOff: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    useText: {
      fontSize: typography.small + 1,
      fontWeight: "700",
      color: colors.primaryForeground,
    },
  }),
);
