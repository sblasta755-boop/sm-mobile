import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

const MAX = 1000;

/**
 * "Add a note" on one checklist item: hidden until the person opens it, and
 * the note reaches the reviewer and the report. A small dot on the closed link
 * shows a note is already written.
 */
export function ItemNote({
  note,
  editable,
  onSave,
}: {
  note?: string;
  editable: boolean;
  onSave: (text: string) => void;
}) {
  useThemeVersion();
  const saved = note ?? "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(saved);

  // Nothing to show on an item nobody can add to and nobody did.
  if (!editable && !saved) return null;
  if (!editable) return <Text style={styles.readonly}>Note: {saved}</Text>;

  const dirty = text.trim() !== saved;
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.link}>
        <Ionicons name={open ? "chevron-up" : "create-outline"} size={14} color={colors.primary} />
        <Text style={styles.linkText}>{saved ? "Note" : "Add a note"}</Text>
        {!!saved && !open && <View style={styles.dot} />}
      </Pressable>
      {open && (
        <View style={styles.body}>
          <TextInput
            style={styles.input}
            multiline
            maxLength={MAX}
            value={text}
            onChangeText={setText}
            placeholder="Anything worth noting about this step"
            placeholderTextColor={colors.mutedForeground}
            textAlignVertical="top"
          />
          <View style={styles.footer}>
            <Text style={styles.count}>
              {text.length}/{MAX}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!dirty}
              onPress={() => {
                onSave(text.trim());
                if (!text.trim()) setOpen(false);
              }}
              style={[styles.save, !dirty && styles.saveOff]}
            >
              <Text style={styles.saveText}>{text.trim() ? "Save note" : "Remove note"}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { marginTop: spacing.xs },
    link: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
    linkText: { fontSize: typography.small, fontWeight: "600", color: colors.primary },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    body: { gap: spacing.xs, marginTop: 4 },
    input: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontSize: typography.body,
    },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    count: { fontSize: typography.tiny, color: colors.mutedForeground },
    save: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.round },
    saveOff: { opacity: 0.4 },
    saveText: { fontSize: typography.small, fontWeight: "700", color: colors.primaryForeground },
    readonly: { fontSize: typography.small, color: colors.mutedForeground, marginTop: spacing.xs },
  }),
);
