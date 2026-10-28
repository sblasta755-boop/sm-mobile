import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { appAlert } from "@/components/Dialog";
import { useSmartClean } from "@/features/store";
import { decideTableOrder, getSessionOrders, voidTableOrderLine } from "@/api/client";
import type { TableOrder, TableOrderLineDecision, TableSessionOrders } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const POLL_MS = 10_000;
const STATUS_LABEL: Record<TableOrder["status"], string> = {
  awaiting_confirmation: "Needs your answer",
  accepted: "Confirmed",
  partially_accepted: "Partly confirmed",
  declined: "Declined",
  cancelled: "Cancelled by guest",
};

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

interface Draft {
  order: TableOrder;
  decisions: Record<string, { accept: boolean; qty: number; reason: string }>;
}

/** The table's guest orders (accept, trim or decline) and its bill so far. */
export function WaiterOrders({ sessionId, ended }: { sessionId: string; ended: boolean }) {
  useThemeVersion();
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [data, setData] = useState<TableSessionOrders | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [declining, setDeclining] = useState<TableOrder | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getSessionOrders(token, sessionId));
    } catch {
      // The table screen already reports load problems; stay quiet here.
    }
  }, [token, sessionId]);

  useEffect(() => {
    void load();
    if (ended) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, ended]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (error) {
      appAlert("Could not do that", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!data || (data.orders.length === 0 && !data.canOrder)) return null;
  const currency = data.bill?.currency ?? "ZAR";
  const m = (n: number) => money(n, currency);
  const bill = data.bill;

  const submitReview = async () => {
    if (!draft || !token) return;
    const lines: TableOrderLineDecision[] = draft.order.lines.map((l) => {
      const d = draft.decisions[l.id];
      return d.accept ? { lineId: l.id, action: "accept", qty: d.qty } : { lineId: l.id, action: "decline", reason: d.reason || "Sold out" };
    });
    await run(() => decideTableOrder(token, draft.order.id, { action: "review", lines }));
    setDraft(null);
  };

  const removeLine = (lineId: string, name: string) =>
    appAlert(`Take ${name} off the bill?`, "Use this when it was never served.", [
      { text: "Keep it", style: "cancel" },
      { text: "Take off", style: "destructive", onPress: () => { if (token) void run(() => voidTableOrderLine(token, lineId)); } },
    ]);

  return (
    <>
      {data.orders.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.label}>Guest orders</Text>
          {[...data.orders].reverse().map((order) => {
            const waiting = order.status === "awaiting_confirmation";
            return (
              <View key={order.id} style={[styles.order, waiting && styles.orderWaiting]}>
                <View style={styles.row}>
                  <Text style={styles.orderTitle}>Order {order.number}</Text>
                  <Text style={styles.hint}>{STATUS_LABEL[order.status]}</Text>
                </View>
                {order.lines.map((line) => (
                  <View key={line.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.body, line.status === "declined" && styles.struck]}>
                        {line.qty} x {line.name}
                        {line.options.length > 0 ? ` (${line.options.join(", ")})` : ""}
                      </Text>
                      {line.note ? <Text style={styles.hint}>Note: {line.note}</Text> : null}
                      {line.status === "accepted" && line.qtyAccepted < line.qty ? <Text style={styles.warn}>Only {line.qtyAccepted} confirmed</Text> : null}
                    </View>
                    <Text style={styles.body}>{m(line.lineTotalMinor)}</Text>
                    {!ended && line.qtyAccepted > 0 && (
                      <Pressable onPress={() => removeLine(line.id, line.name)} hitSlop={8} accessibilityLabel={`Remove ${line.name}`}>
                        <Text style={styles.remove}>Remove</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {order.note ? <Text style={styles.hint}>Guest note: {order.note}</Text> : null}
                {waiting && !ended && (
                  <View style={styles.actions}>
                    <Button style={{ flex: 1 }} loading={busy} onPress={async () => { if (token) await run(() => decideTableOrder(token, order.id, { action: "accept_all" })); }}>
                      Accept all
                    </Button>
                    <Button
                      style={{ flex: 1 }}
                      variant="outline"
                      onPress={() => setDraft({ order, decisions: Object.fromEntries(order.lines.map((l) => [l.id, { accept: true, qty: l.qty, reason: "" }])) })}
                    >
                      Review
                    </Button>
                    <Button style={{ flex: 1 }} variant="outline" onPress={() => { setReason(""); setDeclining(order); }}>
                      Decline
                    </Button>
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {bill && (bill.lines.length > 0 || bill.pendingCount > 0) && (
        <Card style={styles.section}>
          <Text style={styles.label}>Bill so far</Text>
          {bill.lines.map((line, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.body, { flex: 1 }]}>{line.qty} x {line.name}</Text>
              <Text style={styles.body}>{m(line.lineTotalMinor)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.hint}>Subtotal</Text><Text style={styles.body}>{m(bill.totals.subtotal)}</Text></View>
          {bill.totals.service > 0 && <View style={styles.row}><Text style={styles.hint}>Service charge</Text><Text style={styles.body}>{m(bill.totals.service)}</Text></View>}
          {bill.vatRateBp > 0 && <View style={styles.row}><Text style={styles.hint}>VAT {bill.vatRateBp / 100}%{bill.pricesIncludeVat ? " (included)" : ""}</Text><Text style={styles.body}>{m(bill.totals.vat)}</Text></View>}
          <View style={styles.row}><Text style={styles.total}>Total</Text><Text style={styles.total}>{m(bill.totals.total)}</Text></View>
          {bill.pendingCount > 0 && (
            <Text style={styles.pendingNote}>{bill.pendingCount} item{bill.pendingCount > 1 ? "s" : ""} ({m(bill.pendingTotalMinor)}) not confirmed yet, so not on this bill.</Text>
          )}
        </Card>
      )}

      <Modal visible={draft !== null} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.orderTitle}>Review order {draft?.order.number}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {draft?.order.lines.map((line) => {
                const d = draft.decisions[line.id];
                const set = (patch: Partial<typeof d>) => setDraft({ ...draft, decisions: { ...draft.decisions, [line.id]: { ...d, ...patch } } });
                return (
                  <View key={line.id} style={styles.reviewLine}>
                    <Text style={styles.body}>{line.name}{line.options.length > 0 ? ` (${line.options.join(", ")})` : ""}</Text>
                    <View style={styles.actions}>
                      <Pressable style={[styles.chip, d.accept && styles.chipOn]} onPress={() => set({ accept: true })}><Text style={[styles.chipText, d.accept && styles.chipTextOn]}>Serve</Text></Pressable>
                      <Pressable style={[styles.chip, !d.accept && styles.chipDanger]} onPress={() => set({ accept: false })}><Text style={[styles.chipText, !d.accept && styles.chipTextOn]}>Can't serve</Text></Pressable>
                      {d.accept && (
                        <View style={styles.stepper}>
                          <Pressable disabled={d.qty <= 1} onPress={() => set({ qty: d.qty - 1 })} hitSlop={8} accessibilityLabel="Fewer"><Text style={[styles.stepBtn, d.qty <= 1 && styles.dim]}>-</Text></Pressable>
                          <Text style={styles.body}>{d.qty} of {line.qty}</Text>
                          <Pressable disabled={d.qty >= line.qty} onPress={() => set({ qty: d.qty + 1 })} hitSlop={8} accessibilityLabel="More"><Text style={[styles.stepBtn, d.qty >= line.qty && styles.dim]}>+</Text></Pressable>
                        </View>
                      )}
                    </View>
                    {!d.accept && <TextInput style={styles.input} placeholder="Reason (e.g. sold out)" placeholderTextColor={colors.mutedForeground} value={d.reason} onChangeText={(t) => set({ reason: t })} maxLength={200} />}
                  </View>
                );
              })}
            </ScrollView>
            <Button loading={busy} onPress={submitReview}>Confirm</Button>
            <Button variant="outline" onPress={() => setDraft(null)}>Cancel</Button>
          </Card>
        </View>
      </Modal>

      <Modal visible={declining !== null} transparent animationType="slide" onRequestClose={() => setDeclining(null)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.orderTitle}>Decline order {declining?.number}</Text>
            <TextInput style={styles.input} placeholder="Reason for the guest (optional)" placeholderTextColor={colors.mutedForeground} value={reason} onChangeText={setReason} maxLength={200} />
            <Button
              loading={busy}
              onPress={async () => {
                if (!declining || !token) return;
                await run(() => decideTableOrder(token, declining.id, { action: "decline_all", reason: reason.trim() || undefined }));
                setDeclining(null);
              }}
            >
              Decline order
            </Button>
            <Button variant="outline" onPress={() => setDeclining(null)}>Cancel</Button>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  section: { marginBottom: spacing.md, gap: spacing.xs },
  label: { fontSize: typography.small, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 },
  order: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs, marginTop: spacing.xs },
  orderWaiting: { borderColor: colors.primary, backgroundColor: colors.accent },
  orderTitle: { fontSize: typography.h2, color: colors.foreground },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  body: { fontSize: typography.body, color: colors.foreground },
  hint: { fontSize: typography.small, color: colors.mutedForeground },
  warn: { fontSize: typography.small, color: colors.warning },
  struck: { textDecorationLine: "line-through", color: colors.mutedForeground },
  remove: { fontSize: typography.small, color: colors.destructive, textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: spacing.xs, alignItems: "center", flexWrap: "wrap", marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  total: { fontSize: typography.h2, color: colors.foreground },
  pendingNote: { fontSize: typography.small, color: colors.foreground, backgroundColor: colors.accent, padding: spacing.sm, borderRadius: radius.md },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 420, gap: spacing.sm },
  reviewLine: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.round, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { backgroundColor: colors.destructive, borderColor: colors.destructive },
  chipText: { fontSize: typography.small, color: colors.foreground },
  chipTextOn: { color: colors.primaryForeground },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: "auto" },
  stepBtn: { fontSize: typography.h1, color: colors.foreground, paddingHorizontal: spacing.sm },
  dim: { opacity: 0.3 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.foreground, fontSize: typography.body },
}));
