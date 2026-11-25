import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import type { JobReminders, ReminderPriority } from "@/api/client";
import { fuzzyFilter } from "@/domain/fuzzySearch";
import {
  PRIORITY_HINT,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  priorityChoices,
  waitText,
} from "@/domain/maintenanceReminders";
import { priorityColor } from "@/domain/reminderColors";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const roleText = (role: string) => role.replace(/_/g, " ");

/**
 * Remind the people this job is waiting on: choose who (everyone by default), how urgent, and say why. A priority that
 * cannot be sent yet says when it can. The server checks every rule again; this only shows what it worked out.
 */
export function ReminderSheet({
  reminders,
  jobTitle,
  onSubmit,
  onClose,
}: {
  reminders: JobReminders;
  jobTitle: string;
  onSubmit: (input: { priority: ReminderPriority; message: string; recipientIds: string[] }) => Promise<boolean>;
  onClose: () => void;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const { targets } = reminders;
  const [chosen, setChosen] = useState<string[]>(targets.map((t) => t.userId));
  const [priority, setPriority] = useState<ReminderPriority>("normal");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => priorityChoices(targets, chosen), [targets, chosen]);
  const need = reminders.priorities.find((p) => p.id === priority)?.minMessage ?? 0;
  const shown = useMemo(() => fuzzyFilter(targets, query, (t) => [t.name, roleText(t.role)]), [targets, query]);
  const canSend = chosen.length > 0 && choices[priority].ok && message.trim().length >= need && reminders.dailyLeft > 0;
  const allOn = chosen.length === targets.length;
  const toggle = (id: string) => setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  const send = async () => {
    setBusy(true);
    const done = await onSubmit({ priority, message: message.trim(), recipientIds: chosen });
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.title}>Send a reminder</Text>
            <Text style={styles.muted}>{`About "${jobTitle}". They get a notification, and it is kept in the job's history.`}</Text>

            <Text style={styles.heading}>Who to remind</Text>
            {targets.length > 1 && (
              <Pressable onPress={() => setChosen(allOn ? [] : targets.map((t) => t.userId))} accessibilityRole="button">
                <Text style={styles.link}>{allOn ? "Everyone chosen. Clear" : `${chosen.length} of ${targets.length}. Choose everyone`}</Text>
              </Pressable>
            )}
            {targets.length > 6 && (
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Find a person"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Find a person"
              />
            )}
            {shown.map((t) => {
              const on = chosen.includes(t.userId);
              return (
                <Pressable
                  key={t.userId}
                  onPress={() => toggle(t.userId)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.person, on && styles.personOn]}
                >
                  <Text style={styles.personName}>{t.name}</Text>
                  <Text style={styles.muted}>{`${roleText(t.role)} · ${t.why}`}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.heading}>How urgent</Text>
            <View style={styles.grid}>
              {PRIORITY_ORDER.map((p) => {
                const choice = choices[p];
                const on = priority === p;
                return (
                  <Pressable
                    key={p}
                    disabled={!choice.ok}
                    onPress={() => setPriority(p)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !choice.ok }}
                    style={[styles.pri, on && { borderColor: priorityColor(p), borderWidth: 2 }, !choice.ok && { opacity: 0.5 }]}
                  >
                    <View style={styles.priTop}>
                      <View style={[styles.dot, { backgroundColor: priorityColor(p) }]} />
                      <Text style={styles.personName}>{PRIORITY_LABEL[p]}</Text>
                    </View>
                    <Text style={styles.muted}>{choice.ok ? PRIORITY_HINT[p] : choice.note || "Not available yet"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>
              {`After a ${PRIORITY_LABEL[priority].toLowerCase()} reminder, the same person can be reminded again at that level after ${waitText(reminders.priorities.find((p) => p.id === priority)?.waitMinutes ?? 0)}.`}
              {reminders.dailyLeft <= 3 ? ` You have ${reminders.dailyLeft} left today on this job.` : ""}
            </Text>

            <Text style={styles.heading}>{need > 0 ? "Message" : "Message (optional)"}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder={need > 0 ? "Say why it matters" : "Anything they should know"}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Message"
            />
            {need > 0 && message.trim().length < need ? (
              <Text style={styles.muted}>{`A ${PRIORITY_LABEL[priority].toLowerCase()} reminder needs a reason of at least ${need} characters.`}</Text>
            ) : null}

            <Button loading={busy} disabled={!canSend} onPress={() => void send()}>
              Send reminder
            </Button>
            <Button variant="ghost" disabled={busy} onPress={onClose}>
              Cancel
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
    sheet: { maxHeight: "92%", backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    body: { padding: spacing.lg, gap: spacing.sm },
    title: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    heading: { fontSize: typography.body, fontWeight: "700", color: colors.foreground, marginTop: spacing.sm },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.body, color: colors.foreground, backgroundColor: colors.card },
    multiline: { minHeight: 80, textAlignVertical: "top" },
    person: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card, gap: 2 },
    personOn: { borderColor: colors.primary, borderWidth: 2 },
    personName: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pri: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card, gap: 2 },
    priTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    dot: { width: 10, height: 10, borderRadius: 5 },
  }),
);
