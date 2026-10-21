import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

const MAX = 1000;

/**
 * The note on one checklist item, in a popup, for screens (like photo capture)
 * where the person shouldn't have to go back to the checklist to write it. Same
 * note, same limit and same save as ItemNote on the task screen.
 */
export function ItemNoteModal({
  visible,
  title,
  note,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  note?: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  useThemeVersion();
  // Keep the buttons above the phone's navigation bar / gesture area.
  const insets = useSafeAreaInsets();
  const saved = note ?? "";
  const [text, setText] = useState(saved);

  // Start from the saved note each time the popup opens.
  useEffect(() => {
    if (visible) setText(saved);
  }, [visible, saved]);

  const dirty = text.trim() !== saved;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable accessibilityLabel="Close note" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <TextInput
            style={styles.input}
            multiline
            autoFocus
            maxLength={MAX}
            value={text}
            onChangeText={setText}
            placeholder="Anything worth noting about this step"
            placeholderTextColor={colors.mutedForeground}
            textAlignVertical="top"
          />
          <Text style={styles.count}>
            {text.length}/{MAX}
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!dirty}
              onPress={() => {
                onSave(text.trim());
                onClose();
              }}
              style={[styles.save, !dirty && styles.saveOff]}
            >
              <Text style={styles.saveText}>{text.trim() ? "Save note" : "Remove note"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    input: {
      minHeight: 110,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontSize: typography.body,
    },
    count: { fontSize: typography.tiny, color: colors.mutedForeground, alignSelf: "flex-end" },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
    cancel: { paddingHorizontal: spacing.md, paddingVertical: 8 },
    cancelText: { fontSize: typography.small, fontWeight: "600", color: colors.mutedForeground },
    save: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.round },
    saveOff: { opacity: 0.4 },
    saveText: { fontSize: typography.small, fontWeight: "700", color: colors.primaryForeground },
  }),
);
