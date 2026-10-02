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
import { confirmPasswordResetOtp, requestPasswordResetOtp } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { colors, radius, spacing, typography } from "@/theme";

// Two steps, both inside the app: request a 6-digit code by email, then
// enter it alongside a new password. Unlike the web app's forgot-
// password dialog (an emailed link into /set-password), mobile has no
// clean way to open a deep link back into itself mid-flow - see
// requestPasswordResetOtp/confirmPasswordResetOtp's own comments on the
// backend endpoints this drives (AuthController.request_password_reset_
// otp/confirm_password_reset_otp), which enforce the actual security
// properties (10-minute expiry, 5 wrong-guess lockout, single active
// code, per-account rate limit) - this screen just has to present them
// honestly, not re-implement them.
export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRequest = email.trim().length > 0 && !busy;
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canVerify = code.trim().length === 6 && password.length >= 8 && password === confirm && !busy;

  async function requestCode() {
    if (!canRequest) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordResetOtp(email.trim());
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndReset() {
    if (!canVerify) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordResetOtp(email.trim(), code.trim(), password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That code didn't work - it may have expired or been mistyped",
      );
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
        {done ? (
          <Card style={styles.card}>
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark-circle-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>Password reset</Text>
            <Text style={styles.doneText}>
              Your password has been updated. You can now sign in with it.
            </Text>
            <Button onPress={() => router.replace("/login")} style={styles.submitButton}>
              Back to sign in
            </Button>
          </Card>
        ) : step === "request" ? (
          <>
            <View style={styles.brandBlock}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.tagline}>
                Enter your account email - if it matches an account, we&apos;ll send you a 6-digit
                code.
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
                  onSubmitEditing={requestCode}
                />
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                onPress={requestCode}
                disabled={!canRequest}
                loading={busy}
                style={styles.submitButton}
              >
                Send code
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
        ) : (
          <>
            <View style={styles.brandBlock}>
              <Text style={styles.title}>Enter your code</Text>
              <Text style={styles.tagline}>
                We sent a 6-digit code to {email.trim()} - it expires in 10 minutes. Enter it
                below with your new password.
              </Text>
            </View>

            <Card style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>Reset code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={code}
                  onChangeText={(text) => {
                    setCode(text.replace(/[^0-9]/g, ""));
                    if (error) setError(null);
                  }}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (error) setError(null);
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    hitSlop={8}
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.toggleButton}
                  >
                    <Text style={styles.toggleText}>{showPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>
                {tooShort && <Text style={styles.hint}>Use at least 8 characters.</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Type it again"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  value={confirm}
                  onChangeText={(text) => {
                    setConfirm(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={verifyAndReset}
                />
                {mismatch && <Text style={styles.hint}>Both passwords need to match.</Text>}
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                onPress={verifyAndReset}
                disabled={!canVerify}
                loading={busy}
                style={styles.submitButton}
              >
                Reset password
              </Button>

              <Pressable
                accessibilityRole="button"
                onPress={() => requestCode()}
                disabled={busy}
                style={styles.resendButton}
              >
                <Text style={styles.backText}>Send a new code</Text>
              </Pressable>
            </Card>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStep("request")}
              style={styles.backButton}
            >
              <Text style={styles.backText}>Use a different email</Text>
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
  codeInput: {
    fontSize: typography.title,
    fontWeight: "800",
    letterSpacing: 8,
    textAlign: "center",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  passwordInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.foreground,
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleText: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.primary,
  },
  hint: {
    fontSize: typography.small,
    color: colors.mutedForeground,
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
  resendButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
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
