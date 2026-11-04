import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * The pieces of the two "show someone a QR code" flows (Add a team member, Onboard an organisation), in the login's
 * look: a step bar, fields with a tick once valid, a summary card that fills in as you type, pill buttons, and the
 * "Ready to scan" panel with a countdown, the match word and what happens next.
 */

type Glyph = keyof typeof Ionicons.glyphMap;

export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  useThemeVersion();
  return (
    <View style={styles.steps} accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      {steps.map((s, i) => (
        <View key={s} style={styles.flex}>
          <View style={[styles.stepBar, i <= current && styles.stepBarOn]} />
          <Text style={[styles.stepText, i === current && styles.stepTextOn]}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/** A tall field: label inside as the placeholder, moving to the top once there is text; a tick once `valid`. */
export function FormField({
  icon,
  label,
  value,
  valid,
  ...input
}: TextInputProps & { icon: Glyph; label: string; value: string; valid?: boolean }) {
  useThemeVersion();
  const [focused, setFocused] = useState(false);
  const raised = focused || value.length > 0;
  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <Ionicons name={icon} size={19} color={focused ? colors.primary : colors.mutedForeground} />
      <View style={styles.flex}>
        {raised && <Text style={[styles.fieldLabel, focused && { color: colors.primary }]}>{label}</Text>}
        <TextInput
          value={value}
          placeholder={raised ? undefined : label}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.fieldInput, raised && styles.fieldInputRaised]}
          {...input}
        />
      </View>
      {valid && <Ionicons name="checkmark" size={18} color={colors.success} />}
    </View>
  );
}

/** The dark card at the top that sums up who or what is being added. */
export function SummaryCard({
  initials,
  title,
  sub,
  square,
}: {
  initials: string;
  title: string;
  sub: string;
  square?: boolean;
}) {
  useThemeVersion();
  return (
    <View style={styles.summary}>
      <View pointerEvents="none" style={styles.summaryRing} />
      <View style={[styles.summaryAvatar, square && styles.summaryAvatarSquare]}>
        <Text style={styles.summaryInitials}>{initials || "?"}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.summaryTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.summarySub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

/** "Nomsa Dlamini" -> "ND"; one word -> its first letter. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function PillButton({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: Glyph;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  style?: object;
}) {
  useThemeVersion();
  const off = disabled && !busy;
  const fg =
    variant === "primary" ? (off ? colors.mutedForeground : colors.primaryForeground) : variant === "danger" ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.pill,
        variant === "primary" && (off ? styles.pillOff : styles.pillPrimary),
        variant !== "primary" && styles.pillGhost,
        variant === "danger" && { borderColor: colors.destructive },
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A disabled main button says what is missing rather than just greying out. */
export function MissingNote({ text }: { text: string }) {
  useThemeVersion();
  return (
    <View style={styles.missing}>
      <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
      <Text style={styles.missingText}>{text}</Text>
    </View>
  );
}

export function ErrorNote({ text }: { text: string }) {
  useThemeVersion();
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

/** Seconds left until `expiresAt`, ticking once a second; null when there is no expiry. */
export function useSecondsLeft(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The QR code on white, the time left, the word to check, and the numbered next steps. */
export function ScanPanel({
  qrSvg,
  expiresAt,
  extra,
  wordLabel,
  matchWord,
  steps,
  children,
}: {
  qrSvg: string;
  expiresAt?: string | null;
  /** Appended to the countdown ("attempt 2"). */
  extra?: string;
  wordLabel: string;
  matchWord: string | null;
  steps: { title: string; text?: string }[];
  /** Under the steps (an inline approval, say). */
  children?: ReactNode;
}) {
  useThemeVersion();
  const left = useSecondsLeft(expiresAt);
  const expired = left === 0;
  return (
    <View style={styles.scan}>
      <View style={[styles.qrBox, expired && styles.qrExpired]}>
        <SvgXml xml={qrSvg} width="100%" height={240} />
      </View>
      <View style={[styles.timer, expired && styles.timerExpired]}>
        <Ionicons name="time-outline" size={14} color={expired ? colors.destructive : colors.primary} />
        <Text style={[styles.timerText, expired && { color: colors.destructive }]}>
          {expired
            ? "This code has expired"
            : `${left === null ? "15 minutes" : `${mmss(left)} left`} · one scan only${extra ? ` · ${extra}` : ""}`}
        </Text>
      </View>
      <View style={styles.wordCard}>
        <Text style={styles.wordLabel}>{wordLabel}</Text>
        <Text style={styles.word}>{matchWord ?? "-"}</Text>
      </View>
      {children}
      <View style={styles.next}>
        {steps.map((s, i) => (
          <View key={s.title} style={styles.nextRow}>
            <View style={styles.nextRail}>
              <View style={styles.nextDot}>
                <Text style={styles.nextNum}>{i + 1}</Text>
              </View>
              {i < steps.length - 1 && <View style={styles.nextLine} />}
            </View>
            <View style={[styles.flex, i < steps.length - 1 && { paddingBottom: spacing.sm }]}>
              <Text style={styles.nextTitle}>{s.title}</Text>
              {s.text ? <Text style={styles.nextText}>{s.text}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.88 },

    steps: { flexDirection: "row", gap: 6, marginBottom: spacing.md },
    stepBar: { height: 4, borderRadius: 2, backgroundColor: colors.border },
    stepBarOn: { backgroundColor: colors.primary },
    stepText: { marginTop: 5, fontSize: typography.tiny + 0.5, fontWeight: "600", color: colors.mutedForeground },
    stepTextOn: { color: colors.primary },

    sectionLabel: {
      fontSize: typography.small,
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      marginHorizontal: 4,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    hint: { fontSize: typography.small - 0.5, color: colors.mutedForeground, lineHeight: 16, marginHorizontal: 6, marginTop: 6 },

    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.md + 3,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    fieldFocused: { borderColor: colors.primary },
    fieldLabel: { fontSize: typography.tiny + 1, fontWeight: "600", color: colors.mutedForeground, marginTop: 6 },
    fieldInput: { fontSize: typography.body + 1, color: colors.foreground, paddingVertical: 14 },
    fieldInputRaised: { paddingTop: 1, paddingBottom: 8 },

    summary: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
      borderRadius: 20,
      backgroundColor: colors.shiftBackground,
      overflow: "hidden",
    },
    summaryRing: {
      position: "absolute",
      right: -50,
      top: -60,
      width: 160,
      height: 160,
      borderRadius: 80,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
    },
    summaryAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryAvatarSquare: { borderRadius: 14 },
    summaryInitials: { fontSize: typography.body + 1, fontWeight: "800", color: colors.primaryForeground },
    summaryTitle: { fontSize: typography.body + 1, fontWeight: "700", color: colors.shiftForeground },
    summarySub: { fontSize: typography.small, color: colors.shiftForeground, opacity: 0.75 },

    pill: {
      height: 54,
      borderRadius: radius.round,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm + 1,
      paddingHorizontal: spacing.lg,
    },
    pillPrimary: { backgroundColor: colors.primary },
    pillOff: { backgroundColor: colors.secondary },
    pillGhost: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
    pillText: { fontSize: typography.body + 1.5, fontWeight: "700" },

    missing: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: spacing.sm },
    missingText: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center", flexShrink: 1 },
    error: {
      flexDirection: "row",
      gap: spacing.sm + 2,
      alignItems: "flex-start",
      backgroundColor: colors.destructiveSoft,
      borderRadius: 16,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.md,
    },
    errorText: { flex: 1, color: colors.destructive, fontSize: typography.small + 1, lineHeight: 18 },

    scan: { gap: spacing.md },
    qrBox: { backgroundColor: "#ffffff", borderRadius: 24, padding: spacing.lg, alignItems: "center" },
    qrExpired: { opacity: 0.25 },
    timer: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: radius.round,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    timerExpired: { backgroundColor: colors.destructiveSoft },
    timerText: { fontSize: typography.small + 0.5, fontWeight: "700", color: colors.primary },
    wordCard: {
      alignItems: "center",
      paddingVertical: spacing.lg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    wordLabel: { fontSize: typography.tiny + 1, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: colors.mutedForeground },
    word: { fontSize: 32, fontWeight: "300", letterSpacing: 0.5, color: colors.primary, marginTop: 2 },
    next: { padding: spacing.md + 2, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    nextRow: { flexDirection: "row", gap: spacing.md },
    nextRail: { alignItems: "center" },
    nextDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    nextNum: { fontSize: typography.small - 0.5, fontWeight: "700", color: colors.primary },
    nextLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 3 },
    nextTitle: { fontSize: typography.small + 1, color: colors.foreground, lineHeight: 18 },
    nextText: { fontSize: typography.small - 0.5, color: colors.mutedForeground, lineHeight: 16 },
  }),
);
