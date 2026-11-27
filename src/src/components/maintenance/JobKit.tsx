import { useEffect, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { progressSteps } from "@/domain/maintenanceJobView";
import type { NextStep, NextTone } from "@/domain/maintenance";
import type { MaintenanceJob } from "@/api/client";
import { colors, radius, shadows, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/** The colour at a given strength (for tinted backgrounds). Falls back to the colour itself for anything but #rrggbb. */
export const tint = (hex: string, alpha: number) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : hex;

type Glyph = keyof typeof Ionicons.glyphMap;

/**
 * The PWA's Panel on a phone: a bottom sheet with the title and a line under it, a body that scrolls, and the actions
 * pinned underneath (the main one on top, full width, round), clear of the home indicator. `fit` makes it only as
 * tall as its content.
 */
export function Panel({
  title,
  description,
  onClose,
  footer,
  fit = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  fit?: boolean;
  children: ReactNode;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, fit ? styles.sheetFit : styles.sheetFull]}>
          <View style={styles.sheetHead}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {description ? <Text style={styles.sheetDesc}>{description}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView
            style={fit ? undefined : styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom) }]}>{footer}</View>
          ) : (
            <View style={{ height: Math.max(spacing.md, insets.bottom) }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A round, full-width action. */
export function PillButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  height = 48,
  icon,
  fullWidth = true,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
  height?: number;
  icon?: Glyph;
  fullWidth?: boolean;
}) {
  useThemeVersion();
  const fg =
    variant === "primary" || variant === "destructive"
      ? colors.primaryForeground
      : variant === "ghost"
        ? colors.foreground
        : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { height },
        !fullWidth && styles.pillAuto,
        variant === "primary" && { backgroundColor: colors.primary, borderColor: colors.primary },
        variant === "destructive" && { backgroundColor: colors.destructive, borderColor: colors.destructive },
        variant === "outline" && { backgroundColor: colors.card, borderColor: colors.border },
        variant === "ghost" && { borderColor: "transparent" },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg, fontSize: height >= 48 ? 16 : typography.body }]}>{label}</Text>
    </Pressable>
  );
}

/** Confirm above Cancel, as on the PWA's phone sheets. */
export function SheetFooter({
  onClose,
  onConfirm,
  confirmLabel,
  disabled,
  busy,
  destructive,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <>
      <PillButton
        label={busy ? "Saving…" : confirmLabel}
        variant={destructive ? "destructive" : "primary"}
        onPress={onConfirm}
        disabled={disabled || busy}
      />
      <PillButton label="Cancel" variant="outline" onPress={onClose} disabled={busy} />
    </>
  );
}

export function Chip({ on, onPress, children }: { on: boolean; onPress: () => void; children: string }) {
  useThemeVersion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{children}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  useThemeVersion();
  return <Text style={styles.label}>{children}</Text>;
}

export function Hint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "bad" }) {
  useThemeVersion();
  return <Text style={[styles.hint, tone === "bad" && { color: colors.destructive }]}>{children}</Text>;
}

/** A text box like the PWA's: round-md, border, 16px type. */
export function Field(props: React.ComponentProps<typeof TextInput> & { tall?: boolean }) {
  useThemeVersion();
  const { tall, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.mutedForeground}
      {...rest}
      style={[styles.input, tall && styles.inputTall, rest.multiline && styles.inputMulti, style]}
    />
  );
}

/** A rand amount: an "R" at the left of a big box. */
export function MoneyField({
  value,
  onChangeText,
  placeholder,
  label,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  useThemeVersion();
  return (
    <View style={styles.money}>
      <Text style={styles.moneyR}>R</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={styles.moneyInput}
      />
    </View>
  );
}

/** Where the job is on its road: a thin bar of stops, done ones filled. */
export function ProgressBar({ job }: { job: Pick<MaintenanceJob, "state" | "path"> }) {
  useThemeVersion();
  const steps = progressSteps(job);
  return (
    <View accessibilityLabel="Progress" style={styles.progress}>
      {steps.map((step, i) => (
        <View key={step.label} style={styles.stop}>
          <View
            style={[
              styles.stopBar,
              {
                backgroundColor:
                  step.state === "done" ? colors.primary : step.state === "current" ? tint(colors.primary, 0.5) : colors.muted,
              },
            ]}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.stopLabel,
              step.state === "current" && { fontWeight: "600", color: colors.foreground },
              i > 0 && i < steps.length - 1 && { textAlign: "center" },
              i === steps.length - 1 && { textAlign: "right" },
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const NEXT_ICON: Record<NextTone, Glyph> = {
  yours: "arrow-forward-circle-outline",
  waiting: "time-outline",
  blocked: "pause-circle-outline",
  done: "checkmark-circle-outline",
};

/** What is needed next, in a line with an icon. */
export function NextLine({ step, large }: { step: NextStep; large?: boolean }) {
  useThemeVersion();
  if (!step.text) return null;
  const color =
    step.tone === "yours"
      ? colors.primary
      : step.tone === "blocked"
        ? colors.destructive
        : step.tone === "done"
          ? colors.success
          : colors.mutedForeground;
  return (
    <View style={styles.nextRow}>
      <Ionicons name={NEXT_ICON[step.tone]} size={large ? 20 : 16} color={color} style={{ marginTop: 2 }} />
      <Text
        style={[
          styles.nextText,
          { color, fontSize: large ? 16 : typography.body },
          step.tone === "yours" && { fontWeight: "600" },
          step.tone === "blocked" && { fontWeight: "500" },
        ]}
      >
        {step.text}
      </Text>
    </View>
  );
}

const sectionKey = (id: string) => `maintenance:section:${id}`;

/**
 * A titled card that folds away: the building block of the job screen. Tap the heading to collapse it (a one-line
 * summary stays so you know what is inside). The choice is remembered on this phone. `action` sits beside the heading,
 * outside the toggle, so a button in it is its own tap target.
 */
export function Section({
  title,
  summary,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  useThemeVersion();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    AsyncStorage.getItem(sectionKey(title))
      .then((saved) => {
        if (saved !== null) setOpen(saved === "1");
      })
      .catch(() => undefined);
  }, [title]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    AsyncStorage.setItem(sectionKey(title), next ? "1" : "0").catch(() => undefined);
  };
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={styles.sectionToggle}
        >
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {!open && summary ? (
              <Text numberOfLines={1} style={styles.sectionSummary}>
                {summary}
              </Text>
            ) : null}
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
        </Pressable>
        {action}
      </View>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/** The soft grey rounded pill the PWA uses for neutral tags and quote words. */
export function Tag({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export const cardStyle = themedStyles(() =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: spacing.lg,
      ...shadows.card,
    },
  }),
);

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    backdrop: { flex: 1, justifyContent: "flex-end" },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
    sheetFull: { height: "94%" },
    sheetFit: { maxHeight: "94%" },
    sheetHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
    sheetTitle: { fontSize: 18, fontWeight: "600", lineHeight: 22, color: colors.foreground },
    sheetDesc: { marginTop: 4, fontSize: typography.body, color: colors.mutedForeground },
    close: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.round },
    sheetBody: { gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
    pill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.round, borderWidth: 1, paddingHorizontal: spacing.lg },
    pillAuto: { alignSelf: "flex-start" },
    pillText: { fontWeight: "600" },
    chip: { height: 40, justifyContent: "center", borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.lg },
    chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    chipText: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    chipTextOn: { color: colors.primaryForeground },
    label: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    hint: { fontSize: typography.small, color: colors.mutedForeground },
    input: { height: 44, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: spacing.md, fontSize: 16, color: colors.foreground },
    inputTall: { height: 48 },
    inputMulti: { height: undefined, minHeight: 96, paddingTop: spacing.md, textAlignVertical: "top" },
    money: { justifyContent: "center" },
    moneyR: { position: "absolute", left: 16, zIndex: 1, fontSize: 18, color: colors.mutedForeground },
    moneyInput: { height: 48, borderWidth: 1, borderColor: colors.input, borderRadius: radius.md, backgroundColor: colors.card, paddingLeft: 36, paddingRight: spacing.md, fontSize: 18, color: colors.foreground },
    progress: { flexDirection: "row", alignItems: "center", gap: 4 },
    stop: { flex: 1, minWidth: 0, gap: 4 },
    stopBar: { height: 6, borderRadius: 3 },
    stopLabel: { fontSize: 11, color: colors.mutedForeground },
    nextRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    nextText: { flex: 1 },
    section: { borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.md },
    sectionToggle: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    sectionTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    sectionSummary: { fontSize: typography.small, color: colors.mutedForeground },
    sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
    tag: { borderRadius: radius.round, paddingHorizontal: 10, paddingVertical: 2 },
    tagText: { fontSize: typography.small, fontWeight: "600" },
  }),
);
