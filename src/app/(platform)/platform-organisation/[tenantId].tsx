import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { PlatformSiteNavigator } from "@/components/PlatformSiteNavigator";
import { getCurrentCoords } from "@/services/geolocation";
import { useSmartClean } from "@/features/store";
import {
  fetchOnboardingQrSvg,
  getOnboardingStatus,
  getPlatformOrganisation,
  listPlatformSites,
  reopenOnboardingCode,
  revealOnboardingCode,
  revokeOnboardingCode,
  setPlatformOrganisationState,
  type OnboardingGrant,
  type PlatformOrganisation,
  type PlatformSite,
} from "@/api/client";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import type { StatusTone } from "@/theme";
import { appAlert } from "@/components/Dialog";

const STATUS_TONE: Record<string, StatusTone> = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  suspended: "destructive",
  cancelled: "destructive",
};

/** Plain-language state of the onboarding handshake, for an operator who
 * did not necessarily issue the code themselves. */
function grantSummary(grant: OnboardingGrant): { tone: StatusTone; label: string; detail: string } {
  switch (grant.status) {
    case "pending":
      return grant.isLive
        ? { tone: "info", label: "Code live", detail: "Waiting for them to scan." }
        : {
            tone: "muted",
            label: "Not shown yet",
            detail: "The code becomes scannable when you show it.",
          };
    case "scanned":
      return {
        tone: "warning",
        label: "Waiting on you",
        detail: "Someone scanned it. Decide in the Approvals tab.",
      };
    case "approved":
      return grant.collectedAt
        ? { tone: "success", label: "Onboarded", detail: "They're in and have set a password." }
        : { tone: "info", label: "Approved", detail: "Waiting for their device to pick it up." };
    case "rejected":
      return {
        tone: "destructive",
        label: "Rejected",
        detail: grant.rejectedReason ?? "Issue a new code to try again.",
      };
    case "revoked":
      return { tone: "muted", label: "Withdrawn", detail: "Issue a new code to try again." };
    default:
      return { tone: "neutral", label: grant.status, detail: "" };
  }
}

export default function PlatformOrganisationDetail() {
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const { state } = useSmartClean();
  const [organisation, setOrganisation] = useState<PlatformOrganisation | null>(null);
  const [grant, setGrant] = useState<OnboardingGrant | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<PlatformSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  // Which site (if any) the full-screen live navigator is currently
  // driving to - null means the Sites section's own buttons show
  // instead of the navigator overlay. See PlatformSiteNavigator.
  const [navigatingSite, setNavigatingSite] = useState<PlatformSite | null>(null);
  const [openingDirections, setOpeningDirections] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.accessToken || !tenantId) return;
    setError(null);
    try {
      const [org, onboarding] = await Promise.all([
        getPlatformOrganisation(state.accessToken, tenantId),
        getOnboardingStatus(state.accessToken, tenantId),
      ]);
      setOrganisation(org);
      setGrant(onboarding.grant);
      // Drop any previously rendered image when the code is no longer
      // live, so a spent code can't linger on screen looking scannable.
      if (!onboarding.grant?.isLive) setQrSvg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the organisation");
    } finally {
      setLoading(false);
    }
  }, [state.accessToken, tenantId]);

  useEffect(() => {
    if (!state.accessToken) return;
    let cancelled = false;
    setSitesLoading(true);
    // Global endpoint (every organisation's sites in one list) - the
    // same one the web console's Sites tab uses - filtered down to this
    // tenant client-side. No per-tenant route exists server-side; see
    // PlatformController.list_all_sites.
    listPlatformSites(state.accessToken)
      .then((all) => {
        if (!cancelled) setSites(all.filter((s) => s.tenantId === tenantId));
      })
      .catch(() => {
        // Best-effort - the rest of the screen (subscription, onboarding)
        // is still useful without the Sites section.
      })
      .finally(() => {
        if (!cancelled) setSitesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.accessToken, tenantId]);

  async function openDirections(site: PlatformSite) {
    setOpeningDirections(site.id);
    try {
      const coords = await getCurrentCoords();
      const destination = `${site.latitude},${site.longitude}`;
      const url = coords
        ? `https://www.google.com/maps/dir/?api=1&origin=${coords.latitude},${coords.longitude}&destination=${destination}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
      await Linking.openURL(url);
    } catch {
      appAlert("Couldn't open maps", "Please try again.");
    } finally {
      setOpeningDirections(null);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      appAlert(failure, err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function showCode() {
    if (!state.accessToken || !tenantId) return;
    await run(async () => {
      await revealOnboardingCode(state.accessToken!, tenantId);
      setQrSvg(await fetchOnboardingQrSvg(state.accessToken!, tenantId));
    }, "Could not show the code");
  }

  const status = organisation?.subscription?.status ?? "none";
  const suspended = status === "suspended" || status === "cancelled";

  if (loading) {
    return (
      <Screen title="Organisation">
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen title={organisation?.name ?? "Organisation"} backTo="/platform-organisations">
      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <Card style={styles.section}>
        <View style={styles.headerRow}>
          <StatusBadge
            tone={STATUS_TONE[status] ?? "neutral"}
            label={status.replace(/_/g, " ")}
          />
          {organisation?.subscription && (
            <Text style={styles.tier}>
              {organisation.subscription.tierLabel ?? organisation.subscription.tier}
            </Text>
          )}
        </View>
        <Row label="Users" value={String(organisation?.userCount ?? 0)} />
        <Row
          label="Seats"
          value={
            organisation?.subscription?.seats
              ? String(organisation.subscription.seats)
              : "Unlimited"
          }
        />
        <Row label="Billing email" value={organisation?.subscription?.billingEmail ?? "-"} />
      </Card>

      {grant && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Onboarding</Text>
          {(() => {
            const summary = grantSummary(grant);
            return (
              <>
                <View style={styles.headerRow}>
                  <StatusBadge tone={summary.tone} label={summary.label} />
                  <Text style={styles.muted}>Attempt {grant.attempt}</Text>
                </View>
                <Text style={styles.muted}>{summary.detail}</Text>
              </>
            );
          })()}

          {qrSvg && grant.isLive && (
            <View style={styles.qrWrap}>
              <SvgXml xml={qrSvg} width="100%" height={240} />
              <Text style={styles.matchLabel}>They should say</Text>
              <Text style={styles.matchWord}>{grant.matchWord ?? "-"}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {grant.status === "pending" && (
              <Button loading={busy} onPress={() => showCode()} style={styles.action}>
                {grant.isLive ? "Show again" : "Show the code"}
              </Button>
            )}
            {grant.status !== "approved" && (
              <Button
                variant="outline"
                loading={busy}
                onPress={() =>
                  void run(
                    () => reopenOnboardingCode(state.accessToken!, tenantId!),
                    "Could not reissue",
                  )
                }
                style={styles.action}
              >
                Issue a new code
              </Button>
            )}
            {grant.status === "pending" && grant.isLive && (
              <Button
                variant="ghost"
                loading={busy}
                onPress={() =>
                  void run(
                    () => revokeOnboardingCode(state.accessToken!, tenantId!),
                    "Could not withdraw",
                  )
                }
              >
                Withdraw
              </Button>
            )}
          </View>
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Sites</Text>
        {sitesLoading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : sites.length === 0 ? (
          <Text style={styles.muted}>
            No sites with a set location yet - add a geofence to a site for it to appear here.
          </Text>
        ) : (
          <View style={styles.siteList}>
            {sites.map((site) => (
              <View key={site.id} style={styles.siteRow}>
                <View style={styles.siteInfo}>
                  <Text style={styles.siteName} numberOfLines={1}>
                    {site.name}
                  </Text>
                  {site.address ? (
                    <Text style={styles.muted} numberOfLines={1}>
                      {site.address}
                    </Text>
                  ) : null}
                  {!site.active && <StatusBadge tone="destructive" label="Inactive" />}
                </View>
                <View style={styles.siteActions}>
                  <Pressable
                    style={styles.siteIconButton}
                    onPress={() => openDirections(site)}
                    disabled={openingDirections === site.id}
                    accessibilityLabel={`Get directions to ${site.name}`}
                  >
                    <Ionicons
                      name="navigate-outline"
                      size={18}
                      color={openingDirections === site.id ? colors.mutedForeground : colors.foreground}
                    />
                  </Pressable>
                  <Pressable
                    style={[styles.siteIconButton, styles.siteIconButtonPrimary]}
                    onPress={() => setNavigatingSite(site)}
                    accessibilityLabel={`Start navigation to ${site.name}`}
                  >
                    <Ionicons name="play" size={16} color={colors.primaryForeground} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        {sites.length > 0 && (
          <Text style={styles.siteLegend}>
            <Ionicons name="navigate-outline" size={11} /> opens your phone&apos;s maps app ·{" "}
            <Ionicons name="play" size={11} /> starts live navigation in Šoma360
          </Text>
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.muted}>
          {suspended
            ? "Everyone at this organisation is blocked from the app, except signing in."
            : "Suspending blocks every user immediately. Reversible at any time."}
        </Text>
        <Button
          variant={suspended ? "primary" : "outline"}
          loading={busy}
          onPress={() =>
            void run(
              () =>
                setPlatformOrganisationState(
                  state.accessToken!,
                  tenantId!,
                  suspended ? "reactivate" : "suspend",
                ),
              suspended ? "Could not reactivate" : "Could not suspend",
            )
          }
        >
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </Card>

      <Modal
        visible={navigatingSite != null}
        animationType="slide"
        onRequestClose={() => setNavigatingSite(null)}
      >
        {navigatingSite && (
          <PlatformSiteNavigator site={navigatingSite} onClose={() => setNavigatingSite(null)} />
        )}
      </Modal>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  siteList: {
    gap: spacing.sm,
  },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  siteInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  siteName: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  siteActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  siteIconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  siteIconButtonPrimary: {
    backgroundColor: colors.primary,
  },
  siteLegend: {
    marginTop: spacing.xs,
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  section: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tier: {
    fontSize: typography.small,
    fontWeight: "700",
    color: colors.foreground,
    textTransform: "capitalize",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowValue: {
    fontSize: typography.body,
    fontWeight: "600",
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
  actions: {
    gap: spacing.sm,
  },
  action: {
    flex: 1,
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
}));
