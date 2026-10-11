import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import {
  fetchOnboardingQrSvg,
  provisionOrganisation,
  revealOnboardingCode,
  type OnboardingGrant,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

const TIERS = ["trial", "starter", "professional", "enterprise"] as const;

/**
 * Create an organisation and hand its administrator a QR code.
 *
 * Three steps on one screen, because they happen in one sitting with the
 * customer on the phone: fill the form, show the code, then watch the
 * Approvals tab for their scan. Splitting them across routes would mean
 * an operator losing their place mid-call.
 */
export default function PlatformOnboard() {
  const { state } = useSmartClean();
  const [organisationName, setOrganisationName] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tier, setTier] = useState<string>("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [grant, setGrant] = useState<OnboardingGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  // Mirrors the backend's own validation rather than trusting the 422 -
  // a disabled button explains itself.
  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim());
  const canSubmit =
    organisationName.trim().length >= 2 &&
    adminDisplayName.trim().length >= 2 &&
    emailLooksValid &&
    !busy;

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
      // Reveal first, THEN fetch the image: the window opens here, and
      // the render endpoint refuses a grant that isn't live.
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

  return (
    <Screen title="Onboard an organisation">
      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {!created ? (
        <Card style={styles.form}>
          <Field
            label="Organisation name"
            value={organisationName}
            onChangeText={setOrganisationName}
            placeholder="Acme Cleaning"
          />
          <Field
            label="Administrator name"
            value={adminDisplayName}
            onChangeText={setAdminDisplayName}
            placeholder="Ada Admin"
          />
          <Field
            label="Administrator email"
            value={adminEmail}
            onChangeText={setAdminEmail}
            placeholder="ada@acme.co.za"
            keyboardType="email-address"
          />
          <Text style={styles.hint}>
            Must be unused across the whole platform - it&apos;s what they sign in with.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Plan</Text>
            <View style={styles.tierRow}>
              {TIERS.map((value) => {
                const selected = tier === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${value} plan`}
                    onPress={() => setTier(value)}
                    style={({ pressed }) => [
                      styles.tierChip,
                      selected && styles.tierChipActive,
                      pressed && !selected && styles.tierChipPressed,
                    ]}
                  >
                    <Text
                      style={[styles.tierChipText, selected && styles.tierChipTextActive]}
                      numberOfLines={1}
                      // "Professional" is twice the length of "Trial", so at
                      // equal widths it is the one that would clip. Shrinking
                      // just that label keeps every chip the same size
                      // instead of letting the longest word set the row.
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button onPress={create} disabled={!canSubmit} loading={busy}>
            Create organisation
          </Button>
        </Card>
      ) : !grant || !qrSvg ? (
        <Card style={styles.form}>
          <Text style={styles.createdTitle}>{created.name} is ready</Text>
          <Text style={styles.muted}>
            No invite email was sent. Show the code when you have their administrator on
            the phone - it stays scannable for 15 minutes from the moment you tap below.
          </Text>
          <Button onPress={reveal} loading={busy}>
            Show the QR code
          </Button>
          <Button variant="ghost" onPress={startOver}>
            Onboard someone else
          </Button>
        </Card>
      ) : (
        <>
          <Card style={styles.qrCard}>
            <SvgXml xml={qrSvg} width="100%" height={260} />
          </Card>

          <Card style={styles.matchCard}>
            <Text style={styles.label}>Check this word with them</Text>
            <Text style={styles.matchWord}>{grant.matchWord ?? "-"}</Text>
            <Text style={styles.muted}>
              After they scan, the Approvals tab will show a word. Only approve if it
              matches what they read back to you - that&apos;s what stops a forwarded
              screenshot from working.
            </Text>
          </Card>

          <Card style={styles.form}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.muted}>
                Attempt {grant.attempt} · one scan only
              </Text>
            </View>
            <Button variant="ghost" onPress={startOver}>
              Done
            </Button>
          </Card>
        </>
      )}
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

const styles = themedStyles(() => StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
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
  },
  tierRow: {
    flexDirection: "row",
    // No wrap: four chips share one row at equal widths. Wrapping would
    // drop a lone chip onto a second line at narrow widths, which reads
    // as a mistake rather than as a layout.
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  tierChip: {
    // Equal shares of the row rather than width-by-label-length, which
    // made "Professional" nearly twice "Trial" and left the row looking
    // accidental. flexBasis 0 so the text doesn't influence the split.
    flex: 1,
    flexBasis: 0,
    minHeight: 44, // a real tap target, not just text plus padding
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tierChipPressed: {
    backgroundColor: colors.secondary,
  },
  tierChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tierChipText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "capitalize",
  },
  tierChipTextActive: {
    color: colors.primaryForeground,
    fontWeight: "700",
  },
  createdTitle: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  qrCard: {
    alignItems: "center",
    justifyContent: "center",
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
}));
