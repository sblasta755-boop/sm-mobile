import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { SelectField } from "@/components/SelectField";
import { useCanManageSiteLayout } from "@/features/roles";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Entry point for the mobile site-layout flows: photo-of-a-paper-plan
 * and manual sketch (see photo-backdrop.tsx and sketch.tsx). True AR
 * room scanning (RoomPlan, iOS-only) is a separate, larger piece not
 * built yet - this screen is deliberately scoped to what exists today.
 *
 * Gated on both a role (management, not field-ops - see
 * useCanManageSiteLayout) and the Enterprise-only "site_layout" module.
 * Both checks fail open before their data lands (role: no currentUser
 * yet; module: empty module set) rather than flashing a locked state
 * during a cold start - the server enforces either way.
 */
export default function SiteLayoutIndexScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state } = useSmartClean();
  const canManage = useCanManageSiteLayout();
  const hasSiteLayout = useHasModule("site_layout");
  const sites = useMemo(
    () => state.sites.filter((site) => (site.profile?.floors?.length ?? 0) > 0),
    [state.sites],
  );
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id ?? "");
  const site = sites.find((s) => s.id === selectedSiteId) ?? sites[0];
  const floors = site?.profile?.floors ?? [];

  if (!canManage) {
    return (
      <Screen title="Site layout">
        <Card>
          <Text style={styles.emptyText}>
            Site layout is management tooling - it isn&apos;t available on your account.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (!hasSiteLayout) {
    return (
      <Screen title="Site layout">
        <Card>
          <Ionicons name="lock-closed-outline" size={22} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Not included in your plan</Text>
          <Text style={styles.emptyText}>
            Visual site layout is an Enterprise feature. Contact your administrator to upgrade.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (sites.length === 0) {
    return (
      <Screen title="Site layout">
        <Card>
          <Text style={styles.emptyText}>
            No sites have floors defined yet. Add floors and rooms from Organisation setup on the
            web console first.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Site layout">
      {sites.length > 1 && (
        <SelectField
          label="Site"
          value={site?.name ?? ""}
          options={sites.map((s) => s.name)}
          onChange={(name) => setSelectedSiteId(sites.find((s) => s.name === name)?.id ?? "")}
        />
      )}

      <View style={styles.floors}>
        {floors.map((floor) => (
          <Card key={floor.id} style={styles.floorCard}>
            <Text style={styles.floorName}>{floor.name}</Text>
            <Text style={styles.floorMeta}>
              {floor.planImage ? "Has a floor-plan backdrop" : "No backdrop yet"}
            </Text>
            <View style={styles.actions}>
              <Row
                icon="image-outline"
                label={floor.planImage ? "Replace photo backdrop" : "Add photo backdrop"}
                onPress={() =>
                  site &&
                  router.push({
                    pathname: "/site-layout/photo-backdrop",
                    params: { siteId: site.id, floorId: floor.id },
                  })
                }
              />
              {(Platform.OS === "ios" || Platform.OS === "android") && (
                <Row
                  icon="scan-outline"
                  label="Scan a room"
                  onPress={() =>
                    site &&
                    router.push({
                      pathname: "/site-layout/scan",
                      params: { siteId: site.id, floorId: floor.id },
                    })
                  }
                />
              )}
              <Row
                icon="create-outline"
                label="Sketch a room shape"
                onPress={() =>
                  site &&
                  router.push({
                    pathname: "/site-layout/sketch",
                    params: { siteId: site.id, floorId: floor.id },
                  })
                }
              />
            </View>
          </Card>
        ))}
      </View>

      <Text style={styles.footnote}>
        Fine positioning of rooms on the floor plan is done from Site layout on the web console.
      </Text>
    </Screen>
  );
}

function Row({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  emptyTitle: {
    marginTop: spacing.sm,
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  emptyText: {
    marginTop: spacing.xs,
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  floors: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  floorCard: {
    gap: spacing.xs,
  },
  floorName: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  floorMeta: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  footnote: {
    marginTop: spacing.lg,
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
  },
}));
