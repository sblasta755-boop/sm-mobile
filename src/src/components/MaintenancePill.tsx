import { StyleSheet, Text, View } from "react-native";
import type { MaintenanceTone } from "@/domain/maintenance";
import { colors, radius, typography, themedStyles, useThemeVersion } from "@/theme";

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
      <Text style={[styles.text, { color: palette.fg }]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    pill: { borderRadius: radius.round, paddingHorizontal: 10, paddingVertical: 2 },
    text: { fontSize: typography.small, fontWeight: "600" },
  }),
);
