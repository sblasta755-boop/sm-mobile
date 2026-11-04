import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { useSmartClean } from "@/features/store";
import { useRecentPicks } from "@/features/recentPicks";
import { liveRecent } from "@/domain/recentPicks";
import {
  fetchOnboardingQrSvg,
  impersonateOrganisation,
  listPlatformOrganisations,
  loadBackendBootstrap,
  provisionOrganisation,
  refreshImpersonation,
  revealOnboardingCode,
  type OnboardingGrant,
  type PlatformOrganisation,
} from "@/api/client";
import { AddMemberFlow, type AddMemberContext } from "@/components/AddMemberFlow";
import { PickerSheet, type PickerItem } from "@/components/PickerSheet";
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
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * The platform operator's Onboard tab: onboard a new organisation, or add a team member to one that already exists.
 *
 * Onboarding an organisation is three steps on one screen, because they happen in one sitting with the customer on
 * the phone: fill the form, show the code, then approve their scan in Approvals.
 *
 * Adding a team member acts inside the chosen organisation as its administrator, with the same short-lived token the
 * web console's "Enter" uses (POST /platform/organisations/{id}/impersonate). The organisation's audit trail records
 * every action under the operator's own name. The token lasts 15 minutes, so it is refreshed before it runs out; it is
 * never swapped for the operator's own session (see impersonationTokens in api/client.ts).
 */

const TIERS = [
  { value: "trial", label: "Trial" },
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
];
const CLOSED = ["suspended", "cancelled"];
/** Refresh an organisation token once it is this old (it lasts 15 minutes). */
const REFRESH_AFTER_MS = 10 * 60 * 1000;

type Mode = "choose" | "organisation" | "member";

function orgStatus(org: PlatformOrganisation) {
  return org.subscription?.status ?? "none";
}

function orgSub(org: PlatformOrganisation) {
  const plan = org.subscription?.tierLabel ?? org.subscription?.tier ?? "No plan";
  return `${plan} · ${org.userCount} ${org.userCount === 1 ? "user" : "users"}`;
}

export default function PlatformOnboard() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const [mode, setMode] = useState<Mode>("choose");
  const [orgs, setOrgs] = useState<PlatformOrganisation[]>([]);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [orgSheet, setOrgSheet] = useState(false);
  const orgRecent = useRecentPicks("organisation", currentUser?.id);

  // Every organisation, in pages of 100 (the most the list endpoint returns at once).
  const loadOrgs = useCallback(async () => {
    if (!state.accessToken) return;
    try {
      const first = await listPlatformOrganisations(state.accessToken, 1, 100);
      const all = [...first.items];
      for (let page = 2; all.length < first.total && page <= 20; page++) {
        const more = await listPlatformOrganisations(state.accessToken, page, 100);
        if (more.items.length === 0) break;
        all.push(...more.items);
      }
      setOrgs(all);
      setOrgsError(null);
    } catch (err) {
      setOrgsError(err instanceof Error ? err.message : "Could not load organisations");
    }
  }, [state.accessToken]);
  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  // Suspended and cancelled organisations are left out: nobody new should be joining one.
  const openOrgs = useMemo(() => orgs.filter((o) => !CLOSED.includes(orgStatus(o))), [orgs]);
  const orgItems: PickerItem[] = useMemo(
    () =>
      openOrgs.map((o) => ({
        key: o.id,
        label: o.name,
        sub: orgSub(o),
        icon: "business-outline" as const,
        tag: orgStatus(o) === "trialing" ? "Trial" : orgStatus(o) === "past_due" ? "Overdue" : undefined,
      })),
    [openOrgs],
  );
  const recentOrgs = liveRecent(orgRecent.recent, openOrgs, (o) => o.id);

  const [memberOrg, setMemberOrg] = useState<PlatformOrganisation | null>(null);
  const startMember = (orgId: string) => {
    const org = openOrgs.find((o) => o.id === orgId);
    if (!org) return;
    orgRecent.remember(org.id);
    setMemberOrg(org);
    setMode("member");
  };

  if (mode === "organisation") {
    return (
      <Screen title="Onboard an organisation">
        <BackToChoice onPress={() => setMode("choose")} />
        <OrganisationFlow onCreated={() => void loadOrgs()} />
      </Screen>
    );
  }

  if (mode === "member" && memberOrg) {
    return (
      <Screen title="Add a team member">
        <BackToChoice onPress={() => setMode("choose")} />
        <MemberInOrganisation
          key={memberOrg.id}
          org={memberOrg}
          operatorToken={state.accessToken}
          recentScope={`${currentUser?.id ?? "anon"}.${memberOrg.id}`}
          onChange={() => setOrgSheet(true)}
        />
        <OrgSheet visible={orgSheet} items={orgItems} selected={memberOrg.id} recent={orgRecent.recent} onPick={startMember} onClose={() => setOrgSheet(false)} />
      </Screen>
    );
  }

  return (
    <Screen title="Onboard">
      <Text style={styles.lead}>What would you like to do?</Text>

      <ChoiceCard
        hero
        icon="business-outline"
        title="Onboard an organisation"
        text="Create a new organisation and its first administrator. They join by scanning a code."
        tags={["New organisation", "Choose a plan"]}
        onPress={() => setMode("organisation")}
      />
      <ChoiceCard
        icon="person-add-outline"
        title="Add a team member"
        text="Add someone to an organisation that already exists, using its roles and sites."
        tags={["Existing organisation", "Any role"]}
        onPress={() => setOrgSheet(true)}
      />

      {orgsError && <ErrorNote text={orgsError} />}
      {recentOrgs.length > 0 && (
        <View style={styles.recentBlock}>
          <View style={styles.recentHead}>
            <SectionLabel>Add to a recent organisation</SectionLabel>
            <Pressable onPress={() => setOrgSheet(true)} hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          </View>
          {recentOrgs.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`Add a team member to ${o.name}`}
              onPress={() => startMember(o.id)}
              style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
            >
              <View style={styles.quickAvatar}>
                <Text style={styles.quickInitials}>{initialsOf(o.name)}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.quickName} numberOfLines={1}>
                  {o.name}
                </Text>
                <Text style={styles.quickSub} numberOfLines={1}>
                  {orgSub(o)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      )}

      <OrgSheet visible={orgSheet} items={orgItems} recent={orgRecent.recent} onPick={startMember} onClose={() => setOrgSheet(false)} />
    </Screen>
  );
}

function OrgSheet({
  visible,
  items,
  selected,
  recent,
  onPick,
  onClose,
}: {
  visible: boolean;
  items: PickerItem[];
  selected?: string;
  recent: string[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <PickerSheet
      visible={visible}
      title="Add to which organisation?"
      searchPlaceholder="Search organisations"
      items={items}
      selected={selected}
      recent={recent}
      filters={[
        { key: "active", label: "Active", test: (i) => !i.tag },
        { key: "trial", label: "Trial", test: (i) => i.tag === "Trial" },
      ]}
      noun="organisations"
      emptyHint="Check the spelling. Suspended organisations are left out."
      onPick={onPick}
      onClose={onClose}
    />
  );
}

function BackToChoice({ onPress }: { onPress: () => void }) {
  useThemeVersion();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.back}>
      <Ionicons name="arrow-back" size={16} color={colors.primary} />
      <Text style={styles.link}>Onboard</Text>
    </Pressable>
  );
}

function ChoiceCard({
  icon,
  title,
  text,
  tags,
  hero,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  tags: string[];
  hero?: boolean;
  onPress: () => void;
}) {
  useThemeVersion();
  const fg = hero ? colors.shiftForeground : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, hero && styles.choiceHero, pressed && styles.pressed]}
    >
      {hero && <View pointerEvents="none" style={styles.choiceRing} />}
      <View style={styles.choiceTop}>
        <View style={[styles.choiceIcon, hero && styles.choiceIconHero]}>
          <Ionicons name={icon} size={24} color={hero ? colors.shiftForeground : colors.primary} />
        </View>
        <View style={[styles.choiceGo, hero && styles.choiceGoHero]}>
          <Ionicons name="arrow-forward" size={16} color={fg} />
        </View>
      </View>
      <Text style={[styles.choiceTitle, { color: fg }]}>{title}</Text>
      <Text style={[styles.choiceText, hero && styles.choiceTextHero]}>{text}</Text>
      <View style={styles.choiceTags}>
        {tags.map((t) => (
          <Text key={t} style={[styles.choiceTag, hero && styles.choiceTagHero]}>
            {t}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

/** Acts inside `org` as its administrator, with a token that is refreshed before it lapses. */
function MemberInOrganisation({
  org,
  operatorToken,
  recentScope,
  onChange,
}: {
  org: PlatformOrganisation;
  operatorToken: string | null;
  recentScope: string;
  onChange: () => void;
}) {
  useThemeVersion();
  const [ctx, setCtx] = useState<AddMemberContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<{ value: string; at: number } | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setCtx(null);
    if (!operatorToken) {
      setError("You are signed out. Sign in again.");
      return;
    }
    try {
      const session = await impersonateOrganisation(operatorToken, org.id);
      token.current = { value: session.accessToken, at: Date.now() };
      const getToken = async () => {
        const t = token.current;
        if (!t) throw new Error("Choose the organisation again.");
        if (Date.now() - t.at > REFRESH_AFTER_MS) {
          const fresh = await refreshImpersonation(t.value);
          token.current = { value: fresh.accessToken, at: Date.now() };
        }
        return token.current!.value;
      };
      // The organisation's own roles, sites and settings, as its administrator sees them.
      const bootstrap = await loadBackendBootstrap(session.accessToken);
      setCtx({
        getToken,
        staffRoles: bootstrap.staffRoles ?? [],
        tableServiceEnabled: !!bootstrap.tenants?.[0]?.tableServiceEnabled,
        canAssignManagement: true,
        sites: bootstrap.sites ?? [],
        recentScope,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not open ${org.name}`);
    }
  }, [operatorToken, org.id, org.name, recentScope]);

  useEffect(() => {
    void start();
  }, [start]);

  const banner = (
    <View style={styles.orgBar}>
      <View style={styles.orgAvatar}>
        <Text style={styles.orgInitials}>{initialsOf(org.name)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.orgTitle} numberOfLines={1}>
          Adding to {org.name}
        </Text>
        <Text style={styles.orgText}>As its administrator. Recorded under your own name in its audit trail.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Change organisation" onPress={onChange} hitSlop={8}>
        <Text style={styles.orgChange}>Change</Text>
      </Pressable>
    </View>
  );

  if (error) {
    return (
      <View style={styles.gap}>
        {banner}
        <ErrorNote text={error} />
        <PillButton label="Try again" icon="refresh" onPress={() => void start()} />
      </View>
    );
  }
  if (!ctx) {
    return (
      <View style={styles.gap}>
        {banner}
        <Hint>Opening {org.name}…</Hint>
      </View>
    );
  }
  return <AddMemberFlow ctx={ctx} header={banner} />;
}

/** Create an organisation and hand its administrator a QR code. */
function OrganisationFlow({ onCreated }: { onCreated: () => void }) {
  useThemeVersion();
  const { state } = useSmartClean();
  const [organisationName, setOrganisationName] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tier, setTier] = useState("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [grant, setGrant] = useState<OnboardingGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  // Mirrors the backend's own validation rather than trusting the 422; a disabled button says what is missing.
  const orgOk = organisationName.trim().length >= 2;
  const nameOk = adminDisplayName.trim().length >= 2;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim());
  const canSubmit = orgOk && nameOk && emailOk && !busy;
  const missing = [!orgOk && "the organisation's name", !nameOk && "its administrator's name", !emailOk && "their email"].filter(
    Boolean,
  ) as string[];
  const tierLabel = TIERS.find((t) => t.value === tier)?.label ?? tier;

  async function create() {
    if (!canSubmit || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const org = await provisionOrganisation(state.accessToken, {
        organisationName: organisationName.trim(),
        adminDisplayName: adminDisplayName.trim(),
        adminEmail: adminEmail.trim(),
        tier,
        // The whole point of this screen: no invite email, a QR instead.
        deliveryMethod: "qr",
      });
      setCreated({ id: org.id, name: org.name });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the organisation");
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!created || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      // Reveal first, THEN fetch the image: the window opens here, and the render endpoint refuses a grant that
      // isn't live.
      const revealed = await revealOnboardingCode(state.accessToken, created.id);
      setGrant(revealed);
      setQrSvg(await fetchOnboardingQrSvg(state.accessToken, created.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not show the code");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setCreated(null);
    setGrant(null);
    setQrSvg(null);
    setOrganisationName("");
    setAdminDisplayName("");
    setAdminEmail("");
    setError(null);
  }

  const steps = ["Organisation", "Show code", "Approve"];
  const first = adminDisplayName.trim().split(" ")[0] || "Their administrator";

  if (created && grant && qrSvg) {
    return (
      <View style={styles.gap}>
        <StepBar steps={steps} current={1} />
        <Text style={styles.subtitle}>
          {created.name} · {adminDisplayName.trim()}
        </Text>
        <ScanPanel
          qrSvg={qrSvg}
          expiresAt={grant.expiresAt}
          extra={`attempt ${grant.attempt}`}
          wordLabel="Check this word with them"
          matchWord={grant.matchWord}
          steps={[
            { title: `${first} opens Šoma360 and taps I'm new`, text: "Then Setting up an organisation, and scans" },
            { title: "They read the word back to you" },
            { title: "You approve in Approvals", text: "Only if it matches: a forwarded screenshot then can't work" },
          ]}
        />
        {error && <ErrorNote text={error} />}
        <View style={styles.row2}>
          <PillButton label="Done" variant="ghost" onPress={startOver} style={styles.flex} />
          <PillButton label="Approvals" icon="shield-checkmark-outline" onPress={() => router.push("/platform-approvals")} style={styles.flex} />
        </View>
      </View>
    );
  }

  if (created) {
    return (
      <View style={styles.gap}>
        <StepBar steps={steps} current={1} />
        <View style={styles.ready}>
          <View style={styles.readyRing}>
            <View style={styles.readyDot}>
              <Ionicons name="checkmark" size={34} color={colors.white} />
            </View>
          </View>
          <Text style={styles.readyTitle}>{created.name} is ready</Text>
          <Text style={styles.readySub}>
            {adminDisplayName.trim()} · {adminEmail.trim()} · {tierLabel}
          </Text>
        </View>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warningForeground} />
          <Text style={styles.noteText}>
            No invite email was sent. Show the code when you have their administrator on the phone. It stays scannable
            for 15 minutes from when you tap below.
          </Text>
        </View>
        {error && <ErrorNote text={error} />}
        <PillButton label="Show the QR code" icon="qr-code-outline" onPress={reveal} busy={busy} />
        <PillButton label="Onboard someone else" variant="ghost" onPress={startOver} />
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <StepBar steps={steps} current={0} />
      {(orgOk || nameOk) && (
        <SummaryCard
          square
          initials={initialsOf(organisationName)}
          title={organisationName.trim() || "New organisation"}
          sub={[adminDisplayName.trim() || "Its administrator", `${tierLabel} plan`].join(" · ")}
        />
      )}
      {error && <ErrorNote text={error} />}

      <View>
        <SectionLabel>Organisation</SectionLabel>
        <FormField icon="business-outline" label="Organisation name" value={organisationName} onChangeText={setOrganisationName} valid={orgOk} autoCapitalize="words" />
      </View>

      <View>
        <SectionLabel>Its first administrator</SectionLabel>
        <FormField icon="person-outline" label="Administrator name" value={adminDisplayName} onChangeText={setAdminDisplayName} valid={nameOk} autoCapitalize="words" textContentType="name" />
        <View style={styles.gapSm} />
        <FormField
          icon="mail-outline"
          label="Administrator email"
          value={adminEmail}
          onChangeText={setAdminEmail}
          valid={emailOk}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <Hint>What they sign in with. It must not already be used anywhere on Šoma360.</Hint>
      </View>

      <View>
        <SectionLabel>Plan</SectionLabel>
        <View style={styles.plans}>
          {TIERS.map((t) => {
            const on = t.value === tier;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setTier(t.value)}
                style={[styles.plan, on && styles.planOn]}
              >
                <Text style={[styles.planText, on && styles.planTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <PillButton label="Create organisation" icon="business-outline" onPress={create} disabled={!canSubmit} busy={busy} />
        {missing.length > 0 && !busy && (
          <MissingNote text={`Add ${missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`} to continue`} />
        )}
      </View>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.88 },
    gap: { gap: spacing.md + 2 },
    gapSm: { height: spacing.sm + 2 },
    row2: { flexDirection: "row", gap: spacing.sm + 2 },
    lead: { fontSize: typography.body, color: colors.mutedForeground, marginBottom: spacing.md, marginTop: -spacing.xs },
    link: { fontSize: typography.small + 1, fontWeight: "700", color: colors.primary },
    back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: spacing.md },
    subtitle: { fontSize: typography.small + 1, color: colors.mutedForeground, marginTop: -spacing.sm },

    choice: {
      gap: spacing.sm + 2,
      padding: spacing.lg + 2,
      marginBottom: spacing.md,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    choiceHero: { backgroundColor: colors.shiftBackground, borderColor: "transparent" },
    choiceRing: {
      position: "absolute",
      right: -60,
      bottom: -80,
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
    },
    choiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    choiceIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    choiceIconHero: { backgroundColor: "rgba(255,255,255,0.12)" },
    choiceGo: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    choiceGoHero: { backgroundColor: "rgba(255,255,255,0.14)" },
    choiceTitle: { fontSize: typography.h2 + 1, fontWeight: "800" },
    choiceText: { fontSize: typography.small + 1, lineHeight: 19, color: colors.mutedForeground },
    choiceTextHero: { color: colors.shiftForeground, opacity: 0.72 },
    choiceTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    choiceTag: {
      fontSize: typography.tiny + 1.5,
      fontWeight: "600",
      color: colors.mutedForeground,
      backgroundColor: colors.secondary,
      borderRadius: radius.round,
      paddingHorizontal: 9,
      paddingVertical: 4,
      overflow: "hidden",
    },
    choiceTagHero: { color: colors.shiftForeground, backgroundColor: "rgba(255,255,255,0.12)" },

    recentBlock: { marginTop: spacing.sm },
    recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    quick: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border },
    quickAvatar: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
    quickInitials: { fontSize: typography.small, fontWeight: "800", color: colors.primary },
    quickName: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    quickSub: { fontSize: typography.small - 0.5, color: colors.mutedForeground },

    orgBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: 18,
      backgroundColor: colors.warningSoft,
    },
    orgAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    orgInitials: { fontSize: typography.small + 1, fontWeight: "800", color: colors.primaryForeground },
    orgTitle: { fontSize: typography.body, fontWeight: "700", color: colors.warningForeground },
    orgText: { fontSize: typography.small - 0.5, lineHeight: 15, color: colors.warningForeground, opacity: 0.85 },
    orgChange: { fontSize: typography.small + 0.5, fontWeight: "700", color: colors.warningForeground, textDecorationLine: "underline" },

    plans: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm + 2 },
    plan: {
      flexBasis: "47%",
      flexGrow: 1,
      height: 52,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    planOn: { borderColor: colors.primary, backgroundColor: colors.accent },
    planText: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    planTextOn: { color: colors.primary },

    ready: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
    readyRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
    readyDot: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
    readyTitle: { fontSize: typography.title, fontWeight: "800", color: colors.foreground, textAlign: "center", marginTop: spacing.sm },
    readySub: { fontSize: typography.small + 1, color: colors.mutedForeground, textAlign: "center" },
    note: {
      flexDirection: "row",
      gap: spacing.sm + 2,
      alignItems: "flex-start",
      padding: spacing.md,
      borderRadius: 16,
      backgroundColor: colors.warningSoft,
    },
    noteText: { flex: 1, fontSize: typography.small + 0.5, lineHeight: 18, color: colors.warningForeground },
  }),
);
