import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { claimTableSession, listTableSessions } from "@/api/client";
import type { TableSession } from "@/types/smartclean";
import { colors, radius, spacing, typography } from "@/theme";

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
  const { state } = useSmartClean();
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    try {
      const rows = await listTableSessions(state.accessToken);
      setSessions(rows);
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

  const active = sessions.filter((s) => s.status !== "ended");
  const ended = sessions.filter((s) => s.status === "ended").slice(0, 10);

  return (
    <Screen title="My Tables">
      <Card style={styles.claimCard}>
        <Text style={styles.claimTitle}>Claim a table</Text>
        <Text style={styles.claimHint}>Scan a table's QR from the main Scan tab, or enter its code below.</Text>
        <View style={styles.claimRow}>
          <Pressable
            style={styles.claimInputWrap}
            onPress={() => router.push("/scan")}
          >
            <Ionicons name="qr-code-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.claimInputPlaceholder}>{claimCode || "Scan or type table code"}</Text>
          </Pressable>
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </Card>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <View style={{ opacity: refreshing ? 0.6 : 1 }}>
          <Text style={styles.sectionTitle}>Active ({active.length})</Text>
          {active.length === 0 && <Text style={styles.emptyText}>No tables claimed yet.</Text>}
          {active.map((session) => (
            <SessionRow key={session.id} session={session} />
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

function SessionRow({ session }: { session: TableSession }) {
  const tone =
    session.status === "bill_requested" ? "warning" : session.status === "ended" ? "muted" : "success";
  const label =
    session.status === "bill_requested" ? "Bill requested" : session.status === "ended" ? "Ended" : "Active";
  const pendingRequests = session.requests.filter((r) => !r.acknowledgedAt);
  return (
    <Pressable onPress={() => router.push(`/tables/${session.id}`)}>
      <Card style={styles.row}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle}>{session.locationName ?? "Table"}</Text>
          <StatusBadge tone={tone} label={label} />
        </View>
        <Text style={styles.rowSub}>
          Started {new Date(session.startedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
          {session.customerJoinedAt ? " · Customer joined" : ""}
        </Text>
        {pendingRequests.length > 0 && (
          <View style={styles.pendingRow}>
            <Ionicons name="notifications" size={12} color={colors.warning} />
            <Text style={styles.pendingText}>
              {pendingRequests.length} pending request{pendingRequests.length === 1 ? "" : "s"}
            </Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  claimCard: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  claimTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  claimHint: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  claimRow: {
    marginTop: spacing.xs,
  },
  claimInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  claimInputPlaceholder: {
    color: colors.mutedForeground,
    fontSize: typography.small,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: typography.tiny,
    color: colors.destructive,
  },
  loader: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.mutedForeground,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  row: {
    marginBottom: spacing.sm,
    gap: 4,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  rowSub: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  pendingText: {
    fontSize: typography.tiny,
    color: colors.warning,
    fontWeight: "600",
  },
});
