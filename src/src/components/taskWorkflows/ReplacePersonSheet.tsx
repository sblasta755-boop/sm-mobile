import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { getWorkflowCandidatesForTask, replaceWorkflowPerson } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { bookingHours, workflowItems } from "@/domain/taskWorkflows";
import type { Task, WorkflowCandidate, WorkflowCandidates } from "@/types/smartclean";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * Swap who does the work on a task because someone cannot come: one item, or everything a person has not
 * yet signed. People booked in the Schedule for that day come first; someone not booked can still be
 * chosen, but only on purpose. The booking itself is never changed.
 */
export function ReplacePersonSheet({
  task,
  visible,
  itemId,
  onClose,
  onDone,
}: {
  task: Task;
  visible: boolean;
  /** Replace on this one item. Without it the person who cannot come is chosen in the sheet. */
  itemId?: string;
  onClose: () => void;
  onDone: (task: Task) => void;
}) {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const { state } = useSmartClean();
  const items = useMemo(() => workflowItems(task), [task]);
  const unsigned = items.filter((i) => !i.signedAt);
  const single = itemId ? items.find((i) => i.id === itemId) : undefined;
  const people = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const item of unsigned) {
      const entry = byId.get(item.assigneeId) ?? { id: item.assigneeId, name: item.assigneeName, count: 0 };
      entry.count += 1;
      byId.set(item.assigneeId, entry);
    }
    return [...byId.values()];
  }, [unsigned]);

  const [candidates, setCandidates] = useState<WorkflowCandidates | null>(null);
  const [fromUserId, setFromUserId] = useState("");
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("");
  const [allowUnbooked, setAllowUnbooked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !state.accessToken) return;
    let cancelled = false;
    setCandidates(null);
    setChosen("");
    setReason("");
    setAllowUnbooked(false);
    setFromUserId(people[0]?.id ?? "");
    getWorkflowCandidatesForTask(state.accessToken, task.id)
      .then((out) => !cancelled && setCandidates(out))
      .catch((error) => {
        if (cancelled) return;
        appAlert("Could not load who is available", error instanceof Error ? error.message : undefined);
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // people changes with the task; the list is only reloaded when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, state.accessToken, task.id]);

  const leaving = single?.assigneeId ?? fromUserId;
  const without = (list: WorkflowCandidate[]) => list.filter((p) => p.id !== leaving);
  const booked = without(candidates?.booked ?? []);
  const others = without(candidates?.others ?? []);
  const person = [...booked, ...others].find((p) => p.id === chosen);
  const notBooked = !!person && !booked.some((p) => p.id === chosen);
  const ready = !!chosen && !!leaving && reason.trim().length > 0 && !person?.onLeave && (!notBooked || allowUnbooked);

  const submit = async () => {
    if (!state.accessToken || !ready) return;
    if (state.connectivity === "offline") {
      appAlert("You are offline", "Swapping people needs a connection. Try again when you are back online.");
      return;
    }
    setBusy(true);
    try {
      const updated = await replaceWorkflowPerson(state.accessToken, task.id, {
        assigneeId: chosen,
        reason: reason.trim(),
        ...(single ? { itemId: single.id } : { fromUserId: leaving }),
        allowUnbooked: notBooked && allowUnbooked,
      });
      appAlert("Replaced", "Both people have been told.");
      onDone(updated);
      onClose();
    } catch (error) {
      appAlert("Could not replace them", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const row = (p: WorkflowCandidate, isBooked: boolean) => {
    const selected = chosen === p.id;
    return (
      <Pressable
        key={p.id}
        disabled={p.onLeave}
        onPress={() => setChosen(p.id)}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: p.onLeave }}
        style={[styles.person, selected && styles.personSelected, p.onLeave && styles.personOff]}
      >
        <View style={styles.personText}>
          <Text style={styles.personName}>{p.name}</Text>
          <Text style={styles.muted}>
            {isBooked ? bookingHours(p.startTime, p.endTime) : "Not booked that day"}
            {p.itemCount > 0 ? ` | has ${p.itemCount} item${p.itemCount === 1 ? "" : "s"} here` : ""}
          </Text>
        </View>
        {p.onLeave ? <Text style={styles.leave}>On leave</Text> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={() => !busy && onClose()} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>{single ? `Replace on "${single.label}"` : "Someone cannot come"}</Text>
            <Text style={styles.muted}>
              {single
                ? `Now ${single.assigneeName}. Choose who does it instead.`
                : "Everything they have not signed yet goes to the person you choose. What they already signed stays with them."}
            </Text>

            {!single && (
              <View style={styles.group}>
                <Text style={styles.heading}>Who cannot come</Text>
                {people.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setFromUserId(p.id);
                      setChosen("");
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: fromUserId === p.id }}
                    style={[styles.person, fromUserId === p.id && styles.personSelected]}
                  >
                    <Text style={styles.personName}>
                      {p.name} ({p.count} item{p.count === 1 ? "" : "s"} left)
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {candidates === null ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.muted}>Loading who is available…</Text>
              </View>
            ) : (
              <>
                <View style={styles.group}>
                  <Text style={styles.heading}>Booked for {candidates.day}</Text>
                  {booked.length === 0 ? (
                    <Text style={styles.muted}>Nobody else is booked at this site that day.</Text>
                  ) : (
                    booked.map((p) => row(p, true))
                  )}
                </View>
                {others.length > 0 && (
                  <View style={styles.group}>
                    <Text style={styles.heading}>Others at this site</Text>
                    {others.map((p) => row(p, false))}
                  </View>
                )}
              </>
            )}

            {notBooked && (
              <View style={styles.warn}>
                <Text style={styles.warnText}>{person?.name} is not booked that day. Put them on the task anyway.</Text>
                <Switch value={allowUnbooked} onValueChange={setAllowUnbooked} accessibilityLabel="Put them on the task anyway" />
              </View>
            )}

            <View style={styles.group}>
              <Text style={styles.heading}>Why (kept on the task)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={300}
                placeholder="For example: called in sick"
                placeholderTextColor={colors.mutedForeground}
                style={styles.input}
                accessibilityLabel="Why"
              />
            </View>

            <View style={styles.actions}>
              <Button variant="outline" fullWidth={false} style={styles.half} disabled={busy} onPress={onClose}>
                Cancel
              </Button>
              <Button fullWidth={false} style={styles.half} disabled={!ready} loading={busy} onPress={submit}>
                Replace
              </Button>
            </View>
          </ScrollView>
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
      maxHeight: "88%",
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    content: { gap: spacing.md },
    title: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    heading: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
    group: { gap: spacing.sm },
    loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    person: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.background,
    },
    personSelected: { borderColor: colors.primary, backgroundColor: colors.accent },
    personOff: { opacity: 0.5 },
    personText: { flex: 1 },
    personName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
    leave: { fontSize: typography.tiny, fontWeight: "700", color: colors.mutedForeground },
    warn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.warningSoft,
    },
    warnText: { flex: 1, fontSize: typography.small, color: colors.foreground },
    input: {
      minHeight: 72,
      textAlignVertical: "top",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    actions: { flexDirection: "row", gap: spacing.sm },
    half: { flex: 1 },
  }),
);
