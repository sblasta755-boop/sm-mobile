import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { resolveStaffRole, useRoleLabel } from "@/features/roles";
import { GroupCard, GroupSection, PersonRow, TeamCard, ViewSwitch } from "@/components/TeamKit";
import { groupByRole, groupBySite, sitesText, teamSummary } from "@/domain/teamGroups";
import { useSmartClean } from "@/features/store";
import {
  fetchStaffOnboardingQrSvg,
  getStaffOnboardingStatus,
  reopenStaffOnboardingCode,
  revealStaffOnboardingCode,
  updateUser,
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
  const { state, currentUser, dispatch } = useSmartClean();
  const roleLabel = useRoleLabel();
  // Admins and operations managers always can; a site manager unless it was switched off. Fails open until loaded.
  const canOnboard = currentUser ? currentUser.canOnboardStaff !== false : true;
  // Management roles come back lower case ("site manager"); under a name it reads better as "Site manager".
  const roleName = (role: string) => roleLabel(role).replace(/^./, (c) => c.toUpperCase());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DemoUser | null>(null);
  const [grant, setGrant] = useState<StaffGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingGrant, setLoadingGrant] = useState(false);

  const [view, setView] = useState<"site" | "role">("site");
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());

  // Everyone but me, narrowed by the search.
  const team = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = state.users.filter((user) => user.id !== currentUser?.id);
    return needle
      ? rows.filter(
          (user) =>
            user.name.toLowerCase().includes(needle) ||
            (user.email ?? "").toLowerCase().includes(needle) ||
            user.role.toLowerCase().includes(needle) ||
            roleLabel(user.role).toLowerCase().includes(needle),
        )
      : rows;
    // roleLabel is rebuilt each render from state.staffRoles, which is already a dependency through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.users, state.staffRoles, currentUser, query]);

  const people = useMemo(() => team.map((user) => ({ ...user, status: statusOf(user) })), [team]);
  // The app's Site has no ownerId field, but bootstrap passes the backend's record through; an operations manager's
  // sites hang off it.
  const sites = useMemo(
    () => state.sites.map((site) => ({ id: site.id, name: site.name, ownerId: (site as { ownerId?: string }).ownerId, ownerIds: (site as { ownerIds?: string[] }).ownerIds })),
    [state.sites],
  );
  const summary = useMemo(
    () => teamSummary(state.users.filter((user) => user.id !== currentUser?.id).map((user) => ({ ...user, status: statusOf(user) }))),
    [state.users, currentUser],
  );
  const bySite = useMemo(() => groupBySite(people, sites), [people, sites]);
  const byRole = useMemo(
    () => groupByRole(people, (role) => resolveStaffRole(state.staffRoles, role)?.pluralLabel),
    [people, state.staffRoles],
  );
  // While searching every group is open, so a match is never hidden in a closed one.
  const searching = query.trim().length > 0;
  const isOpen = (key: string) => searching || openKeys.has(key);
  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  // Only an org admin or operations manager can grant this; the server ignores it from anyone else.
  async function setCanOnboard(value: boolean) {
    if (!selected || !state.accessToken) return;
    setBusy(true);
    try {
      // The backend replaces the stored record on PUT, so send back everything it gave us (the roster spreads the raw
      // record) plus the one change.
      const raw = selected as DemoUser & { username?: string; status?: string };
      await updateUser(state.accessToken, selected.id, {
        ...raw,
        displayName: raw.name,
        username: raw.username ?? raw.email ?? raw.id,
        email: raw.email ?? `${raw.id}@smartclean.local`,
        status: raw.status ?? "Active",
        canOnboardStaff: value,
      });
      dispatch({ type: "UPDATE_USER", userId: selected.id, patch: { canOnboardStaff: value } });
      setSelected({ ...selected, canOnboardStaff: value });
    } catch (err) {
      appAlert("Could not save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    const canGrantOnboarding =
      (currentUser?.role === "org_admin" || currentUser?.role === "operations_manager") &&
      selected.role !== "org_admin" &&
      selected.role !== "operations_manager";
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

        {canGrantOnboarding && (
          <Card style={styles.detailCard}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Can onboard staff</Text>
                <Text style={styles.muted}>Lets them add new staff at their own sites and approve their sign-in.</Text>
              </View>
              <Switch
                value={selected.canOnboardStaff ?? false}
                disabled={busy}
                trackColor={{ true: colors.primary, false: colors.neutral }}
                accessibilityLabel="Can onboard staff"
                onValueChange={(value) => void setCanOnboard(value)}
              />
            </View>
          </Card>
        )}

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
      <TeamCard summary={summary} />
      {/* Adding someone lives here as well as on Overview and Profile: when Maintenance is on it takes the Add
          staff tab's place on the bar. Only for people allowed to onboard staff. */}
      {canOnboard ? (
        <Button
          icon={<Ionicons name="person-add" size={16} color={colors.primaryForeground} />}
          onPress={() => router.push("/manage-add-staff" as never)}
        >
          Add staff
        </Button>
      ) : null}
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
      <ViewSwitch
        value={view}
        onChange={setView}
        options={[
          { value: "site", label: "By site" },
          { value: "role", label: "By role" },
        ]}
      />

      {team.length === 0 ? (
        <Card>
          <Text style={styles.muted}>
            {state.users.length <= 1
              ? "Nobody on your team yet. Add someone with the Add staff button."
              : "Nothing matches that search."}
          </Text>
        </Card>
      ) : view === "site" ? (
        <>
          {bySite.acrossSites.length > 0 && (
            <GroupCard
              icon="globe-outline"
              title="Across sites"
              subtitle={plural(bySite.acrossSites.length, "admin or operations manager", "admins and operations managers")}
              initials={bySite.acrossSites.map((u) => u.initials)}
              open={isOpen("across")}
              onToggle={() => toggle("across")}
            >
              {bySite.acrossSites.map((user, i) => (
                <PersonRow
                  key={user.id}
                  first={i === 0}
                  initials={user.initials}
                  name={user.name}
                  detail={`${roleName(user.role)} · ${sitesText(user, sites)}`}
                  status={user.status}
                  onPress={() => setSelected(user)}
                />
              ))}
            </GroupCard>
          )}
          {bySite.sites.map((group) => (
            <GroupCard
              key={group.site.id}
              icon="business-outline"
              title={group.site.name}
              subtitle={plural(group.people.length, "person", "people")}
              initials={group.people.map((u) => u.initials)}
              open={isOpen(`site:${group.site.id}`)}
              onToggle={() => toggle(`site:${group.site.id}`)}
            >
              {group.sections.map((section) => (
                <View key={section.key}>
                  <GroupSection title={section.title} />
                  {section.people.map((user, i) => (
                    <PersonRow
                      key={user.id}
                      first={i === 0}
                      initials={user.initials}
                      name={user.name}
                      detail={roleName(user.role)}
                      status={user.status}
                      onPress={() => setSelected(user)}
                    />
                  ))}
                </View>
              ))}
            </GroupCard>
          ))}
          {bySite.noSite.length > 0 && (
            <GroupCard
              icon="help-circle-outline"
              title="No site yet"
              subtitle={plural(bySite.noSite.length, "person", "people")}
              initials={bySite.noSite.map((u) => u.initials)}
              open={isOpen("nosite")}
              onToggle={() => toggle("nosite")}
            >
              {bySite.noSite.map((user, i) => (
                <PersonRow
                  key={user.id}
                  first={i === 0}
                  initials={user.initials}
                  name={user.name}
                  detail={roleName(user.role)}
                  status={user.status}
                  onPress={() => setSelected(user)}
                />
              ))}
            </GroupCard>
          )}
        </>
      ) : (
        byRole.map((group) => (
          <GroupCard
            key={group.role}
            icon={ROLE_ICON[group.role] ?? "person-outline"}
            title={group.title}
            subtitle={String(group.people.length)}
            initials={group.people.map((u) => u.initials)}
            open={isOpen(`role:${group.role}`)}
            onToggle={() => toggle(`role:${group.role}`)}
          >
            {group.people.map((user, i) => (
              <PersonRow
                key={user.id}
                first={i === 0}
                initials={user.initials}
                name={user.name}
                detail={sitesText(user, sites)}
                status={user.status}
                onPress={() => setSelected(user)}
              />
            ))}
          </GroupCard>
        ))
      )}
    </Screen>
  );
}

const ROLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  org_admin: "shield-checkmark-outline",
  operations_manager: "briefcase-outline",
  site_manager: "business-outline",
  supervisor: "eye-outline",
  client_auditor: "clipboard-outline",
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
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
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    marginBottom: spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: typography.body,
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
