import { useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { requestPasswordReset } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { colors, radius, spacing, typography } from "@/theme";

// Just the "request the email" step - unlike the web app, there is no
// paste-your-token screen here at all (see login.tsx's own
// PasswordResetDialog fix for why that used to exist and why it's gone
// there too). The emailed link opens /set-password on the web app in
// whatever browser the phone has, which already works standalone with
// no mobile-app involvement, so finishing the reset happens outside
// this app - this screen's only job is sending that email and saying so.
export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <Card style={styles.card}>
            <View style={styles.doneIcon}>
              <Ionicons name="mail-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.doneText}>
              If {email.trim()} matches an account, a reset link is on its way - it expires in 30
              minutes. Open it on this phone or any device to choose a new password, then come
              back here to sign in.
            </Text>
            <Button onPress={() => router.back()} style={styles.submitButton}>
              Back to sign in
            </Button>
          </Card>
        ) : (
          <>
            <View style={styles.brandBlock}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.tagline}>
                Enter your account email - if it matches an account, we&apos;ll send you a link to
                reset it.
              </Text>
            </View>

            <Card style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@company.co.za"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={submit}
                />
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                onPress={submit}
                disabled={!canSubmit}
                loading={busy}
                style={styles.submitButton}
              >
                Send reset email
              </Button>
            </Card>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backText}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  brandBlock: {
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  tagline: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  card: {
    gap: spacing.lg,
    alignItems: "stretch",
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.foreground,
  },
  errorBox: {
    borderRadius: radius.md,
    backgroundColor: colors.destructiveSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.small,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: spacing.xs,
  },
  backButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  backText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  doneIcon: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  doneText: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
