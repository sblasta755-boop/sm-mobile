import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  approveStaffOnboarding,
  createStaffOnboarding,
  fetchStaffOnboardingQrSvg,
  getStaffOnboardingStatus,
  rejectStaffOnboarding,
  reopenStaffOnboardingCode,
  revealStaffOnboardingCode,
  type StaffGrant,
} from "@/api/client";
import { isFieldRole } from "@/features/roles";
import { useRecentPicks } from "@/features/recentPicks";
import { liveRecent } from "@/domain/recentPicks";
import type { Site, StaffRole } from "@/types/smartclean";
import { PickerRow, PickerSheet, RecentChips, type PickerItem } from "@/components/PickerSheet";
import {
  ErrorNote,
  FormField,
  Hint,
  MissingNote,
  PillButton,
  ScanPanel,
  SectionLabel,
  StepBar,
  SummaryCard,
  initialsOf,
} from "@/components/OnboardKit";
import { colors, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

/**
 * Add a team member and hand them a QR code to scan: the form, the code, and the approval, on one screen because they
 * happen in one sitting with the person standing there.
 *
 * Used by a manager on their own organisation (manage-add-staff) and by a platform operator acting inside an
 * organisation (platform-onboard), so everything organisation-specific comes in as props: the token to act with, its
 * roles and sites, and whether the actor may hand out the management roles.
 *
 * The roles offered mirror _require_can_assign_role on the backend: only an org_admin may create the management roles,
 * and system_admin is never assignable. Showing a role the server would refuse turns a clear rule into a confusing
 * error, so the list is filtered rather than the failure explained afterwards.
 */

const POLL_MS = 3_000;
const SITE_REQUIRED = ["site_manager", "supervisor"];
const SUPERVISOR = { key: "supervisor", label: "Supervisor" };
const MANAGEMENT = [
  { key: "site_manager", label: "Site manager" },
  { key: "operations_manager", label: "Operations manager" },
  { key: "org_admin", label: "Administrator" },
];
const ROLE_ICON: Record<string, keyof typeof import("@expo/vector-icons").Ionicons.glyphMap> = {
  supervisor: "eye-outline",
  site_manager: "business-outline",
  operations_manager: "briefcase-outline",
  org_admin: "shield-checkmark-outline",
};

export type AddMemberContext = {
  /** A token to act with; may refresh it first (an operator's organisation token lasts 15 minutes). */
  getToken: () => Promise<string>;
  staffRoles: StaffRole[];
  tableServiceEnabled: boolean;
  /** The actor is an org_admin (or acts as one), so the management roles are offered. */
  canAssignManagement: boolean;
  sites: Site[];
  /** Keys the recent roles and sites (person + organisation). */
  recentScope: string;
};

export function AddMemberFlow({
  ctx,
  header,
  onOpenApprovals,
}: {
  ctx: AddMemberContext;
  /** Above the form: an organisation banner or picker for an operator. */
  header?: ReactNode;
  /** A manager also has an Approvals tab; an operator approves here only. */
  onOpenApprovals?: () => void;
}) {
  useThemeVersion();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"role" | "site" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ staffUserId: string; name: string; roleLabel: string; siteName: string } | null>(
    null,
  );
  const [grant, setGrant] = useState<StaffGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const roleRecent = useRecentPicks("role", ctx.recentScope);
  const siteRecent = useRecentPicks("site", ctx.recentScope);

  const roleItems: PickerItem[] = useMemo(() => {
    const field = (ctx.staffRoles.length ? ctx.staffRoles : [{ key: "cleaner", label: "Cleaner", template: "standard" } as StaffRole])
      .filter((r) => r.template !== "table_service" || ctx.tableServiceEnabled)
      .map((r) => ({
        key: r.key,
        label: r.label,
        sub: r.template === "table_service" ? "Field staff · table service" : "Field staff",
        icon: (r.template === "table_service" ? "restaurant-outline" : "person-outline") as PickerItem["icon"],
        group: "Field staff",
      }));
    const supervising = [{ ...SUPERVISOR, sub: "Supervises a site", icon: ROLE_ICON.supervisor, group: "Supervising" }];
    const management = ctx.canAssignManagement
      ? MANAGEMENT.map((m) => ({ ...m, sub: "Management", icon: ROLE_ICON[m.key], group: "Management" }))
      : [];
    return [...field, ...supervising, ...management];
  }, [ctx.staffRoles, ctx.tableServiceEnabled, ctx.canAssignManagement]);

  const siteItems: PickerItem[] = useMemo(
    () =>
      ctx.sites
        .filter((s) => s.active !== false)
        .map((s) => ({ key: s.id, label: s.name, sub: s.address || undefined, icon: "location-outline" as const })),
    [ctx.sites],
  );

  const roleItem = roleItems.find((r) => r.key === role) ?? null;
  const siteItem = siteItems.find((s) => s.key === siteId) ?? null;
  const recentRoles = liveRecent(roleRecent.recent, roleItems, (r) => r.key);
  const recentSites = liveRecent(siteRecent.recent, siteItems, (s) => s.key);

  const nameOk = displayName.trim().length >= 2;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const needsSite = !!role && (SITE_REQUIRED.includes(role) || isFieldRole(role));
  const siteOk = !needsSite || !!siteId;
  const canSubmit = nameOk && emailOk && !!role && siteOk && !busy;

  const missing = [!nameOk && "their name", !emailOk && "an email", !role && "a role", role && !siteOk && "a site"].filter(
    Boolean,
  ) as string[];

  const pickRole = (key: string) => {
    setRole(key);
    roleRecent.remember(key);
  };
  const pickSite = (key: string) => {
    setSiteId(key);
    siteRecent.remember(key);
  };

  async function showCode(staffUserId: string, reopen = false) {
    const token = await ctx.getToken();
    if (reopen) await reopenStaffOnboardingCode(token, staffUserId);
    // Reveal first, then the image: revealing opens the 15-minute window the image endpoint checks.
    const revealed = await revealStaffOnboardingCode(token, staffUserId);
    setGrant(revealed);
    setQrSvg(await fetchStaffOnboardingQrSvg(token, staffUserId));
  }

  async function create() {
    if (!canSubmit || !role) return;
    setBusy(true);
    setError(null);
    try {
      const token = await ctx.getToken();
      const result = await createStaffOnboarding(token, {
        displayName: displayName.trim(),
        email: email.trim(),
        role,
        siteId,
      });
      setCreated({
        staffUserId: result.staffUserId,
        name: displayName.trim(),
        roleLabel: roleItem?.label ?? role,
        siteName: siteItem?.label ?? "",
      });
      await showCode(result.staffUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this person");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setCreated(null);
    setGrant(null);
    setQrSvg(null);
    setDisplayName("");
    setEmail("");
    setError(null);
  }

  if (created && grant && qrSvg) {
    return (
      <View style={styles.gap}>
        {header}
        <StepBar steps={["Details", "Show code", "Approve"]} current={grant.status === "approved" ? 2 : 1} />
        <Text style={styles.subtitle}>
          {created.name} · {created.roleLabel}
          {created.siteName ? ` · ${created.siteName}` : ""}
        </Text>
        <ScanPanel
          qrSvg={qrSvg}
          expiresAt={grant.status === "pending" ? grant.expiresAt : null}
          wordLabel="They should read this back"
          matchWord={grant.matchWord}
          steps={[
            { title: `${created.name.split(" ")[0]} opens Šoma360 and taps I'm new`, text: "Then scans this code" },
            { title: "They read the word back to you" },
            { title: "You approve", text: "Only if the word matches: a photographed code then can't be used by someone else" },
          ]}
        >
          <Approval
            staffUserId={created.staffUserId}
            name={created.name}
            grant={grant}
            ctx={ctx}
            onGrant={setGrant}
            onNewCode={() => showCode(created.staffUserId, true).catch((e) => setError(e instanceof Error ? e.message : "Could not show a new code"))}
          />
        </ScanPanel>
        {error && <ErrorNote text={error} />}
        <View style={styles.row2}>
          <PillButton label="Add someone else" variant="ghost" onPress={startOver} style={styles.flex} />
          {onOpenApprovals && grant.status !== "approved" ? (
            <PillButton label="Approvals" icon="shield-checkmark-outline" onPress={onOpenApprovals} style={styles.flex} />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      {header}
      <StepBar steps={["Details", "Show code", "Approve"]} current={0} />
      {(nameOk || roleItem) && (
        <SummaryCard
          initials={initialsOf(displayName)}
          title={displayName.trim() || "New team member"}
          sub={[roleItem?.label ?? "Choose a role", siteItem?.label].filter(Boolean).join(" · ")}
        />
      )}
      {error && <ErrorNote text={error} />}

      <View>
        <SectionLabel>Who</SectionLabel>
        <FormField
          icon="person-outline"
          label="Full name"
          value={displayName}
          onChangeText={setDisplayName}
          valid={nameOk}
          autoCapitalize="words"
          textContentType="name"
          returnKeyType="next"
        />
        <View style={styles.gapSm} />
        <FormField
          icon="mail-outline"
          label="Email address"
          value={email}
          onChangeText={setEmail}
          valid={emailOk}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <Hint>They sign in with this. It must not already be used anywhere on Šoma360.</Hint>
      </View>

      <View>
        <SectionLabel>Role</SectionLabel>
        <PickerRow
          label="Role"
          icon={roleItem?.icon ?? "person-outline"}
          value={roleItem?.label}
          sub={roleItem?.sub}
          placeholder="Choose a role"
          count={`${roleItems.length} roles`}
          onPress={() => setSheet("role")}
        />
        <RecentChips items={recentRoles} selected={role} onPick={pickRole} />
      </View>

      <View>
        <SectionLabel>Site{role && !needsSite ? " (optional)" : ""}</SectionLabel>
        {siteItems.length === 0 ? (
          <Hint>There are no sites to assign yet. Ask an administrator to add one, or to give you one.</Hint>
        ) : (
          <>
            <PickerRow
              label="Site"
              icon="location-outline"
              value={siteItem?.label}
              sub={siteItem?.sub}
              placeholder="Choose a site"
              count={`${siteItems.length} ${siteItems.length === 1 ? "site" : "sites"}`}
              onPress={() => setSheet("site")}
            />
            <RecentChips items={recentSites} selected={siteId} onPick={pickSite} />
          </>
        )}
      </View>

      <View style={styles.footer}>
        <PillButton
          label="Create and show QR code"
          icon="qr-code-outline"
          onPress={create}
          disabled={!canSubmit}
          busy={busy}
        />
        {missing.length > 0 && !busy && <MissingNote text={`Add ${listOf(missing)} to continue`} />}
      </View>

      <PickerSheet
        visible={sheet === "role"}
        title="Choose a role"
        searchPlaceholder="Search roles"
        items={roleItems}
        selected={role}
        recent={roleRecent.recent}
        filters={[
          { key: "field", label: "Field staff", test: (i) => i.group === "Field staff" },
          { key: "sup", label: "Supervising", test: (i) => i.group === "Supervising" },
          ...(ctx.canAssignManagement ? [{ key: "mgmt", label: "Management", test: (i: PickerItem) => i.group === "Management" }] : []),
        ]}
        noun="roles"
        emptyHint="Check the spelling. Roles are set up per organisation."
        onPick={pickRole}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "site"}
        title="Choose a site"
        searchPlaceholder="Search name or address"
        items={siteItems}
        selected={siteId}
        recent={siteRecent.recent}
        filters={recentSites.length ? [{ key: "recent", label: "Recent", test: (i) => siteRecent.recent.includes(i.key) }] : undefined}
        noun="sites"
        emptyHint="Check the spelling, or search by street or suburb."
        onPick={pickSite}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

/** "a role", "a role and a site", "their name, an email and a role". */
function listOf(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Watches the code and, once it has been scanned, lets the person who showed it approve on the spot. The Approvals
 * tab still works too; this just saves the trip.
 */
function Approval({
  staffUserId,
  name,
  grant,
  ctx,
  onGrant,
  onNewCode,
}: {
  staffUserId: string;
  name: string;
  grant: StaffGrant;
  ctx: AddMemberContext;
  onGrant: (g: StaffGrant) => void;
  onNewCode: () => void;
}) {
  useThemeVersion();
  const [busy, setBusy] = useState<"approve" | "reject" | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = grant.status === "approved" || grant.status === "rejected" || grant.status === "revoked";

  const poll = useCallback(async () => {
    try {
      const token = await ctx.getToken();
      const { grant: latest } = await getStaffOnboardingStatus(token, staffUserId);
      if (latest) onGrant(latest);
    } catch {
      // A missed poll is retried on the next tick.
    }
  }, [ctx, staffUserId, onGrant]);
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => void pollRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, [done]);

  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      const token = await ctx.getToken();
      if (approve) await approveStaffOnboarding(token, grant.id);
      else await rejectStaffOnboarding(token, grant.id, "The word did not match");
      const { grant: latest } = await getStaffOnboardingStatus(token, staffUserId);
      if (latest) onGrant(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that");
    } finally {
      setBusy(null);
    }
  };

  const first = name.split(" ")[0];
  if (grant.status === "approved") {
    return (
      <View style={[styles.approval, styles.approvalOk]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        <View style={styles.flex}>
          <Text style={styles.approvalTitle}>{first} is in</Text>
          <Text style={styles.approvalText}>They&apos;ll choose a password on their phone, then they can start.</Text>
        </View>
      </View>
    );
  }
  if (grant.status === "scanned") {
    return (
      <View style={styles.approval}>
        <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
        <View style={styles.flex}>
          <Text style={styles.approvalTitle}>{first} scanned the code</Text>
          <Text style={styles.approvalText}>
            {grant.deviceLabel ? `On ${grant.deviceLabel}. ` : ""}Approve only if they read back “{grant.matchWord}”.
          </Text>
          <View style={styles.row2}>
            <PillButton label="Not them" variant="danger" onPress={() => decide(false)} busy={busy === "reject"} disabled={!!busy} style={styles.flex} />
            <PillButton label="Approve" icon="checkmark" onPress={() => decide(true)} busy={busy === "approve"} disabled={!!busy} style={styles.flex} />
          </View>
          {error && <Text style={styles.approvalError}>{error}</Text>}
        </View>
      </View>
    );
  }
  const expired = grant.status === "pending" && !!grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now();
  if (grant.status === "rejected" || grant.status === "revoked" || expired) {
    return (
      <View style={styles.approval}>
        <Ionicons name="refresh-outline" size={22} color={colors.mutedForeground} />
        <View style={styles.flex}>
          <Text style={styles.approvalTitle}>
            {grant.status === "rejected" ? "That scan was turned down" : expired ? "The code ran out" : "The code was withdrawn"}
          </Text>
          <Text style={styles.approvalText}>Show {first} a new code when they&apos;re with you.</Text>
          <PillButton
            label="Show a new code"
            icon="qr-code-outline"
            busy={busy === "new"}
            onPress={() => {
              setBusy("new");
              Promise.resolve(onNewCode()).finally(() => setBusy(null));
            }}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    );
  }
  return null;
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    gap: { gap: spacing.md + 2 },
    gapSm: { height: spacing.sm + 2 },
    row2: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.sm },
    subtitle: { fontSize: typography.small + 1, color: colors.mutedForeground, marginTop: -spacing.sm },
    footer: { marginTop: spacing.xs },
    approval: {
      flexDirection: "row",
      gap: spacing.md,
      padding: spacing.md + 2,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    approvalOk: { borderColor: colors.success, backgroundColor: colors.successSoft },
    approvalTitle: { fontSize: typography.body + 1, fontWeight: "700", color: colors.foreground },
    approvalText: { fontSize: typography.small + 0.5, color: colors.mutedForeground, lineHeight: 17, marginTop: 2 },
    approvalError: { fontSize: typography.small, color: colors.destructive, marginTop: spacing.xs },
  }),
);
