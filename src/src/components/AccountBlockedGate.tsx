import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, themedStyles, typography } from "@/theme";

const COPY: Record<string, { title: string; body: string }> = {
  suspended: {
    title: "Account suspended",
    body: "Your organisation's Šoma360 account is suspended, so nobody there can use the app for now. Nothing has been deleted.",
  },
  cancelled: {
    title: "Account cancelled",
    body: "Your organisation's Šoma360 account has been cancelled, so nobody there can use the app. Your data has not been deleted.",
  },
  none: {
    title: "No active subscription",
    body: "This organisation has no active Šoma360 subscription.",
  },
};

/**
 * Covers the app when the server refuses this session because the organisation is suspended, cancelled or has no
 * subscription. Explains why, says who to contact, and offers a check-again and sign out. Mirrors the web app's
 * AccountBlockedScreen: keep the wording in step.
 */
export function AccountBlockedGate() {
  const { state, signOut, refreshBackendData } = useSmartClean();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const blocked = state.accountBlocked;
  if (!blocked) return null;
  const copy = COPY[blocked.status] ?? COPY.suspended;

  const check = async () => {
    setChecking(true);
    try {
      await refreshBackendData();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.gate, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Ionicons name="ban-outline" size={56} color={colors.destructive} />
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.text}>{copy.body}</Text>
      <Text selectable style={styles.contact}>
        {blocked.billingEmail
          ? `To restore access, contact ${blocked.billingEmail}.`
          : "To restore access, contact your Šoma360 representative."}
      </Text>
      <Pressable
        style={[styles.button, styles.secondary, checking && styles.disabled]}
        onPress={() => void check()}
        disabled={checking}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryText}>{checking ? "Checking…" : "Check again"}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => void signOut()} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
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
    title: { fontSize: typography.title, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    text: { fontSize: typography.body, color: colors.mutedForeground, textAlign: "center" },
    contact: {
      fontSize: typography.body,
      color: colors.foreground,
      textAlign: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      alignSelf: "stretch",
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
      alignItems: "center",
      alignSelf: "stretch",
    },
    buttonText: { color: colors.primaryForeground, fontWeight: "700", fontSize: typography.body },
    secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
    secondaryText: { color: colors.foreground, fontWeight: "600", fontSize: typography.body },
    disabled: { opacity: 0.6 },
  }),
);
