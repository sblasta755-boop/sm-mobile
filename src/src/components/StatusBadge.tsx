import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, status, typography, type StatusTone, themedStyles } from "@/theme";

const ICON: Record<StatusTone, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark",
  info: "sync",
  warning: "warning-outline",
  destructive: "close-circle-outline",
  neutral: "ellipse-outline",
  muted: "time-outline",
};

export function StatusBadge({
  tone = "neutral",
  label,
  icon,
}: {
  tone?: StatusTone;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const tones = status[tone];
  return (
    <View style={[styles.badge, { backgroundColor: tones.bg, borderColor: tones.border }]}>
      <Ionicons name={icon ?? ICON[tone]} size={11} color={tones.fg} />
      <Text style={[styles.label, { color: tones.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function VerifiedBadge({ label = "Verified" }: { label?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: status.success.bg, borderColor: status.success.border }]}>
      <Ionicons name="shield-checkmark" size={13} color={status.success.fg} />
      <Text style={[styles.label, { color: status.success.fg, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: "600",
    textTransform: "capitalize",
  },
}));
