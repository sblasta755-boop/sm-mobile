import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import {
  createStaffOnboarding,
  fetchStaffOnboardingQrSvg,
  revealStaffOnboardingCode,
  type StaffGrant,
} from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Create a team member's account and hand them a QR code to scan.
 *
 * The roles offered mirror _require_can_assign_role on the backend
 * exactly: only an org_admin may create another org_admin, and
 * system_admin is not assignable from inside a customer tenant by
 * anyone. Showing a role here that the server would refuse turns a clear
 * rule into a confusing error, so the list is filtered rather than the
 * failure explained afterwards.
 */
const FIELD_ROLES = [
  { value: "cleaner", label: "Cleaner" },
  { value: "supervisor", label: "Supervisor" },
];

const ADMIN_ROLES = [
  ...FIELD_ROLES,
  { value: "site_manager", label: "Site manager" },
  { value: "operations_manager", label: "Operations manager" },
  { value: "org_admin", label: "Administrator" },
];

// Roles the backend refuses without a site, because is_site_scoped
// filters their every list endpoint down to profile.siteIds - one
// created site-less signs in to an app that correctly shows nothing.
const SITE_REQUIRED = ["site_manager", "supervisor", "cleaner"];

export default function ManageAddStaff() {
  const { state, currentUser } = useSmartClean();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cleaner");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState<StaffGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const roles = currentUser?.role === "org_admin" ? ADMIN_ROLES : FIELD_ROLES;
  // A site-scoped manager may only place staff at their own sites - the
  // server enforces it, this just avoids offering the refusal.
  const sites =
    (currentUser?.siteIds?.length ?? 0) > 0
      ? state.sites.filter((s) => currentUser?.siteIds.includes(s.id))
      : state.sites;

  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const siteSatisfied = !SITE_REQUIRED.includes(role) || !!siteId;
  const canSubmit =
    displayName.trim().length >= 2 && emailLooksValid && siteSatisfied && !busy;

  async function create() {
    if (!canSubmit || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createStaffOnboarding(state.accessToken, {
        displayName: displayName.trim(),
        email: email.trim(),
        role,
        siteId,
      });
      // Reveal immediately: unlike organisation onboarding, where the
      // operator may show the code days later on a scheduled call, the
      // new starter is standing right here.
      const revealed = await revealStaffOnboardingCode(
        state.accessToken,
        created.staffUserId,
      );
      setGrant(revealed);
      setQrSvg(await fetchStaffOnboardingQrSvg(state.accessToken, created.staffUserId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this person");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setGrant(null);
    setQrSvg(null);
    setDisplayName("");
    setEmail("");
    setSiteId(null);
    setError(null);
  }

  if (grant && qrSvg) {
    return (
      <Screen title="Ready to scan">
        <Card style={styles.qrCard}>
          <SvgXml xml={qrSvg} width="100%" height={250} />
        </Card>

        <Card style={styles.matchCard}>
          <Text style={styles.label}>They should read this back to you</Text>
          <Text style={styles.matchWord}>{grant.matchWord ?? "—"}</Text>
          <Text style={styles.muted}>
            Once they scan, this appears in Approvals. Only approve if the word matches
            — that&apos;s what stops a photographed code being used by someone else.
          </Text>
        </Card>

        <Card style={styles.summaryCard}>
          <Text style={styles.summaryName}>{grant.staffName}</Text>
          <Text style={styles.muted}>
            {grant.role?.replace(/_/g, " ")}
            {grant.siteName ? ` · ${grant.siteName}` : ""}
          </Text>
          <Text style={styles.muted}>Code is valid for 15 minutes, one scan only.</Text>
        </Card>

        <Button variant="outline" onPress={startOver}>
          Add someone else
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Add a team member">
      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <Card style={styles.form}>
        <Field label="Full name" value={displayName} onChangeText={setDisplayName} placeholder="Nomsa Dlamini" />
        <Field
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="nomsa@example.co.za"
          keyboardType="email-address"
        />
        <Text style={styles.hint}>
          Used to sign in, and where their confirmation goes. Must be unused across the
          whole platform.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.chipRow}>
            {roles.map((option) => {
              const selected = role === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setRole(option.value)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Site{SITE_REQUIRED.includes(role) ? "" : " (optional)"}
          </Text>
          {sites.length === 0 ? (
            <Text style={styles.hint}>
              You have no sites to assign. Ask your administrator to assign you one
              first.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {sites.map((site) => {
                const selected = siteId === site.id;
                return (
                  <Pressable
                    key={site.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setSiteId(selected ? null : site.id)}
                    style={[styles.chip, selected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                      {site.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Button onPress={create} disabled={!canSubmit} loading={busy}>
          Create and show QR code
        </Button>
      </Card>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  hint: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
    marginTop: -spacing.xs,
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  qrCard: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  matchCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  matchWord: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  summaryCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  summaryName: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 19,
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
