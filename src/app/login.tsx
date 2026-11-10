import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSmartClean } from "@/features/store";
import { getPublicTenantBranding } from "@/api/client";
import { resolveBranding, type ResolvedBranding } from "@/services/branding";
import {
  colors,
  radius,
  spacing,
  typography,
  themedStyles,
  useTheme,
} from "@/theme";

/**
 * Sign in, and the way in for people who can't sign in yet.
 *
 * A dark header in the shift card's colour (themed per organisation) over a sheet with a Sign in / I'm new switch.
 * Sign in is the form; I'm new explains the manager's QR handshake and leads to the two scanners. While the keyboard
 * is up the header shrinks to a slim bar so the fields and the button stay in view.
 *
 * The two scanners stay separate screens: the backend refuses an organisation code presented to the staff endpoint
 * and vice versa (expected_kind on find_by_scan_value), so one shared scanner would send half its users to "this code
 * isn't valid". Joining a team leads because every new employee uses it; an organisation code is scanned once.
 */

type Tab = "in" | "new";

/** "#21779b" + 0.8 -> "#21779bcc"; anything that is not a 6-digit hex is returned as it is. */
function withAlpha(hex: string, alpha: number) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export default function Login() {
  const { theme } = useTheme(); // also re-renders with the new colours when the theme changes
  const { signIn } = useSmartClean();
  const insets = useSafeAreaInsets();
  // Fetched unauthenticated - nobody's signed in yet, so state.tenant
  // (only populated by bootstrap after sign-in) isn't available here.
  const [branding, setBranding] = useState<ResolvedBranding>(() =>
    resolveBranding(undefined),
  );

  useEffect(() => {
    let cancelled = false;
    getPublicTenantBranding()
      .then((tenant) => {
        if (!cancelled) setBranding(resolveBranding(tenant.branding));
      })
      .catch(() => {
        // Best-effort - the login screen still works with default branding.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [tab, setTab] = useState<Tab>("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);
  const passwordRef = useRef<TextInput>(null);

  // The header shrinks while the keyboard is up, so the form is never hidden behind it.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardUp(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardUp(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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

  const logo = branding.logoUrl ? (
    <Image
      source={{ uri: branding.logoUrl }}
      style={styles.logoImage}
      resizeMode="contain"
    />
  ) : (
    // A bundled asset has no URL to fetch, so require() rather than a uri.
    <Image
      source={require("../assets/logo-mark.png")}
      style={styles.logoImage}
      resizeMode="contain"
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={[
          colors.shiftBackground,
          colors.shiftBackground,
          withAlpha(colors.primary, 0.85),
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.hero,
          { paddingTop: insets.top + spacing.sm },
          keyboardUp && styles.heroSlim,
        ]}
      >
        {/* Two faint rings in the corner; decoration only. */}
        <View pointerEvents="none" style={[styles.ring, styles.ringBig]} />
        <View pointerEvents="none" style={[styles.ring, styles.ringSmall]} />
        {keyboardUp ? (
          <View style={styles.slimRow}>
            <View style={[styles.logoTile, styles.logoTileSmall]}>{logo}</View>
            <Text style={styles.slimName} numberOfLines={1}>
              {branding.name}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.logoTile}>{logo}</View>
            <Text style={styles.kicker} numberOfLines={1}>
              {branding.name.toUpperCase()}
            </Text>
            <Text style={styles.heroTitle}>
              {tab === "in"
                ? "Sign in to manage\nyour shift"
                : "Welcome to\nthe team"}
            </Text>
          </>
        )}
      </LinearGradient>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: insets.bottom + spacing.sm },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.handle} />
          <Switch value={tab} onChange={setTab} />

          {tab === "in" ? (
            <View style={styles.form}>
              {error && (
                <View style={styles.notice} accessibilityRole="alert">
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={colors.destructive}
                  />
                  <View style={styles.flexText}>
                    <Text style={styles.noticeTitle}>
                      Couldn&apos;t sign you in
                    </Text>
                    <Text style={styles.noticeText}>{error}</Text>
                  </View>
                </View>
              )}

              <Field
                icon="person-outline"
                label="Username or email"
                value={username}
                focused={focused === "user"}
                onFocus={() => setFocused("user")}
                onBlur={() => setFocused(null)}
                onChangeText={(text) => {
                  setUsername(text);
                  if (error) setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                submitBehavior="submit"
              />
              <Field
                ref={passwordRef}
                icon="lock-closed-outline"
                label="Password"
                value={password}
                invalid={!!error}
                focused={focused === "pass"}
                onFocus={() => setFocused("pass")}
                onBlur={() => setFocused(null)}
                onChangeText={(text) => {
                  setPassword(text);
                  if (error) setError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    hitSlop={10}
                    onPress={() => setShowPassword((v) => !v)}
                    style={styles.eye}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                }
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/forgot-password")}
                hitSlop={8}
                style={styles.forgot}
              >
                <Text style={styles.link}>Forgot password?</Text>
              </Pressable>

              <PillButton
                onPress={submit}
                disabled={!canSubmit}
                busy={busy}
                label={busy ? "Signing in…" : "Sign in"}
                arrow
              />

              <Text style={styles.help}>
                Ask your site supervisor if you need access.
              </Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Step
                n={1}
                title="Your manager opens your name"
                text="In their Team tab, they show you a code"
              />
              <Step
                n={2}
                title="You scan it here"
                text="Then show them the word on your screen"
              />
              <Step
                n={3}
                title="Choose your password"
                text="And you're in"
                last
              />

              <PillButton
                onPress={() => router.push("/staff-onboard-scan")}
                label="Scan the code"
                icon="qr-code-outline"
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Setting up an organisation? Scan your onboarding code"
                onPress={() => router.push("/onboard-scan")}
                style={({ pressed }) => [
                  styles.altRow,
                  pressed && styles.altRowPressed,
                ]}
              >
                <View style={styles.altIcon}>
                  <Ionicons
                    name="business-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flexText}>
                  <Text style={styles.altTitle}>
                    Setting up an organisation?
                  </Text>
                  <Text style={styles.altText}>Scan your onboarding code</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>
          )}

          <View style={styles.grow} />
          {!keyboardUp && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Powered by Industrial Computing Engineering"
              onPress={() => void Linking.openURL("https://www.ice4ir.com/")}
              style={styles.poweredBy}
            >
              <Text style={styles.poweredByText}>Powered by</Text>
              <Image
                // The colour logo has dark lettering, so a dark background gets the white and red one.
                source={
                  theme === "dark"
                    ? require("../assets/ice2_dark.png")
                    : require("../assets/ice2.png")
                }
                style={styles.poweredByLogo}
                resizeMode="contain"
              />
            </Pressable>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Sign in | I'm new, with a raised thumb that slides to the chosen half. */
function Switch({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(value === "in" ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(x, {
      toValue: value === "in" ? 0 : 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [value, x]);
  const half = (width - 8) / 2;
  const options: {
    key: Tab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "in", label: "Sign in", icon: "lock-closed-outline" },
    { key: "new", label: "I'm new", icon: "qr-code-outline" },
  ];
  return (
    <View
      style={styles.switch}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: half,
              transform: [
                {
                  translateX: x.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, half],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={styles.segment}
          >
            <Ionicons
              name={o.icon}
              size={16}
              color={on ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tall field whose label sits inside it as the placeholder, and moves to the top once there is text. */
function Field({
  ref,
  icon,
  label,
  value,
  focused,
  invalid,
  trailing,
  ...input
}: TextInputProps & {
  ref?: React.Ref<TextInput>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  focused: boolean;
  invalid?: boolean;
  trailing?: React.ReactNode;
}) {
  const raised = focused || value.length > 0;
  return (
    <View
      style={[
        styles.field,
        focused && styles.fieldFocused,
        invalid && styles.fieldInvalid,
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={
          invalid
            ? colors.destructive
            : focused
              ? colors.primary
              : colors.mutedForeground
        }
      />
      <View style={styles.fieldBody}>
        {raised && (
          <Text
            style={[
              styles.fieldLabel,
              focused && { color: colors.primary },
              invalid && { color: colors.destructive },
            ]}
          >
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          value={value}
          placeholder={raised ? undefined : label}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={label}
          style={[styles.fieldInput, raised && styles.fieldInputRaised]}
          {...input}
        />
      </View>
      {trailing}
    </View>
  );
}

function PillButton({
  label,
  onPress,
  disabled,
  busy,
  arrow,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  arrow?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const off = disabled && !busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        off && styles.pillOff,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      {busy ? (
        <Spinner />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={colors.primaryForeground} />
      ) : null}
      <Text style={[styles.pillText, off && styles.pillTextOff]}>{label}</Text>
      {arrow && !busy && (
        <View style={[styles.pillArrow, off && styles.pillArrowOff]}>
          <Ionicons
            name="arrow-forward"
            size={16}
            color={off ? colors.mutedForeground : colors.primaryForeground}
          />
        </View>
      )}
    </Pressable>
  );
}

/** A ring that turns; the system ActivityIndicator does not take the button's own text colour on every platform. */
function Spinner() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
  );
}

function Step({
  n,
  title,
  text,
  last,
}: {
  n: number;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <View style={styles.stepDot}>
          <Text style={styles.stepNum}>{n}</Text>
        </View>
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={[styles.flexText, !last && styles.stepGap]}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    flexText: { flex: 1, minWidth: 0 },
    grow: { flexGrow: 1, minHeight: spacing.lg },

    hero: {
      paddingHorizontal: spacing.xl - 2,
      paddingBottom: 56,
      overflow: "hidden",
    },
    heroSlim: { paddingBottom: 46 },
    ring: {
      position: "absolute",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.09)",
    },
    ringBig: { width: 300, height: 300, right: -120, top: -110 },
    ringSmall: { width: 190, height: 190, right: -60, top: -50 },
    logoTile: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.96)",
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    logoTileSmall: {
      width: 34,
      height: 34,
      borderRadius: 10,
      marginTop: 0,
      marginBottom: 0,
      elevation: 0,
      shadowOpacity: 0,
    },
    logoImage: { width: "78%", height: "78%" },
    kicker: {
      color: colors.shiftForeground,
      opacity: 0.7,
      fontSize: typography.tiny + 1.5,
      fontWeight: "700",
      letterSpacing: 1.8,
    },
    heroTitle: {
      marginTop: spacing.xs,
      color: colors.shiftForeground,
      fontSize: 27,
      lineHeight: 32,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    slimRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    slimName: {
      color: colors.shiftForeground,
      fontSize: typography.h2,
      fontWeight: "700",
    },

    sheet: {
      flex: 1,
      marginTop: -32,
      backgroundColor: colors.background,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      overflow: "hidden",
    },
    sheetContent: {
      flexGrow: 1,
      paddingHorizontal: spacing.xl - 4,
      paddingTop: spacing.sm + 2,
    },
    handle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },

    switch: {
      flexDirection: "row",
      height: 46,
      padding: 4,
      borderRadius: radius.round,
      backgroundColor: colors.secondary,
      marginBottom: spacing.lg + 2,
    },
    thumb: {
      position: "absolute",
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: radius.round,
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
    },
    segmentText: { fontSize: typography.body, color: colors.mutedForeground },
    segmentTextOn: { color: colors.primary, fontWeight: "700" },

    form: { gap: spacing.md },
    notice: {
      flexDirection: "row",
      gap: spacing.sm + 2,
      alignItems: "flex-start",
      backgroundColor: colors.destructiveSoft,
      borderRadius: 16,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md,
    },
    noticeTitle: {
      color: colors.destructive,
      fontSize: typography.small + 1.5,
      fontWeight: "700",
    },
    noticeText: {
      color: colors.destructive,
      fontSize: typography.small + 1,
      lineHeight: 18,
      marginTop: 1,
    },

    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 58,
      paddingHorizontal: spacing.lg,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    fieldFocused: { borderColor: colors.primary },
    fieldInvalid: { borderColor: colors.destructive },
    fieldBody: { flex: 1, justifyContent: "center" },
    fieldLabel: {
      fontSize: typography.tiny + 1,
      fontWeight: "600",
      color: colors.mutedForeground,
      marginTop: 6,
    },
    fieldInput: {
      fontSize: typography.body + 1.5,
      color: colors.foreground,
      paddingVertical: 14,
    },
    fieldInputRaised: { paddingTop: 1, paddingBottom: 8 },
    eye: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginRight: -6,
    },

    forgot: { alignSelf: "flex-end", paddingVertical: 2 },
    link: {
      fontSize: typography.small + 1,
      fontWeight: "600",
      color: colors.primary,
    },
    help: {
      textAlign: "center",
      fontSize: typography.small,
      color: colors.mutedForeground,
      marginTop: spacing.xs,
    },

    pill: {
      height: 56,
      borderRadius: radius.round,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm + 2,
      marginTop: spacing.xs,
    },
    pillOff: { backgroundColor: colors.secondary },
    pillPressed: { opacity: 0.88 },
    pillText: {
      fontSize: typography.body + 2,
      fontWeight: "700",
      color: colors.primaryForeground,
    },
    pillTextOff: { color: colors.mutedForeground },
    pillArrow: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    pillArrowOff: { backgroundColor: colors.border },
    spinner: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2.5,
      borderColor: withAlpha(colors.primaryForeground, 0.35),
      borderTopColor: colors.primaryForeground,
    },

    step: { flexDirection: "row", gap: spacing.md + 2 },
    stepRail: { alignItems: "center" },
    stepDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNum: {
      fontSize: typography.small + 1,
      fontWeight: "700",
      color: colors.primary,
    },
    stepLine: {
      flex: 1,
      width: 2,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    stepGap: { paddingBottom: spacing.sm },
    stepTitle: {
      fontSize: typography.body + 0.5,
      fontWeight: "700",
      color: colors.foreground,
    },
    stepText: {
      fontSize: typography.small + 0.5,
      color: colors.mutedForeground,
      lineHeight: 17,
      marginTop: 2,
    },

    altRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    altRowPressed: { backgroundColor: colors.secondary },
    altIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    altTitle: {
      fontSize: typography.body,
      fontWeight: "700",
      color: colors.foreground,
    },
    altText: {
      fontSize: typography.small,
      color: colors.mutedForeground,
      marginTop: 1,
    },

    poweredBy: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
      paddingTop: spacing.md,
      opacity: 0.8,
    },
    poweredByText: {
      fontSize: typography.tiny + 1,
      color: colors.mutedForeground,
    },
    poweredByLogo: { width: 38, height: 30 },
  }),
);
