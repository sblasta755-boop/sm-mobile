import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { appAlert } from "@/components/Dialog";
import { listPendingMaintenanceReminders, respondMaintenanceReminder, type PendingReminder } from "@/api/client";
import { PRIORITY_LABEL, popupQueue } from "@/domain/maintenanceReminders";
import { priorityColor } from "@/domain/reminderColors";
import { useMaintenanceOn } from "@/features/maintenance";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const POLL_MS = 60_000;

/**
 * Stops the person when a high or urgent maintenance reminder is waiting on them: the moment the app opens, when it comes
 * back to the front, every minute while it is open, and when a push arrives. It cannot be dismissed (the back button does
 * nothing): the only ways out are to open the job, acknowledge it, or ignore it with a typed reason. One at a time, most
 * urgent first, coloured by priority. Mounted at the root like OvertimePrompt.
 */
export function MaintenanceReminderGate() {
  useThemeVersion();
  const insets = useSafeAreaInsets();
  const { state, currentUser } = useSmartClean();
  const token = state.accessToken;
  // Not asked at all for people who have no maintenance in this organisation.
  const on = useMaintenanceOn();
  const [queue, setQueue] = useState<PendingReminder[]>([]);
  const [ignoring, setIgnoring] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const answering = useRef(false);

  const load = useCallback(async () => {
    if (!token || answering.current) return;
    try {
      setQueue(popupQueue((await listPendingMaintenanceReminders(token)).items));
    } catch {
      setQueue([]); // no maintenance access, or no signal: nothing to show
    }
  }, [token]);

  useEffect(() => {
    if (!token || !currentUser || !on) {
      setQueue([]);
      return;
    }
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [token, currentUser, on, load]);

  const current = queue[0];
  useEffect(() => {
    setIgnoring(false);
    setReason("");
  }, [current?.id]);

  if (!on || !current || !token || !currentUser) return null;
  const tone = priorityColor(current.priority);

  const answer = async (action: "acknowledge" | "ignore", then?: () => void) => {
    setBusy(true);
    answering.current = true;
    try {
      await respondMaintenanceReminder(token, current.id, { action, reason: reason.trim() });
      setQueue((q) => q.filter((r) => r.id !== current.id));
      then?.();
    } catch (error) {
      appAlert("Could not send your answer", error instanceof Error ? error.message : "Please try again.");
    } finally {
      answering.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={[styles.sheet, { borderColor: tone }]}>
          <View style={styles.top}>
            <View style={[styles.badge, { borderColor: tone }]}>
              <Ionicons name="notifications" size={22} color={tone} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.level, { color: tone }]}>{`${PRIORITY_LABEL[current.priority]} reminder`.toUpperCase()}</Text>
              {queue.length > 1 ? <Text style={styles.muted}>{`${queue.length} waiting on you`}</Text> : null}
            </View>
          </View>
          <Text style={styles.title}>{current.jobTitle}</Text>
          <Text style={styles.muted}>{`${current.senderName} is asking · ${current.siteName} · ${current.jobState.replace(/_/g, " ")}`}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

          {ignoring ? (
            <>
              <Text style={styles.label}>Why are you ignoring it?</Text>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="So the person who asked knows where it stands"
                placeholderTextColor={colors.mutedForeground}
                multiline
                autoFocus
              />
              <Button variant="destructive" loading={busy} disabled={reason.trim().length < 3} onPress={() => answer("ignore")}>
                Ignore it
              </Button>
              <Button variant="ghost" disabled={busy} onPress={() => setIgnoring(false)}>
                Back
              </Button>
            </>
          ) : (
            <>
              <Button
                loading={busy}
                onPress={() =>
                  answer("acknowledge", () => router.push(`/maintenance/${encodeURIComponent(current.jobId)}` as never))
                }
              >
                Open the job
              </Button>
              <Button variant="outline" disabled={busy} onPress={() => answer("acknowledge")}>
                I have seen it
              </Button>
              <Button variant="ghost" disabled={busy} onPress={() => setIgnoring(true)}>
                Ignore
              </Button>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", paddingHorizontal: spacing.xl },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 2, padding: spacing.lg, gap: spacing.sm },
    top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    badge: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    level: { fontSize: typography.small, fontWeight: "800", letterSpacing: 0.5 },
    title: { fontSize: typography.h2, fontWeight: "800", color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    message: { fontSize: typography.body, color: colors.foreground, backgroundColor: colors.muted, borderRadius: radius.md, padding: spacing.md },
    label: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 90, textAlignVertical: "top", color: colors.foreground, backgroundColor: colors.card, fontSize: 16 },
  }),
);
