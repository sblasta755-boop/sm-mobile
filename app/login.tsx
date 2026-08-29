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
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { colors, radius, spacing, typography } from "@/theme";

export default function Login() {
  const { signIn } = useSmartClean();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
          <View style={styles.logo}>
            <Text style={styles.logoGlyph}>✦</Text>
          </View>
          <Text style={styles.brand}>Šoma360</Text>
          <Text style={styles.tagline}>Sign in to manage your shift</Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Username or email</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. jane.doe"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (error) setError(null);
              }}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (error) setError(null);
                }}
                onSubmitEditing={submit}
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

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button onPress={submit} disabled={!canSubmit} loading={busy} style={styles.submitButton}>
            Sign in
          </Button>
        </Card>

        <Text style={styles.footer}>Ask your site supervisor if you need access.</Text>
      </ScrollView>

      <View style={[styles.poweredBy, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Text style={styles.poweredByText}>Powered by</Text>
        <Image
          source={require("../assets/afrique360.png")}
          style={styles.poweredByLogo}
          resizeMode="contain"
        />
      </View>
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
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logoGlyph: {
    fontSize: 28,
    color: colors.primaryForeground,
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
  footer: {
    textAlign: "center",
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  poweredBy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    opacity: 0.5,
  },
  poweredByText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  poweredByLogo: {
    width: 20,
    height: 17,
  },
});
