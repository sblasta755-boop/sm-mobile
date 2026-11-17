import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { appAlert } from "@/components/Dialog";
import { SettingsRow, SettingsSection } from "@/components/SettingsKit";
import { Seg } from "@/components/home/Seg";
import { TemplatePicker } from "@/components/home/TemplatePicker";
import type { Home } from "@/domain/homeLayout";
import { useHomeLayout } from "@/features/useHomeLayout";
import {
  colors,
  spacing,
  typography,
  themedStyles,
  useThemeVersion,
} from "@/theme";

/**
 * Everything about choosing and arranging the home screen, in one place in Profile: which home opens, ready-made
 * templates, arranging either home in place, and going back to the default. The home screen itself stays clean.
 * Nothing for people who have no customisable home.
 */
export function HomeScreenSettings() {
  useThemeVersion();
  const home = useHomeLayout();
  if (!home.canCustomise) return null;

  if (home.locked)
    return (
      <SettingsSection title="Home screen">
        <SettingsRow
          icon="lock-closed-outline"
          title="Set by your administrator"
          sub="You cannot change your home screen."
        />
      </SettingsSection>
    );

  const reset = () =>
    appAlert(
      "Reset your home screen?",
      "Both homes go back to the default and your changes are removed.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => void home.reset(),
        },
      ],
    );

  return (
    <SettingsSection title="Home screen">
      <View style={styles.block}>
        <Text style={styles.label}>Opens on</Text>
        <Seg<Home>
          full
          label="Opens on"
          value={home.active}
          onChange={(next) => void home.setActive(next)}
          options={[
            { id: "classic", label: "Classic" },
            { id: "custom", label: "Custom" },
          ]}
        />
        <Text style={styles.hint}>
          Classic is the home you know. Custom lets you choose the look and how
          each card shows its data.
        </Text>
        <Text style={[styles.label, { marginTop: spacing.md }]}>
          Start from a template
        </Text>
        <TemplatePicker home={home} />
      </View>
      <SettingsRow
        icon="options-outline"
        title="Arrange Classic home"
        sub="Move, hide and choose cards"
        onPress={() => router.push("/manage-home?arrange=classic" as never)}
      />
      <SettingsRow
        icon="color-palette-outline"
        title="Arrange Custom home"
        sub="Choose the look and how each card shows its data"
        onPress={() => router.push("/manage-home?arrange=custom" as never)}
      />
      <SettingsRow
        icon="refresh-outline"
        title="Reset to default"
        tone="destructive"
        onPress={reset}
      />
    </SettingsSection>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    block: { padding: spacing.md },
    label: {
      fontSize: typography.small + 1,
      fontWeight: "700",
      color: colors.foreground,
      marginBottom: spacing.xs + 2,
    },
    hint: {
      fontSize: typography.small,
      color: colors.mutedForeground,
      marginTop: spacing.xs + 2,
    },
  }),
);
