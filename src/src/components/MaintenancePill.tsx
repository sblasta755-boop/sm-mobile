import { StyleSheet, Text, View } from "react-native";
import type { MaintenanceTone } from "@/domain/maintenance";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/** A small coloured label for a job's state, urgency or hold. */
export function MaintenancePill({ label, tone }: { label: string; tone: MaintenanceTone }) {
  useThemeVersion();
  const palette = {
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warningForeground },
    danger: { bg: colors.destructiveSoft, fg: colors.destructive },
    info: { bg: colors.infoSoft, fg: colors.info },
    muted: { bg: colors.muted, fg: colors.mutedForeground },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    pill: { borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    text: { fontSize: typography.tiny, fontWeight: "700", textTransform: "capitalize" },
  }),
);
