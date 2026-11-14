import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * A bottom sheet that asks for one piece of text (the reason for sending an item back). The app has
 * its own alert dialog but none that takes typing, and the browser's prompt is never used. The sheet is
 * drawn edge to edge, so its bottom is kept clear of the phone's navigation buttons or gesture bar.
 */
export function TextPromptSheet({
  visible,
  title,
  description,
  label,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.muted}>{description}</Text> : null}
          <Text style={styles.label}>{label}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            autoFocus
            style={styles.input}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={label}
          />
          <View style={styles.row}>
            <Button variant="outline" fullWidth={false} style={styles.half} onPress={onCancel}>
              Cancel
            </Button>
            <Button fullWidth={false} style={styles.half} disabled={!text.trim()} onPress={() => onSubmit(text.trim())}>
              {confirmLabel}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    fill: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    title: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    label: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground, marginTop: spacing.xs },
    input: {
      minHeight: 88,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    half: { flex: 1 },
  }),
);
