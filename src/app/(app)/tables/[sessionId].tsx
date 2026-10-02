import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import {
  acknowledgeTableRequest,
  attendTableSession,
  presentTableSessionBill,
  claimTableSession,
  confirmTableSessionBillPaid,
  confirmTableSessionClean,
  endTableSession,
  getTableSession,
  snoozeTableSessionBill,
} from "@/api/client";
import type { TableSession, WaiterSessionEndReason } from "@/types/smartclean";
import { colors, radius, spacing, typography } from "@/theme";

const END_REASONS: { value: WaiterSessionEndReason; label: string; autoTask: boolean }[] = [
  { value: "paid", label: "Paid", autoTask: true },
  { value: "walked_out", label: "Walked out", autoTask: true },
  { value: "moved_table", label: "Moved to another table", autoTask: false },
  { value: "duplicate_or_error", label: "Duplicate / scanned by mistake", autoTask: false },
  { value: "other", label: "Other", autoTask: false },
];

// Refreshed a little before the token's own ~3 min TTL so the displayed
// QR never sits visibly stale for long - the backend only actually
// rotates it once the current one is within 5s of expiring (see
// TableSessionController.refresh_token), so calling this more often
// than the TTL is harmless, just a no-op most of the time.
// How often to re-fetch this session while its screen is open - the
// only "live update" channel a waiter actually has here (see
// SESSION_POLL_MS's own note in tables/index.tsx for why push can't be
// relied on alone). 15s keeps a new table request/bill-request status
// change from sitting invisible for the up-to-30s a customer might
// otherwise wait to see the waiter respond.
const SESSION_POLL_MS = 15_000;

export default function TableSessionDetailScreen() {
  const params = useLocalSearchParams<{
    sessionId: string;
    needsCleanConfirm?: string;
    qrValue?: string;
    servedByName?: string;
    staleSignal?: string;
  }>();
  const { state } = useSmartClean();
  const isTakeoverFlow = params.sessionId === "takeover";

  const [session, setSession] = useState<TableSession | null>(null);
  const [loading, setLoading] = useState(!isTakeoverFlow);
  const [error, setError] = useState<string | null>(null);
  const [cleanPromptOpen, setCleanPromptOpen] = useState(params.needsCleanConfirm === "1");
  const [confirmingClean, setConfirmingClean] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState<WaiterSessionEndReason>("paid");
  const [endNote, setEndNote] = useState("");
  const [ending, setEnding] = useState(false);

  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeNote, setSnoozeNote] = useState("");
  const [snoozing, setSnoozing] = useState(false);

  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [takeoverReason, setTakeoverReason] = useState<WaiterSessionEndReason>("other");
  const [takeoverNote, setTakeoverNote] = useState("");

  const load = useCallback(async () => {
    if (!state.accessToken || isTakeoverFlow) return;
    try {
      const row = await getTableSession(state.accessToken, params.sessionId);
      setSession(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load table");
    }
  }, [state.accessToken, params.sessionId, isTakeoverFlow]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Live-update polling while this session's screen is open. Table
  // requests/bill status arrive via notify() server-side, which SHOULD
  // reach this device by push - but push delivery isn't guaranteed
  // (device/FCM/APNs setup, connectivity, backgrounding) and this app
  // has no other live channel (no websocket - see the mobile env's
  // unused EXPO_PUBLIC_WS_API_URL), so a waiter looking at an open table
  // must not depend on a push arriving to see a new request. Short
  // enough that a customer's "call waiter" tap shows up promptly; only
  // runs while this specific screen is mounted, not app-wide.
  useEffect(() => {
    if (!session || session.status === "ended" || isTakeoverFlow) return;
    const interval = setInterval(() => {
      if (!state.accessToken) return;
      load().catch(() => {
        // Best-effort - the screen just keeps showing its last known
        // state until the next successful tick.
      });
    }, SESSION_POLL_MS);
    return () => clearInterval(interval);
  }, [session?.id, session?.status, state.accessToken, isTakeoverFlow, load]);

  const confirmClean = useCallback(
    async (clean: boolean) => {
      if (!state.accessToken || !session) return;
      setConfirmingClean(true);
      try {
        const row = await confirmTableSessionClean(state.accessToken, session.id, clean);
        setSession(row);
        setCleanPromptOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to record answer");
      } finally {
        setConfirmingClean(false);
      }
    },
    [state.accessToken, session],
  );

  const doEnd = useCallback(async () => {
    if (!state.accessToken || !session) return;
    setEnding(true);
    setError(null);
    try {
      const row =
        endReason === "paid"
          ? await confirmTableSessionBillPaid(state.accessToken, session.id, endNote || undefined)
          : await endTableSession(state.accessToken, session.id, { reason: endReason, note: endNote || undefined });
      setSession(row);
      setEndOpen(false);
      router.replace("/tables");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to end table");
    } finally {
      setEnding(false);
    }
  }, [state.accessToken, session, endReason, endNote]);

  const doSnooze = useCallback(async () => {
    if (!state.accessToken || !session || !snoozeNote.trim()) return;
    setSnoozing(true);
    try {
      const row = await snoozeTableSessionBill(state.accessToken, session.id, snoozeNote.trim());
      setSession(row);
      setSnoozeOpen(false);
      setSnoozeNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to snooze bill reminder");
    } finally {
      setSnoozing(false);
    }
  }, [state.accessToken, session, snoozeNote]);

  const doAcknowledge = useCallback(
    async (requestId: string) => {
      if (!state.accessToken || !session) return;
      try {
        const row = await acknowledgeTableRequest(state.accessToken, session.id, requestId);
        setSession(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to acknowledge request");
      }
    },
    [state.accessToken, session],
  );

  const doTakeover = useCallback(async () => {
    if (!state.accessToken || !params.qrValue) return;
    setTakeoverBusy(true);
    setError(null);
    try {
      const result = await claimTableSession(state.accessToken, {
        value: params.qrValue,
        confirmTakeover: true,
        takeoverReason,
        takeoverNote: takeoverNote || undefined,
      });
      if (result.claimed && result.session) {
        router.replace({
          pathname: "/tables/[sessionId]",
          params: {
            sessionId: result.session.id,
            needsCleanConfirm: result.cleaningConfirmationRequired ? "1" : "0",
          },
        });
      } else {
        setError(result.blockedReason ?? "Could not take over this table");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to take over table");
    } finally {
      setTakeoverBusy(false);
    }
  }, [state.accessToken, params.qrValue, takeoverReason, takeoverNote]);

  if (isTakeoverFlow) {
    return (
      <Screen title="Table occupied" backTo="/tables">
        <Card style={styles.section}>
          <Text style={styles.title}>Currently served by {params.servedByName || "another waiter"}</Text>
          <Text style={styles.hint}>{params.staleSignal}</Text>
          <Text style={styles.label}>Reason to take over</Text>
          <View style={styles.reasonList}>
            {END_REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={[styles.reasonChip, takeoverReason === r.value && styles.reasonChipActive]}
                onPress={() => setTakeoverReason(r.value)}
              >
                <Text style={[styles.reasonChipText, takeoverReason === r.value && styles.reasonChipTextActive]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.noteInput}
            placeholder="Optional note"
            placeholderTextColor={colors.mutedForeground}
            value={takeoverNote}
            onChangeText={setTakeoverNote}
            multiline
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Button loading={takeoverBusy} onPress={doTakeover}>
            End their session and take over
          </Button>
          <Button variant="outline" style={styles.cancelButton} onPress={() => router.back()}>
            Cancel
          </Button>
        </Card>
      </Screen>
    );
  }

  if (loading || !session) {
    return (
      <Screen title="Table" backTo="/tables">
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  const pendingRequests = session.requests.filter((r) => !r.acknowledgedAt);

  return (
    <Screen title={session.locationName ?? "Table"} backTo="/tables">
      <Card style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{session.locationName ?? "Table"}</Text>
          <StatusBadge
            tone={session.status === "bill_requested" ? "warning" : session.status === "ended" ? "muted" : "success"}
            label={session.status === "bill_requested" ? "Bill requested" : session.status === "ended" ? "Ended" : "Active"}
          />
        </View>
        <Text style={styles.hint}>
          Started {new Date(session.startedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
          {session.customerJoinedAt ? " · Customer has joined" : " · Waiting for customer to scan"}
        </Text>
      </Card>

      {session.status !== "ended" && (
        <Card style={styles.qrCard}>
          <Text style={styles.label}>Customer requests</Text>
          <Text style={styles.hint}>
            The table's own QR code (the one you scanned to claim it) is what the customer scans too - it works for
            them any time, whether you're at the table or not. No separate code to show them here.
          </Text>
        </Card>
      )}

      {session.status !== "ended" && session.riskLevel && session.riskLevel !== "ok" && (
        <Card style={styles.section}>
          <Text style={styles.label}>{session.riskLevel === "at_risk" ? "This table may be leaving" : "Check on this table"}</Text>
          {(session.riskReasons ?? []).map((reason) => (
            <Text key={reason} style={styles.hint}>
              {reason}
            </Text>
          ))}
          <Button
            variant="outline"
            onPress={async () => {
              if (!state.accessToken) return;
              setSession(await attendTableSession(state.accessToken, session.id));
            }}
          >
            I&apos;ve been to this table
          </Button>
        </Card>
      )}

      {session.status === "active" && (
        <Card style={styles.section}>
          <Text style={styles.label}>Bring the bill</Text>
          <Text style={styles.hint}>
            Tap when you take the bill to the table without being asked. It starts the same bill reminders, so it is
            tracked until it&apos;s paid.
          </Text>
          <Button
            variant="outline"
            onPress={async () => {
              if (!state.accessToken) return;
              setSession(await presentTableSessionBill(state.accessToken, session.id));
            }}
          >
            Bill presented
          </Button>
        </Card>
      )}

      {pendingRequests.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.label}>Pending requests</Text>
          {pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestKind}>{request.kind.toUpperCase()}</Text>
                {request.note && <Text style={styles.hint}>{request.note}</Text>}
              </View>
              <Button variant="outline" fullWidth={false} onPress={() => doAcknowledge(request.id)}>
                Acknowledge
              </Button>
            </View>
          ))}
        </Card>
      )}

      {session.status === "bill_requested" && (
        <Card style={styles.section}>
          <Text style={styles.label}>Bill requested</Text>
          <Text style={styles.hint}>
            {session.billReminderCount ? `${session.billReminderCount} reminder(s) sent.` : "Confirm once paid, or snooze if you're already on it."}
          </Text>
          <View style={styles.billActions}>
            <Button
              style={{ flex: 1 }}
              onPress={() => {
                setEndReason("paid");
                setEndOpen(true);
              }}
            >
              Confirm paid
            </Button>
            <Button variant="outline" style={{ flex: 1 }} onPress={() => setSnoozeOpen(true)}>
              Snooze
            </Button>
          </View>
        </Card>
      )}

      {session.status !== "ended" && (
        <Button variant="destructive" style={styles.endButton} onPress={() => setEndOpen(true)}>
          End table session
        </Button>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Clean-confirmation prompt - shown right after a fresh claim or
          a completed takeover, per TableSessionController.claim's
          cleaningConfirmationRequired flag. */}
      <Modal visible={cleanPromptOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.title}>Is this table clean?</Text>
            <Text style={styles.hint}>If not, we'll create a cleaning task before you start serving.</Text>
            <View style={styles.billActions}>
              <Button style={{ flex: 1 }} loading={confirmingClean} onPress={() => confirmClean(true)}>
                Yes, clean
              </Button>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                loading={confirmingClean}
                onPress={() => confirmClean(false)}
              >
                No, needs cleaning
              </Button>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Manual end - reason required. */}
      <Modal visible={endOpen} transparent animationType="slide" onRequestClose={() => setEndOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.title}>End table session</Text>
            <View style={styles.reasonList}>
              {END_REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  style={[styles.reasonChip, endReason === r.value && styles.reasonChipActive]}
                  onPress={() => setEndReason(r.value)}
                >
                  <Text style={[styles.reasonChipText, endReason === r.value && styles.reasonChipTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              {END_REASONS.find((r) => r.value === endReason)?.autoTask
                ? "A cleaning task will be created automatically."
                : "No cleaning task will be created for this reason."}
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Optional note"
              placeholderTextColor={colors.mutedForeground}
              value={endNote}
              onChangeText={setEndNote}
              multiline
            />
            <Button loading={ending} onPress={doEnd}>
              End session
            </Button>
            <Button variant="outline" style={styles.cancelButton} onPress={() => setEndOpen(false)}>
              Cancel
            </Button>
          </Card>
        </View>
      </Modal>

      {/* Snooze bill reminder. */}
      <Modal visible={snoozeOpen} transparent animationType="slide" onRequestClose={() => setSnoozeOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.title}>Snooze bill reminder</Text>
            <Text style={styles.hint}>
              This clears the current request - the customer will need to request the bill again for reminders to resume.
            </Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Reason (required)"
              placeholderTextColor={colors.mutedForeground}
              value={snoozeNote}
              onChangeText={setSnoozeNote}
              multiline
            />
            <Button loading={snoozing} disabled={!snoozeNote.trim()} onPress={doSnooze}>
              Snooze
            </Button>
            <Button variant="outline" style={styles.cancelButton} onPress={() => setSnoozeOpen(false)}>
              Cancel
            </Button>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  hint: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  qrCard: {
    marginBottom: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  qrWrap: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: "#fff",
    borderRadius: radius.md,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  requestKind: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  billActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  endButton: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: typography.tiny,
    color: colors.destructive,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    gap: spacing.sm,
  },
  reasonList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  reasonChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonChipText: {
    fontSize: typography.tiny,
    fontWeight: "600",
    color: colors.foreground,
  },
  reasonChipTextActive: {
    color: colors.primaryForeground,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.small,
    color: colors.foreground,
    backgroundColor: colors.background,
    minHeight: 60,
    textAlignVertical: "top",
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
