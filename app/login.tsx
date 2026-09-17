import { useEffect, useState } from "react";
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
import { getPublicTenantBranding } from "@/api/client";
import { resolveBranding, type ResolvedBranding } from "@/services/branding";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "@/theme";

export default function Login() {
  const { signIn } = useSmartClean();
  const insets = useSafeAreaInsets();
  // Fetched unauthenticated — nobody's signed in yet, so state.tenant
  // (only populated by bootstrap after sign-in) isn't available here.
  const [branding, setBranding] = useState<ResolvedBranding>(() => resolveBranding(undefined));

  useEffect(() => {
    let cancelled = false;
    getPublicTenantBranding()
      .then((tenant) => {
        if (!cancelled) setBranding(resolveBranding(tenant.branding));
      })
      .catch(() => {
        // Best-effort — the login screen still works with default branding.
      });
    return () => {
      cancelled = true;
    };
  }, []);
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
      router.replace("/");
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
          {/* A tenant's own uploaded logo is a remote URL; with none set
              we fall back to the bundled product mark rather than to
              initials in a coloured square. require() rather than a uri
              because a bundled asset has no URL to fetch - the two
              source shapes are not interchangeable in React Native. */}
          {branding.logoUrl ? (
            <Image source={{ uri: branding.logoUrl }} style={styles.logoImage} />
          ) : (
            <Image
              source={require("../assets/logo-mark.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.brand}>{branding.name}</Text>
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

          {/* Kept inside the card, attached to the form it's about -
              as a floating line between the card and the onboarding
              block it read as a third, unrelated orphan. */}
          <Text style={styles.footer}>Ask your site supervisor if you need access.</Text>
        </Card>

        {/* The two onboarding paths are the same kind of action - scan
            a code to get started - so they're grouped into one block
            instead of floating as two bare text links of different
            sizes. Each is a real row (icon, label, chevron) at a
            legible size with a 44pt target, rather than underline-less
            centred text that gives no sign it's tappable. The divider
            labels the group so it reads as "the other way in" rather
            than loose text under the form.

            Two entry points, deliberately separate. The backend refuses
            an organisation code presented to the staff endpoint and vice
            versa (expected_kind on find_by_scan_value), so a single
            shared scanner would send half its users to a confusing
            "this code isn't valid". The staff row leads because it is
            used far more often - every new employee, versus one code
            per organisation ever. */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>New to {branding.name}?</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.onboardGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan the code your manager is showing you"
            onPress={() => router.push("/staff-onboard-scan")}
            style={({ pressed }) => [styles.onboardRow, pressed && styles.onboardRowPressed]}
          >
            <View style={styles.onboardIcon}>
              <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.onboardCopy}>
              <Text style={styles.onboardTitle}>Joining your team</Text>
              <Text style={styles.onboardHint}>Scan the code your manager is showing you</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>

          <View style={styles.onboardSeparator} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Setting up a new organisation? Scan your onboarding code"
            onPress={() => router.push("/onboard-scan")}
            style={({ pressed }) => [styles.onboardRow, pressed && styles.onboardRowPressed]}
          >
            <View style={styles.onboardIcon}>
              <Ionicons name="business-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.onboardCopy}>
              <Text style={styles.onboardTitle}>Setting up an organisation</Text>
              <Text style={styles.onboardHint}>Scan your onboarding code</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

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
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    marginBottom: spacing.sm,
    resizeMode: "cover",
  },
  logoGlyph: {
    fontSize: 20,
    fontWeight: "800",
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  onboardGroup: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  onboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    // 44pt minimum touch target - the old bare text links were well
    // under it, and the secondary one was 10px type as well.
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  onboardRowPressed: {
    backgroundColor: colors.secondary,
  },
  onboardIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  onboardCopy: {
    flex: 1,
    gap: 2,
  },
  onboardTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  onboardHint: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  onboardSeparator: {
    height: 1,
    marginLeft: spacing.lg + 34 + spacing.md,
    backgroundColor: colors.border,
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
