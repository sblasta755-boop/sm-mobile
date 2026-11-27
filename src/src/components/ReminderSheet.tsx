import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { JobReminders, ReminderPriority } from "@/api/client";
import { Field, FieldLabel, Hint, Panel, PillButton, tint } from "@/components/maintenance/JobKit";
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
 * Same as the PWA's reminder sheet.
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
    <Panel
      title="Send a reminder"
      description={`About "${jobTitle}". They get a notification, and it is kept in the job's activity.`}
      onClose={onClose}
      footer={
        <>
          <PillButton label={busy ? "Sending…" : "Send reminder"} disabled={!canSend || busy} onPress={() => void send()} />
          <PillButton label="Cancel" variant="outline" disabled={busy} onPress={onClose} />
        </>
      }
    >
      <View style={styles.group}>
        <Text style={styles.legend}>Who to remind</Text>
        {targets.length > 1 ? (
          <View style={styles.between}>
            <Text style={styles.small}>{allOn ? "Everyone" : `${chosen.length} of ${targets.length}`}</Text>
            <Pressable accessibilityRole="button" onPress={() => setChosen(allOn ? [] : targets.map((t) => t.userId))}>
              <Text style={styles.link}>{allOn ? "Clear" : "Choose everyone"}</Text>
            </Pressable>
          </View>
        ) : null}
        {targets.length > 6 ? (
          <Field placeholder="Find a person" accessibilityLabel="Find a person" value={query} onChangeText={setQuery} />
        ) : null}
        <View style={styles.people}>
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
                <View style={[styles.box, on && styles.boxOn]}>
                  {on ? <Ionicons name="checkmark" size={12} color={colors.primaryForeground} /> : null}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.personName}>{t.name}</Text>
                  <Text style={styles.personSub}>{`${roleText(t.role)} · ${t.why}`}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.legend}>How urgent</Text>
        <View style={styles.grid}>
          {PRIORITY_ORDER.map((p) => {
            const choice = choices[p];
            const on = priority === p;
            const c = priorityColor(p);
            return (
              <Pressable
                key={p}
                disabled={!choice.ok}
                onPress={() => setPriority(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !choice.ok }}
                style={[
                  styles.pri,
                  on && { borderColor: c, backgroundColor: tint(c, 0.1), borderWidth: 2 },
                  !choice.ok && { opacity: 0.5 },
                ]}
              >
                <View style={styles.priTop}>
                  <View style={[styles.dot, { backgroundColor: c }]} />
                  <Text style={[styles.priName, on && { color: c }]}>{PRIORITY_LABEL[p]}</Text>
                </View>
                <Text style={styles.small}>{choice.ok ? PRIORITY_HINT[p] : choice.note || "Not available yet"}</Text>
              </Pressable>
            );
          })}
        </View>
        <Hint>
          {`After a ${PRIORITY_LABEL[priority].toLowerCase()} reminder, the same person can be reminded again at that level after ${waitText(reminders.priorities.find((p) => p.id === priority)?.waitMinutes ?? 0)}.`}
          {reminders.dailyLeft <= 3 ? ` You have ${reminders.dailyLeft} left today on this job.` : ""}
        </Hint>
      </View>

      <View style={styles.field}>
        <FieldLabel>{need > 0 ? "Message" : "Message (optional)"}</FieldLabel>
        <Field
          multiline
          value={message}
          onChangeText={setMessage}
          placeholder={need > 0 ? "Say why it matters" : "Anything they should know"}
          accessibilityLabel="Message"
        />
        {need > 0 && message.trim().length < need ? (
          <Hint>{`A ${PRIORITY_LABEL[priority].toLowerCase()} reminder needs a reason of at least ${need} characters.`}</Hint>
        ) : null}
      </View>
    </Panel>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    group: { gap: spacing.sm },
    field: { gap: 6 },
    legend: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    small: { fontSize: typography.small, color: colors.mutedForeground },
    between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    link: { fontSize: typography.small, fontWeight: "600", color: colors.primary },
    people: { gap: 4 },
    person: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    personOn: { borderColor: colors.primary, backgroundColor: tint(colors.primary, 0.05) },
    box: { width: 18, height: 18, marginTop: 2, alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1, borderColor: colors.border },
    boxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    personName: { fontSize: typography.body, fontWeight: "500", color: colors.foreground },
    personSub: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "capitalize" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pri: { flexBasis: "47%", flexGrow: 1, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.md },
    priTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    priName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    dot: { width: 10, height: 10, borderRadius: radius.round },
  }),
);
