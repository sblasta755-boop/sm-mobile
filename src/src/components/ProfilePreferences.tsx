import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, themedStyles, typography, useTheme, type ThemePreference } from "@/theme";

// The people who can produce a client report - same set as the report screen.
const REPORT_ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin", "client_auditor", "cleaner"];

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
];

/** Light / Dark / System. Used on every role's profile screen and in the profile menu. */
export function AppearanceRow() {
  const { preference, setPreference } = useTheme();
  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Ionicons name="contrast-outline" size={18} color={colors.foreground} />
        <Text style={styles.title}>Appearance</Text>
      </View>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setPreference(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Ionicons
                name={option.icon}
                size={15}
                color={selected ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A row that opens the report screen, for the roles that may make reports. */
export function ReportsRow() {
  const { currentUser } = useSmartClean();
  if (!currentUser || !REPORT_ROLES.includes(currentUser.role)) return null;
  return (
    <Pressable style={styles.linkRow} onPress={() => router.push("/management-report")}>
      <Ionicons name="document-text-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.sub}>Download management reports as PDF</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A row that opens the feedback screen (a message and photos to the Šoma360 team). */
export function FeedbackRow() {
  return (
    <Pressable style={styles.linkRow} onPress={() => router.push("/feedback")}>
      <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.foreground} />
      <View style={styles.linkText}>
        <Text style={styles.title}>Send feedback</Text>
        <Text style={styles.sub}>Report a problem or share an idea</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    block: { paddingVertical: spacing.sm, gap: spacing.sm },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    title: { fontSize: typography.body, color: colors.foreground, fontWeight: "500" },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    segment: {
      flexDirection: "row",
      backgroundColor: colors.secondary,
      borderRadius: radius.lg,
      padding: 3,
      gap: 3,
    },
    option: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    optionSelected: { backgroundColor: colors.primary },
    optionText: { fontSize: typography.small, color: colors.mutedForeground, fontWeight: "600" },
    optionTextSelected: { color: colors.primaryForeground },
    linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
    linkText: { flex: 1 },
  }),
);
