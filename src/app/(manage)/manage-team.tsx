import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useRoleLabel } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import {
  fetchStaffOnboardingQrSvg,
  getStaffOnboardingStatus,
  reopenStaffOnboardingCode,
  revealStaffOnboardingCode,
  type StaffGrant,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { StatusTone } from "@/theme";
import type { DemoUser } from "@/types/smartclean";
import { appAlert } from "@/components/Dialog";

/**
 * The manager's team roster, and where an unfinished onboarding is
 * picked back up.
 *
 * Reads the roster from bootstrap rather than fetching: the backend has
 * already scoped `users` to what this manager may see (is_site_scoped
 * filters to their own sites), so this list is correct without any
 * client-side filtering to get wrong.
 *
 * The onboarding state per person is NOT in bootstrap, so it is fetched
 * lazily - only when someone taps a person who is still Pending
 * Activation, which is the only case where a code is relevant.
 */

function statusTone(status: string): StatusTone {
  if (status === "Active") return "success";
  if (status === "Pending Activation") return "warning";
  return "muted";
}

export default function ManageTeam() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const roleLabel = useRoleLabel();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DemoUser | null>(null);
  const [grant, setGrant] = useState<StaffGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingGrant, setLoadingGrant] = useState(false);

  const team = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = state.users.filter((user) => user.id !== currentUser?.id);
    const matched = needle
      ? rows.filter(
          (user) =>
            user.name.toLowerCase().includes(needle) ||
            (user.email ?? "").toLowerCase().includes(needle) ||
            user.role.toLowerCase().includes(needle),
        )
      : rows;
    // Anyone who has not finished onboarding floats to the top: they are
    // the only rows that need the manager to do something.
    return [...matched].sort((a, b) => {
      const aPending = statusOf(a) === "Pending Activation" ? 0 : 1;
      const bPending = statusOf(b) === "Pending Activation" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return a.name.localeCompare(b.name);
    });
  }, [state.users, currentUser, query]);

  const loadGrant = useCallback(
    async (user: DemoUser) => {
      if (!state.accessToken) return;
      setLoadingGrant(true);
      setGrant(null);
      setQrSvg(null);
      try {
        const result = await getStaffOnboardingStatus(state.accessToken, user.id);
        setGrant(result.grant);
        if (result.grant?.isLive) {
          setQrSvg(await fetchStaffOnboardingQrSvg(state.accessToken, user.id));
        }
      } catch {
        // A person invited by email has no grant at all - not an error,
        // just nothing to show.
        setGrant(null);
      } finally {
        setLoadingGrant(false);
      }
    },
    [state.accessToken],
  );

  useEffect(() => {
    if (selected) void loadGrant(selected);
  }, [selected, loadGrant]);

  async function showCode() {
    if (!selected || !state.accessToken) return;
    setBusy(true);
    try {
      const revealed = await revealStaffOnboardingCode(state.accessToken, selected.id);
      setGrant(revealed);
      setQrSvg(await fetchStaffOnboardingQrSvg(state.accessToken, selected.id));
    } catch (err) {
      appAlert("Could not show the code", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reissue() {
    if (!selected || !state.accessToken) return;
    setBusy(true);
    try {
      await reopenStaffOnboardingCode(state.accessToken, selected.id);
      await loadGrant(selected);
    } catch (err) {
      appAlert("Could not reissue", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    const pending = statusOf(selected) === "Pending Activation";
    return (
      <Screen title={selected.name} backTo="/manage-team">
        <Card style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailRole}>{roleLabel(selected.role)}</Text>
            <StatusBadge tone={statusTone(statusOf(selected))} label={statusOf(selected)} />
          </View>
          {selected.email && <Text style={styles.muted}>{selected.email}</Text>}
        </Card>

        {pending && (
          <Card style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Onboarding</Text>
            {loadingGrant ? (
              <Text style={styles.muted}>Checking…</Text>
            ) : !grant ? (
              <Text style={styles.muted}>
                This person was invited by email rather than a QR code. They&apos;ll set
                their password from that invite.
              </Text>
            ) : (
              <>
                <Text style={styles.muted}>
                  {grant.status === "scanned"
                    ? "They've scanned - approve it in the Approvals tab."
                    : grant.status === "rejected"
                      ? (grant.rejectedReason ?? "The last attempt was rejected.")
                      : grant.isLive
                        ? "Code is live. Have them scan it now."
                        : "No live code. Show one when they're with you."}
                </Text>

                {qrSvg && grant.isLive && (
                  <View style={styles.qrWrap}>
                    <SvgXml xml={qrSvg} width="100%" height={230} />
                    <Text style={styles.matchLabel}>They should say</Text>
                    <Text style={styles.matchWord}>{grant.matchWord ?? "-"}</Text>
                  </View>
                )}

                {grant.status === "pending" && (
                  <Button loading={busy} onPress={() => showCode()}>
                    {grant.isLive ? "Show again" : "Show the code"}
                  </Button>
                )}
                {grant.status !== "approved" && (
                  <Button variant="outline" loading={busy} onPress={() => reissue()}>
                    Issue a new code
                  </Button>
                )}
              </>
            )}
          </Card>
        )}

        <Button variant="ghost" onPress={() => setSelected(null)}>
          Back to team
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Team">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your team…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {team.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            {state.users.length <= 1
              ? "Nobody on your team yet. Add someone from the Add staff tab."
              : "Nothing matches that search."}
          </Text>
        </Card>
      ) : (
        team.map((user) => (
          <Pressable key={user.id} onPress={() => setSelected(user)}>
            <Card style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.initials}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {user.name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {roleLabel(user.role)}
                </Text>
              </View>
              <StatusBadge tone={statusTone(statusOf(user))} label={statusOf(user)} />
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

/** A user's account status.
 *
 * DemoUser has no declared `status`, but normalizeUser spreads the whole
 * backend record through (see api/client.ts), so it is present at
 * runtime for anyone bootstrap returned. Read defensively rather than
 * widening the shared type for one screen. */
function statusOf(user: DemoUser): string {
  const status = (user as unknown as { status?: unknown }).status;
  return typeof status === "string" ? status : "Active";
}

const styles = themedStyles(() => StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: typography.body,
    color: colors.foreground,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: typography.small,
    fontWeight: "800",
    color: colors.primary,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  detailCard: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailRole: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  qrWrap: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  matchLabel: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.mutedForeground,
  },
  matchWord: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.primary,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 19,
  },
}));
