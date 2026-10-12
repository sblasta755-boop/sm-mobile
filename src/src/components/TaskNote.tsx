import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { saveTaskNote } from "@/api/client";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";
import type { Task } from "@/types/smartclean";

const MAX = 1000;

/**
 * "Add a note": optional, and closed unless the person doing the task opens it
 * (or has already written one). Whatever is saved here reaches the reviewer with
 * the submission. Read-only once the task is submitted.
 */
export function TaskNote({ task, editable }: { task: Task; editable: boolean }) {
  useThemeVersion();
  const { state, dispatch } = useSmartClean();
  const saved = task.note ?? "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(saved);
  const [saving, setSaving] = useState(false);

  // Nothing to show on a task nobody can add to and nobody did.
  if (!editable && !saved) return null;
  const expanded = open || (!editable && !!saved);
  const dirty = text.trim() !== saved;

  async function save() {
    if (!state.accessToken || !dirty) return;
    setSaving(true);
    try {
      const updated = await saveTaskNote(state.accessToken, task.id, text);
      dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { note: updated.note ?? null } });
      setText(updated.note ?? "");
      if (!updated.note) setOpen(false);
    } catch (error) {
      appAlert("Could not save the note", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.box}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        disabled={!editable}
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
      >
        <View style={styles.titleRow}>
          <Ionicons name="create-outline" size={18} color={colors.foreground} />
          <Text style={styles.title}>{editable ? "Add a note" : "Note"}</Text>
          {editable && <Text style={styles.optional}>Optional</Text>}
        </View>
        {editable && (
          <View style={styles.titleRow}>
            {!!saved && !expanded && <View style={styles.dot} />}
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
          </View>
        )}
      </Pressable>

      {expanded && editable && (
        <View style={styles.body}>
          <TextInput
            style={styles.input}
            multiline
            maxLength={MAX}
            value={text}
            onChangeText={setText}
            placeholder="Anything your reviewer should know about this task"
            placeholderTextColor={colors.mutedForeground}
            textAlignVertical="top"
          />
          <View style={styles.footer}>
            <Text style={styles.count}>
              {text.length}/{MAX}
            </Text>
            <Button fullWidth={false} loading={saving} disabled={!dirty} onPress={() => void save()}>
              {text.trim() ? "Save note" : "Remove note"}
            </Button>
          </View>
        </View>
      )}
      {expanded && !editable && <Text style={styles.readonly}>{saved}</Text>}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    box: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: "hidden",
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
    titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    optional: {
      fontSize: typography.tiny,
      fontWeight: "700",
      color: colors.mutedForeground,
      backgroundColor: colors.secondary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.round,
      overflow: "hidden",
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
    body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
    input: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm,
      color: colors.foreground,
      backgroundColor: colors.background,
      fontSize: typography.body,
    },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    count: { fontSize: typography.small, color: colors.mutedForeground },
    readonly: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, color: colors.foreground, fontSize: typography.body, lineHeight: 20 },
  }),
);
