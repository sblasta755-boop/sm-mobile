import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openUpdate, useAppUpdate } from "@/features/appUpdate";
import { colors, radius, spacing, themedStyles, typography } from "@/theme";

/** "A new version is available" card for the profile screens. Nothing when current. */
export function UpdateBanner() {
  const { state, release } = useAppUpdate();
  if (state === "current" || !release) return null;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
        <View style={styles.text}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.sub}>Version {release.versionName} is ready to install.</Text>
        </View>
      </View>
      {release.notes ? <Text style={styles.notes}>{release.notes}</Text> : null}
      <Pressable style={styles.button} onPress={openUpdate} accessibilityRole="button">
        <Text style={styles.buttonText}>Update now</Text>
      </Pressable>
    </View>
  );
}

/** Covers the app when this build is below the minimum supported one. */
export function UpdateRequiredGate() {
  const { state, release } = useAppUpdate();
  const insets = useSafeAreaInsets();
  if (state !== "required" || !release) return null;
  return (
    <View style={[styles.gate, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Ionicons name="cloud-download-outline" size={56} color={colors.primary} />
      <Text style={styles.gateTitle}>Update required</Text>
      <Text style={styles.gateText}>
        This version of Šoma360 is too old to keep working. Install version {release.versionName} to continue. Your
        data is kept.
      </Text>
      {release.notes ? <Text style={styles.notes}>{release.notes}</Text> : null}
      <Pressable style={[styles.button, styles.gateButton]} onPress={openUpdate} accessibilityRole="button">
        <Text style={styles.buttonText}>Update now</Text>
      </Pressable>
      <Text style={styles.hint}>
        If installs are blocked, allow your browser to install unknown apps, then open the download again.
      </Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    text: { flex: 1 },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
    notes: { fontSize: typography.small, color: colors.mutedForeground },
    button: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      alignItems: "center",
    },
    buttonText: { color: colors.primaryForeground, fontWeight: "700", fontSize: typography.body },
    gate: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
      elevation: 1000,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xl,
      gap: spacing.md,
    },
    gateTitle: { fontSize: typography.title, fontWeight: "700", color: colors.foreground },
    gateText: { fontSize: typography.body, color: colors.mutedForeground, textAlign: "center" },
    gateButton: { alignSelf: "stretch" },
    hint: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center" },
  }),
);
