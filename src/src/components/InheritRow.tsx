import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * "Use the organisation default" for one setting at a site. On means the site follows the organisation and the
 * control below it shows what the organisation has; off means the site has its own value. The same idea as the web
 * app's InheritToggle and the menu settings panel.
 */
export function InheritRow({
  inherit,
  onChange,
  current,
  label = "Use the organisation default",
  disabled,
}: {
  inherit: boolean;
  onChange: (inherit: boolean) => void;
  /** What the organisation has now, in words: "Mon to Sat", "07:00 to 16:00". */
  current: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>Organisation: {current}</Text>
      </View>
      <Switch
        value={inherit}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.neutral }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.muted,
    },
    copy: { flex: 1, gap: 2 },
    label: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
