import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import { decideOvertime, listOvertime, type OvertimeRequest } from "@/api/client";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const TONE: Record<OvertimeRequest["status"], "warning" | "success" | "destructive" | "neutral"> = {
  awaiting_approval: "warning",
  approved: "success",
  declined: "destructive",
  expired: "neutral",
  cancelled: "neutral",
};
const LABEL: Record<OvertimeRequest["status"], string> = {
  awaiting_approval: "Waiting",
  approved: "Approved",
  declined: "Declined",
  expired: "Lapsed",
  cancelled: "Withdrawn",
};
const timeText = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Overtime asked for by staff still on site past shift end. A supervisor decides for field staff,
 * a site manager for a supervisor. */
export default function OvertimeScreen() {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [waiting, setWaiting] = useState<OvertimeRequest[] | null>(null);
  const [history, setHistory] = useState<OvertimeRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<OvertimeRequest | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    listOvertime(token, "pending").then(setWaiting).catch(() => setWaiting([]));
    listOvertime(token, "history")
      .then((rows) => setHistory(rows.filter((r) => r.status !== "awaiting_approval")))
      .catch(() => setHistory([]));
  }, [token]);
  useFocusEffect(load);

  const decide = async (row: OvertimeRequest, approve: boolean, reason?: string) => {
    if (!token) return;
    setBusyId(row.id);
    try {
      await decideOvertime(token, row.id, approve, reason);
      appAlert(approve ? "Approved" : "Declined", undefined, undefined, "success");
      load();
    } catch (error) {
      appAlert("Could not do that", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title="Overtime">
      <Text style={styles.muted}>
        Staff still on site after shift end ask here. Approved time is counted; declined or undecided time is cut back to shift end.
      </Text>

      <View style={styles.section}>
        <Text style={styles.heading}>Waiting for you{waiting?.length ? ` (${waiting.length})` : ""}</Text>
        {waiting === null && <Text style={styles.muted}>Loading…</Text>}
        {waiting?.length === 0 && <Text style={styles.muted}>No overtime is waiting for you.</Text>}
        {waiting?.map((row) => (
          <Card key={row.id} style={styles.card}>
            <Text style={styles.title}>{row.userName}</Text>
            <Text style={styles.muted}>
              Asked {timeText(row.requestedAt)} · shift ended {timeText(row.shiftEndAt)}
            </Text>
            <Text style={styles.body}>{row.reason}</Text>
            <View style={styles.pair}>
              <Button fullWidth={false} disabled={busyId === row.id} onPress={() => decide(row, true)}>
                Approve
              </Button>
              <Button fullWidth={false} variant="outline" disabled={busyId === row.id} onPress={() => { setNote(""); setDeclining(row); }}>
                Decline
              </Button>
            </View>
          </Card>
        ))}
      </View>

      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Decided</Text>
          {history.map((row) => (
            <Card key={row.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{row.userName}</Text>
                <StatusBadge tone={TONE[row.status]} label={LABEL[row.status]} />
              </View>
              <Text style={styles.body}>{row.reason}</Text>
              {!!row.decisionNote && <Text style={styles.muted}>{row.decisionNote}</Text>}
            </Card>
          ))}
        </View>
      )}

      <Modal visible={declining !== null} transparent animationType="fade" onRequestClose={() => setDeclining(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeclining(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.heading}>Decline overtime</Text>
            <Text style={styles.muted}>
              {declining?.userName}'s hours will end at shift end. Say why, so they know.
            </Text>
            <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} multiline placeholder="Reason" placeholderTextColor={colors.mutedForeground} autoFocus />
            <View style={styles.pair}>
              <Button fullWidth={false} variant="outline" onPress={() => setDeclining(null)}>
                Close
              </Button>
              <Button
                fullWidth={false}
                disabled={!note.trim() || busyId === declining?.id}
                onPress={async () => {
                  const target = declining;
                  if (!target) return;
                  setDeclining(null);
                  await decide(target, false, note.trim());
                }}
              >
                Decline
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    section: { marginTop: spacing.lg, gap: spacing.sm },
    heading: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    card: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    pair: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-start", padding: spacing.xl, paddingTop: spacing.xxl * 2 },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: 16, minHeight: 44 },
    multiline: { minHeight: 90, textAlignVertical: "top" },
  }),
);
