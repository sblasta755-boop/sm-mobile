import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography } from "@/theme";

export default function Login() {
  const { signInAs } = useSmartClean();

  async function enter(role: "cleaner" | "supervisor") {
    await signInAs(role);
    router.replace("/home");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Choose a demo role</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => enter("cleaner")}>
        <Text style={styles.buttonText}>Cleaner</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => enter("supervisor")}>
        <Text style={styles.secondaryText}>Supervisor</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    marginBottom: spacing.md,
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
  },
  button: {
    minHeight: 48,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  buttonText: {
    textAlign: "center",
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 48,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  secondaryText: {
    textAlign: "center",
    color: colors.foreground,
    fontWeight: "700",
  },
});
