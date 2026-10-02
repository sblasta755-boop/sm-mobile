import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import {
  approveStaffOnboarding,
  listPendingStaffOnboarding,
  rejectStaffOnboarding,
  type StaffGrant,
} from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";

// The manager is expected to be standing with the new starter, so this
// polls rather than waiting for a manual refresh.
const POLL_MS = 5_000;

/**
 * Staff scans waiting on a decision.
 *
 * The same screen as the platform console's approvals, for a different
 * audience — and the same security control: the QR alone does not sign
 * anyone in, it raises a request here. The match word is the whole
 * point, so it gets the most prominent treatment on the card.
 *
 * A site-scoped manager only ever sees their own sites' staff here; the
 * server filters that (see StaffOnboardingController.pending), so this
 * screen renders whatever it is given.
 */
export default function ManageApprovals() {
  const { state } = useSmartClean();
  const [pending, setPending] = useState<StaffGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!state.accessToken) return;
    try {
      setPending(await listPendingStaffOnboarding(state.accessToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load approvals");
    } finally {
      setLoading(false);
    }
  }, [state.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const timer = setInterval(() => void loadRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  async function approve(grant: StaffGrant) {
    if (!state.accessToken) return;
    setBusyId(grant.id);
    try {
      await approveStaffOnboarding(state.accessToken, grant.id);
      await load();
    } catch (err) {
      Alert.alert("Could not approve", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(grant: StaffGrant) {
    if (!state.accessToken) return;
    setBusyId(grant.id);
    try {
      await rejectStaffOnboarding(state.accessToken, grant.id, reason.trim() || undefined);
      setRejectingId(null);
      setReason("");
      await load();
    } catch (err) {
      Alert.alert("Could not reject", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen title="Approvals">
      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : pending.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="shield-checkmark-outline" size={28} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Nothing waiting</Text>
          <Text style={styles.muted}>
            When someone scans a code you showed them, their request appears here.
          </Text>
        </Card>
      ) : (
        pending.map((grant) => (
          <Card key={grant.id} style={styles.card}>
            <Text style={styles.name}>{grant.staffName ?? "Unknown"}</Text>
            <Text style={styles.muted}>
              {grant.role?.replace(/_/g, " ")}
              {grant.siteName ? ` · ${grant.siteName}` : ""}
            </Text>

            <View style={styles.matchBlock}>
              <Text style={styles.matchLabel}>They should say</Text>
              <Text style={styles.matchWord}>{grant.matchWord ?? "—"}</Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="phone-portrait-outline" size={13} color={colors.mutedForeground} />
              <Text style={styles.muted}>{grant.deviceLabel ?? "Unknown device"}</Text>
            </View>
            {grant.attempt > 1 && (
              <View style={styles.metaRow}>
                <Ionicons name="repeat-outline" size={13} color={colors.mutedForeground} />
                <Text style={styles.muted}>Attempt {grant.attempt}</Text>
              </View>
            )}

            <Text style={styles.warning}>
              Only approve if they read that word back to you. If it doesn&apos;t match,
              someone else scanned the code.
            </Text>

            {rejectingId === grant.id ? (
              <View style={styles.rejectBlock}>
                <Text style={styles.matchLabel}>Reason (they&apos;ll see this)</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Optional"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
                <Button
                  variant="destructive"
                  loading={busyId === grant.id}
                  onPress={() => reject(grant)}
                >
                  Confirm rejection
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  loading={busyId === grant.id}
                  onPress={() => approve(grant)}
                  style={styles.action}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setRejectingId(grant.id)}
                  style={styles.action}
                >
                  Reject
                </Button>
              </View>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  name: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
  },
  matchBlock: {
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  matchLabel: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.mutedForeground,
  },
  matchWord: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  warning: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.warningForeground,
    backgroundColor: colors.warningSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: { flex: 1 },
  rejectBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.background,
    textAlignVertical: "top",
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  errorCard: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.small,
    fontWeight: "600",
  },
});
