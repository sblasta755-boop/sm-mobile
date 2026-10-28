import { useCallback, useState } from "react";
import { Redirect, router, useFocusEffect } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { appAlert } from "@/components/Dialog";
import {
  cancelLeave,
  decideLeave,
  getLeaveBalances,
  listLeaveRequests,
  type LeaveBalances,
  type LeaveRequest,
  type LeaveStatus,
} from "@/api/client";
import { useCanDecideLeave, useLeaveOn } from "@/features/leave";
import { useHomePath } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const TONE: Record<LeaveStatus, "warning" | "success" | "destructive" | "neutral"> = {
  pending: "warning",
  approved: "success",
  declined: "destructive",
  cancelled: "neutral",
};
const LABEL: Record<LeaveStatus, string> = { pending: "Waiting", approved: "Approved", declined: "Declined", cancelled: "Cancelled" };

const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
};
const rangeText = (r: Pick<LeaveRequest, "startDate" | "endDate" | "halfDay">) =>
  r.startDate === r.endDate ? `${dayText(r.startDate)}${r.halfDay ? (r.halfDay === "am" ? ", morning" : ", afternoon") : ""}` : `${dayText(r.startDate)} to ${dayText(r.endDate)}`;
const daysText = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;

/** Your balance and requests, and for a supervisor or manager the requests waiting for a decision. */
export default function LeaveScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const on = useLeaveOn();
  const canDecide = useCanDecideLeave();
  const homePath = useHomePath();
  const token = state.accessToken;
  const [balances, setBalances] = useState<LeaveBalances | null>(null);
  const [mine, setMine] = useState<LeaveRequest[] | null>(null);
  const [waiting, setWaiting] = useState<LeaveRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<LeaveRequest | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    getLeaveBalances(token).then(setBalances).catch(() => setBalances(null));
    listLeaveRequests(token, { mine: true }).then(setMine).catch(() => setMine([]));
    if (canDecide) {
      listLeaveRequests(token, { status: "pending" })
        .then((rows) => setWaiting(rows.filter((r) => r.userId !== currentUser?.id)))
        .catch(() => setWaiting([]));
    }
  }, [token, canDecide, currentUser?.id]);
  useFocusEffect(load);

  if (!on) return <Redirect href={homePath as never} />;

  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await work();
      appAlert(done, undefined, undefined, "success");
      load();
    } catch (error) {
      appAlert("Could not do that", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title="Leave">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.balances}>
        {balances?.balances.map((b) => (
          <Card key={b.typeId} style={styles.balance}>
            <Text style={styles.muted}>{b.typeName}</Text>
            <Text style={[styles.big, b.remaining !== null && b.remaining < 0 && styles.bad]}>{b.remaining === null ? b.taken : b.remaining}</Text>
            <Text style={styles.muted}>
              {b.remaining === null ? "days taken" : "days left"}
              {b.pending ? `, ${b.pending} waiting` : ""}
            </Text>
          </Card>
        )) ?? <Text style={styles.muted}>Loading your leave…</Text>}
      </ScrollView>

      <Button onPress={() => router.push("/leave-new" as never)} icon={<Ionicons name="add" size={18} color={colors.primaryForeground} />}>
        Ask for leave
      </Button>

      {canDecide && waiting.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Waiting for you ({waiting.length})</Text>
          {waiting.map((row) => (
            <Card key={row.id} style={styles.card}>
              <Text style={styles.title}>{row.userName}</Text>
              <Text style={styles.body}>
                {row.typeName}: {rangeText(row)} ({daysText(row.days)})
              </Text>
              {!!row.reason && <Text style={styles.muted}>{row.reason}</Text>}
              {!!row.noteUrl && <Text style={styles.muted}>A medical note is attached. Open it on the web.</Text>}
              <View style={styles.pair}>
                <Button fullWidth={false} onPress={() => run(row.id, () => decideLeave(token as string, row.id, true), "Approved")} disabled={busyId === row.id}>
                  Approve
                </Button>
                <Button fullWidth={false} variant="outline" onPress={() => { setNote(""); setDeclining(row); }} disabled={busyId === row.id}>
                  Decline
                </Button>
              </View>
            </Card>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.heading}>My leave</Text>
        {mine === null && <Text style={styles.muted}>Loading…</Text>}
        {mine?.length === 0 && <Text style={styles.muted}>No leave yet. Tap Ask for leave to start.</Text>}
        {mine?.map((row) => (
          <Card key={row.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{row.typeName}</Text>
              <StatusBadge tone={TONE[row.status]} label={LABEL[row.status]} />
            </View>
            <Text style={styles.body}>
              {rangeText(row)} ({daysText(row.days)})
            </Text>
            {row.status === "declined" && !!row.decisionNote && <Text style={styles.bad}>{row.decisionNote}</Text>}
            {row.status === "approved" && !!row.decidedBy && <Text style={styles.muted}>Approved by {row.decidedBy}</Text>}
            {(row.status === "pending" || row.status === "approved") && (
              <Button variant="outline" fullWidth={false} disabled={busyId === row.id} onPress={() => run(row.id, () => cancelLeave(token as string, row.id), "Cancelled")}>
                Cancel
              </Button>
            )}
          </Card>
        ))}
      </View>

      <Modal visible={declining !== null} transparent animationType="fade" onRequestClose={() => setDeclining(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDeclining(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.heading}>Decline leave</Text>
            <Text style={styles.muted}>
              {declining?.userName}, {declining ? rangeText(declining) : ""}. Say why, so they know what to do next.
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
                  await run(target.id, () => decideLeave(token as string, target.id, false, note), "Declined");
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
    balances: { gap: spacing.sm, paddingBottom: spacing.sm },
    balance: { minWidth: 130, gap: 2 },
    big: { fontSize: typography.title, fontWeight: "700", color: colors.foreground },
    section: { marginTop: spacing.lg, gap: spacing.sm },
    heading: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    card: { gap: spacing.xs },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    body: { fontSize: typography.body, color: colors.foreground },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    bad: { fontSize: typography.small, color: colors.destructive },
    pair: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-start", padding: spacing.xl, paddingTop: spacing.xxl * 2 },
    sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.foreground, backgroundColor: colors.card, fontSize: 16, minHeight: 44 },
    multiline: { minHeight: 90, textAlignVertical: "top" },
  }),
);
