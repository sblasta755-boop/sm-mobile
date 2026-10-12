import { useState } from "react";
import { router } from "expo-router";
import {
  Image,
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
import { useSmartClean } from "@/features/store";
import { setInitialPassword } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The first thing a QR-onboarded administrator sees.
 *
 * They arrive here already signed in - the platform admin's approval
 * minted the session - but holding a random password generated inside
 * provision_tenant that nobody has ever seen. Until they choose one,
 * the session is good for nothing, which is what state.mustChangePassword
 * expresses and why app/index.tsx routes here ahead of both the customer
 * app and the platform console.
 *
 * Deliberately offers no way out. There is no back button, no skip, and
 * no tab bar: this screen lives at the top level rather than inside a
 * route group for exactly that reason. Signing out is the only exit,
 * and that is on purpose - a half-onboarded account that can wander into
 * the app is a worse outcome than one that has to finish or leave.
 */
export default function SetPassword() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser, dispatch, signOut } = useSmartClean();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the backend's own min_length=8 (SetInitialPasswordRequest)
  // rather than trusting the 422 - a disabled button explains itself,
  // a validation error does not.
  const longEnough = password.length >= 8;
  const matches = password.length > 0 && password === confirm;
  const canSubmit = longEnough && matches && !busy;

  async function submit() {
    if (!canSubmit || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await setInitialPassword(state.accessToken, password);
      dispatch({ type: "PASSWORD_CHANGED" });
      // replace, not push: this screen must not be reachable by going
      // back once the obligation is discharged.
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set your password");
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
        <View style={styles.brandBlock}>
          <Image
            source={require("../assets/logo-mark.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brand}>One last step</Text>
          <Text style={styles.tagline}>
            {currentUser?.name ? `Welcome, ${currentUser.name}. ` : ""}
            Choose a password to finish setting up your account.
          </Text>
        </View>

        <Card style={styles.card}>
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
              onSubmitEditing={submit}
            />
          </View>

          {/* Only complain once there is something to complain about -
              an error on an empty field is noise, not guidance. */}
          {password.length > 0 && !longEnough && (
            <Text style={styles.hint}>Use at least 8 characters.</Text>
          )}
          {confirm.length > 0 && !matches && (
            <Text style={styles.hint}>Both passwords need to match.</Text>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button onPress={submit} disabled={!canSubmit} loading={busy} style={styles.submitButton}>
            Save and continue
          </Button>
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => signOut()}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutText}>Sign out instead</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    marginBottom: spacing.sm,
  },
  brand: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
    letterSpacing: 0.2,
  },
  tagline: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  card: {
    gap: spacing.lg,
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
  signOutButton: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  signOutText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
}));
