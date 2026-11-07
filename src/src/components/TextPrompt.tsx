import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * Asks for one line of text (a reason, an amount). The app's own sheet instead of a system prompt, in
 * keeping with appAlert. Controlled: render it with `visible` and answer through onSubmit / onCancel.
 */
export function TextPrompt({
  visible,
  title,
  label,
  initialValue = "",
  confirmLabel = "OK",
  multiline,
  numeric,
  required = true,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
  numeric?: boolean;
  required?: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialValue);
  useEffect(() => {
    if (visible) setText(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            multiline={multiline}
            keyboardType={numeric ? "decimal-pad" : "default"}
            autoFocus
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, multiline && styles.multiline]}
          />
          <View style={styles.row}>
            <Button variant="outline" fullWidth={false} style={styles.btn} onPress={onCancel}>
              Cancel
            </Button>
            <Button fullWidth={false} style={styles.btn} disabled={required && !text.trim()} onPress={() => onSubmit(text.trim())}>
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
    backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
    sheet: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.md, gap: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    label: { fontSize: typography.small, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.input,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    multiline: { minHeight: 90, textAlignVertical: "top" },
    row: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
    btn: { minWidth: 96 },
  }),
);
