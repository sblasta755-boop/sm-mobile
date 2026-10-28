import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { attendTableSession, claimTableSession, getPendingTableOrders, listTableSessions } from "@/api/client";
import { elapsedLabel, riskLabel, sortByRisk, startedLabel } from "@/features/tableRisk";
import { Button } from "@/components/Button";
import type { PendingTableOrder, TableSession } from "@/types/smartclean";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// How often to re-fetch the table grid while this screen is open. Push
// SHOULD tell the waiter about a new request the moment it lands
// (notify() fires one server-side, see TableSessionController.
// create_request), but delivery isn't guaranteed (device/FCM/APNs setup,
// connectivity, backgrounding), and this app's only other "live update"
// trigger is a push actually arriving (see pushNotifications.ts's
// addNotificationReceivedListener - there is no websocket and no other
// polling anywhere else in the app). Without this, a pending request sat
// invisible on this screen until the waiter force-closed and reopened
// the app. 20s keeps the grid reasonably current without hammering the
// API from every waiter's device at once.
const TABLES_POLL_MS = 20_000;

// A waiter's table-grid: every table they're operating right now, plus
// today's already-ended ones for quick reference. Mirrors the shape of
// the (supervise) group's own list screens (a Card per row, pull to
// refresh) rather than inventing a new list pattern.
export default function TablesScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitingOrders, setWaitingOrders] = useState<PendingTableOrder[]>([]);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    try {
      const rows = await listTableSessions(state.accessToken);
      setSessions(rows);
      // Fails harmlessly when the organisation does not use the built-in menu.
      getPendingTableOrders(state.accessToken).then(setWaitingOrders).catch(() => setWaitingOrders([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tables");
    }
  }, [state.accessToken]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      load().catch(() => {
        // Best-effort - the grid just keeps showing its last known state
        // until the next successful tick.
      });
    }, TABLES_POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const claim = useCallback(
    async (value: string) => {
      if (!state.accessToken || !value.trim()) return;
      setClaiming(true);
      setError(null);
      try {
        const result = await claimTableSession(state.accessToken, { value: value.trim().toUpperCase() });
        if (result.blocked) {
          setError(result.blockedReason ?? "This table is occupied");
          return;
        }
        if (result.takeoverOffered) {
          // Hand off to the detail screen's own takeover prompt rather
          // than deciding here - it needs the reason/note form, which
          // belongs with the rest of the end/takeover UI.
          router.push({
            pathname: "/tables/[sessionId]",
            params: { sessionId: "takeover", qrValue: value.trim().toUpperCase(), servedByName: result.servedByName ?? "", staleSignal: result.staleSignal ?? "" },
          });
          return;
        }
        if (result.claimed && result.session) {
          await load();
          router.push({
            pathname: "/tables/[sessionId]",
            params: {
              sessionId: result.session.id,
              needsCleanConfirm: result.cleaningConfirmationRequired ? "1" : "0",
            },
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to claim table");
      } finally {
        setClaiming(false);
        setClaimCode("");
      }
    },
    [state.accessToken, load],
  );

  // "I've been to this table" - one tap clears the not-attended marker.
  const attend = useCallback(
    async (sessionId: string) => {
      if (!state.accessToken) return;
      const row = await attendTableSession(state.accessToken, sessionId);
      setSessions((current) => current.map((s) => (s.id === row.id ? row : s)));
    },
    [state.accessToken],
  );

  const active = sortByRisk(sessions.filter((s) => s.status !== "ended"));
  const ended = sessions.filter((s) => s.status === "ended").slice(0, 10);
  const needAttention = active.filter((s) => s.riskLevel === "at_risk" || s.riskLevel === "watch").length;
  const pendingTotal = active.reduce((sum, s) => sum + s.requests.filter((r) => !r.acknowledgedAt).length, 0);

  return (
    <Screen title="My Tables">
      {waitingOrders.length > 0 && (
        <Card style={styles.ordersCard}>
          <Text style={styles.ordersTitle}>
            {waitingOrders.length} order{waitingOrders.length === 1 ? "" : "s"} waiting for you
          </Text>
          {waitingOrders.map((o) => (
            <Pressable key={o.order.id} style={styles.ordersRow} onPress={() => router.push(`/tables/${o.sessionId}`)}>
              <Text style={styles.ordersName}>{o.locationName}</Text>
              <Text style={styles.ordersMeta}>Order {o.order.number}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      <Card style={styles.claimCard}>
        <View style={styles.claimTop}>
          <View style={styles.claimIcon}>
            <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.claimCopy}>
            <Text style={styles.claimTitle}>Claim a table</Text>
            <Text style={styles.claimHint}>Scan the QR on the table to start serving it.</Text>
          </View>
        </View>
        <Button onPress={() => router.push("/scan")}>Scan table QR</Button>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </Card>

      {!loading && (
        <View style={styles.stats}>
          <Stat label="Open" value={active.length} />
          <Stat label="Need attention" value={needAttention} tone={needAttention > 0 ? "danger" : undefined} />
          <Stat label="Requests" value={pendingTotal} tone={pendingTotal > 0 ? "primary" : undefined} />
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <View style={{ opacity: refreshing ? 0.6 : 1 }}>
          <Text style={styles.sectionTitle}>Active ({active.length})</Text>
          {active.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={28} color={colors.mutedForeground} />
              <Text style={styles.emptyTitle}>No tables claimed yet</Text>
              <Text style={styles.emptyText}>Scan a table's QR above and it will show up here.</Text>
            </View>
          )}
          {active.map((session) => (
            <SessionRow key={session.id} session={session} onAttend={attend} />
          ))}

          {ended.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Recently ended</Text>
              {ended.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "primary" }) {
  return (
    <View style={styles.stat}>
      <Text
        style={[
          styles.statValue,
          tone === "danger" && { color: colors.destructive },
          tone === "primary" && { color: colors.primary },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SessionRow({ session, onAttend }: { session: TableSession; onAttend?: (sessionId: string) => Promise<void> }) {
  const risk = riskLabel(session.riskLevel);
  const ended = session.status === "ended";
  const tone = session.status === "bill_requested" ? "warning" : ended ? "muted" : "success";
  const label = session.status === "bill_requested" ? "Bill requested" : ended ? "Ended" : "Active";
  const pendingRequests = session.requests.filter((r) => !r.acknowledgedAt);
  const riskColor = session.riskLevel === "at_risk" ? colors.destructive : colors.warning;
  const accent = ended ? colors.border : risk ? riskColor : colors.success;

  if (ended) {
    return (
      <Pressable onPress={() => router.push(`/tables/${session.id}`)} style={styles.endedRow}>
        <View style={styles.endedMain}>
          <Text style={styles.endedTitle}>{session.locationName ?? "Table"}</Text>
          <Text style={styles.rowSub}>
            {startedLabel(session.startedAt)}
            {pendingRequests.length > 0 ? ` · ${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"} unanswered` : ""}
          </Text>
        </View>
        <StatusBadge tone={tone} label={label} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => router.push(`/tables/${session.id}`)}>
      <Card style={styles.row} padded={false}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>{session.locationName ?? "Table"}</Text>
            <StatusBadge tone={tone} label={label} />
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.rowSub}>
              Open {elapsedLabel(session.startedAt)} · since {startedLabel(session.startedAt)}
              {session.customerJoinedAt ? " · Guest joined" : ""}
            </Text>
          </View>
          {risk && (
            <View style={[styles.riskBox, { backgroundColor: `${riskColor}1A` }]}>
              <Ionicons name="alert-circle" size={16} color={riskColor} />
              <View style={styles.riskCopy}>
                <Text style={[styles.riskText, { color: riskColor }]}>{risk}</Text>
                {session.riskReasons?.[0] ? <Text style={styles.riskReason}>{session.riskReasons[0]}</Text> : null}
              </View>
            </View>
          )}
          {pendingRequests.length > 0 && (
            <View style={styles.pendingChip}>
              <Ionicons name="notifications" size={13} color={colors.primary} />
              <Text style={styles.pendingText}>
                {pendingRequests.length} pending request{pendingRequests.length === 1 ? "" : "s"}
              </Text>
            </View>
          )}
          {risk && onAttend && (
            <Button variant="outline" fullWidth={false} onPress={() => onAttend(session.id)}>
              I&apos;ve been to this table
            </Button>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  ordersCard: { marginBottom: spacing.md, gap: spacing.xs, borderColor: colors.primary, backgroundColor: colors.accent },
  ordersTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
  ordersRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs },
  ordersName: { fontSize: typography.body, fontWeight: "600", color: colors.foreground, textTransform: "capitalize" },
  ordersMeta: { fontSize: typography.small, color: colors.mutedForeground },
  claimCard: { marginBottom: spacing.md, gap: spacing.md },
  claimTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  claimIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.primary}1A`,
  },
  claimCopy: { flex: 1, gap: 2 },
  claimTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  claimHint: { fontSize: typography.small, color: colors.mutedForeground },
  errorText: { fontSize: typography.small, color: colors.destructive },
  stats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statValue: { fontSize: typography.title, fontWeight: "800", color: colors.foreground },
  statLabel: { fontSize: typography.tiny, color: colors.mutedForeground, fontWeight: "600" },
  loader: { marginTop: spacing.xl },
  sectionTitle: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.mutedForeground,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground },
  emptyText: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center" },
  row: { marginBottom: spacing.sm, flexDirection: "row" },
  accent: { width: 5 },
  rowBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { fontSize: typography.h1, fontWeight: "800", color: colors.foreground, textTransform: "capitalize" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowSub: { flexShrink: 1, fontSize: typography.small, color: colors.mutedForeground },
  riskBox: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  riskCopy: { flex: 1, gap: 2 },
  riskText: { fontSize: typography.small, fontWeight: "700" },
  riskReason: { fontSize: typography.small, color: colors.foreground },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: `${colors.primary}1A`,
  },
  pendingText: { fontSize: typography.small, color: colors.primary, fontWeight: "700" },
  endedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    opacity: 0.85,
  },
  endedMain: { flex: 1, gap: 2 },
  endedTitle: { fontSize: typography.body, fontWeight: "600", color: colors.foreground, textTransform: "capitalize" },
}));
