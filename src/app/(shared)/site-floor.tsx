import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { FloorPlanSvg, type PlanRoom } from "@/components/FloorPlanSvg";
import { Screen } from "@/components/Screen";
import { getSiteLayoutStatus, type LocationLiveStatus, type LocationLiveStatusValue } from "@/api/client";
import { STATUS_HEX, STATUS_LABEL, STATUS_ORDER, agoLabel, statusCounts } from "@/domain/siteFloor";
import { useHasModule } from "@/features/modules";
import { useCanManageSiteLayout } from "@/features/roles";
import { useSmartClean } from "@/features/store";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const REFRESH_MS = 20_000;

/**
 * The live floor plan for one site, for managers (Enterprise "site_layout" module). Rooms are coloured by status or by
 * how long since they were cleaned; tap one for what is happening there. Reached from "Your sites" on the manager
 * Overview. The web app's phone version is PhoneLayout.tsx; 3D is web only.
 */
export default function SiteFloorScreen() {
  useThemeVersion();
  const { siteId } = useLocalSearchParams<{ siteId: string }>();
  const { state } = useSmartClean();
  const canManage = useCanManageSiteLayout();
  const hasModule = useHasModule("site_layout");
  const site = state.sites.find((s) => s.id === siteId);
  const floors = useMemo(() => site?.profile?.floors ?? [], [site]);
  const [floorId, setFloorId] = useState("");
  const [statuses, setStatuses] = useState<Map<string, LocationLiveStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [colourMode, setColourMode] = useState<"status" | "age">("status");
  const [focus, setFocus] = useState<LocationLiveStatusValue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const token = state.accessToken;
  const allowed = canManage && hasModule;

  const refresh = useCallback(async () => {
    if (!token || !siteId) return;
    try {
      const response = await getSiteLayoutStatus(token, siteId);
      setStatuses(new Map(response.statuses.map((s) => [s.locationId, s])));
      setUpdatedAt(new Date());
    } catch {
      // A failed poll keeps the last-known statuses on screen: a stale colour beats a blank plan.
    } finally {
      setLoading(false);
    }
  }, [token, siteId]);

  useEffect(() => {
    if (!allowed) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const sub = AppState.addEventListener("change", (next) => next === "active" && void refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [allowed, refresh]);

  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  const rooms: PlanRoom[] = useMemo(
    () =>
      state.locations
        .filter((l) => l.siteId === siteId && l.floor === floor?.name)
        .map((location) => ({ location, status: statuses.get(location.id) })),
    [state.locations, siteId, floor, statuses],
  );
  const counts = statusCounts(rooms.map((r) => r.status?.status));
  const selected = selectedId ? state.locations.find((l) => l.id === selectedId) : undefined;
  const selectedStatus = selected ? statuses.get(selected.id) : undefined;

  if (!canManage) {
    return (
      <Screen title="Floor plan">
        <Card>
          <Text style={styles.muted}>The floor plan is management tooling - it isn&apos;t available on your account.</Text>
        </Card>
      </Screen>
    );
  }
  if (!hasModule) {
    return (
      <Screen title="Floor plan">
        <Card>
          <Ionicons name="lock-closed-outline" size={22} color={colors.mutedForeground} />
          <Text style={styles.title}>Not included in your plan</Text>
          <Text style={styles.muted}>The live floor plan is an Enterprise feature. Contact your administrator to upgrade.</Text>
        </Card>
      </Screen>
    );
  }
  if (!site) {
    return (
      <Screen title="Floor plan">
        <Card><Text style={styles.muted}>Site not found.</Text></Card>
      </Screen>
    );
  }
  if (floors.length === 0) {
    return (
      <Screen title={site.name}>
        <Card>
          <Text style={styles.muted}>
            This site has no floors yet. Add floors and rooms from Organisation setup on the web console first.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={site.name}>
      {floors.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityRole="tablist">
          {floors.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: floor?.id === f.id }}
              onPress={() => {
                setFloorId(f.id);
                setSelectedId(null);
              }}
              style={[styles.pill, floor?.id === f.id && styles.pillOn]}
            >
              <Text style={[styles.pillText, floor?.id === f.id && styles.pillTextOn]}>{f.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.segment} accessibilityRole="radiogroup">
        {(
          [
            ["status", "Status"],
            ["age", "Last cleaned"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: colourMode === value }}
            onPress={() => setColourMode(value)}
            style={[styles.segBtn, colourMode === value && styles.segBtnOn]}
          >
            <Text style={[styles.segText, colourMode === value && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STATUS_ORDER.filter((k) => counts[k] > 0 || focus === k).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: focus === k }}
            onPress={() => setFocus((f) => (f === k ? null : k))}
            style={[styles.chip, focus === k && styles.chipOn]}
          >
            <View style={[styles.dot, { backgroundColor: STATUS_HEX[k] }]} />
            <Text style={styles.chipText}>{STATUS_LABEL[k]}</Text>
            <Text style={styles.muted}>{counts[k]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FloorPlanSvg
          planImage={floor?.planImage}
          rooms={rooms}
          focusStatus={focus}
          colourMode={colourMode}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {selected ? (
        <Card style={styles.detail}>
          <View style={styles.detailHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{selected.name}</Text>
              <Text style={styles.muted}>
                {String(selected.type).replace(/_/g, " ")}
                {selected.floor ? ` · ${selected.floor}` : ""}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} hitSlop={8}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>
          <View style={[styles.badge, { backgroundColor: STATUS_HEX[selectedStatus?.status ?? "no_data"] + "26" }]}>
            <Text style={[styles.badgeText, { color: STATUS_HEX[selectedStatus?.status ?? "no_data"] }]}>
              {STATUS_LABEL[selectedStatus?.status ?? "no_data"]}
            </Text>
          </View>
          {selectedStatus?.detail ? <Text style={styles.muted}>{selectedStatus.detail}</Text> : null}
          <Fact label="Last cleaned" value={agoLabel(selectedStatus?.lastCleanedAt)} />
          <Fact label="Open tasks" value={String(selectedStatus?.openTasks ?? 0)} />
          {(selectedStatus?.workingNow?.length ?? 0) > 0 && <Fact label="Working now" value={selectedStatus!.workingNow!.join(", ")} />}
          {(selectedStatus?.assignees?.length ?? 0) > 0 && <Fact label="Assigned" value={selectedStatus!.assignees!.join(", ")} />}
          {selectedStatus?.taskId ? (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/tasks/${selectedStatus.taskId}` as never)} style={styles.primary}>
              <Text style={styles.primaryText}>Open the task</Text>
            </Pressable>
          ) : null}
          {selectedStatus?.incidentId ? (
            <Pressable accessibilityRole="button" onPress={() => router.push("/incidents" as never)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Go to incidents</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        !loading && <Text style={[styles.muted, styles.hint]}>Tap a room to see what is happening there.</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.muted}>
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}` : "Not updated yet"}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void refresh()} hitSlop={8}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    title: { fontSize: typography.body, fontWeight: "800", color: colors.foreground, textTransform: "capitalize" },
    muted: { fontSize: typography.small, color: colors.mutedForeground },
    hint: { textAlign: "center", marginTop: spacing.md },
    link: { fontSize: typography.small, fontWeight: "700", color: colors.primary },
    center: { paddingVertical: spacing.xl, alignItems: "center" },
    pills: { gap: spacing.sm, paddingBottom: spacing.sm },
    pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillText: { fontSize: typography.body, fontWeight: "700", color: colors.mutedForeground },
    pillTextOn: { color: colors.primaryForeground },
    segment: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, marginBottom: spacing.sm, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    segBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.round },
    segBtnOn: { backgroundColor: colors.primary },
    segText: { fontSize: typography.body, fontWeight: "700", color: colors.mutedForeground },
    segTextOn: { color: colors.primaryForeground },
    chips: { gap: spacing.xs, paddingBottom: spacing.sm },
    chip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipOn: { backgroundColor: colors.muted, borderColor: colors.foreground },
    chipText: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    dot: { width: 10, height: 10, borderRadius: 5 },
    detail: { marginTop: spacing.md, gap: spacing.sm },
    detailHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
    badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.round },
    badgeText: { fontSize: typography.small, fontWeight: "800" },
    fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    factValue: { flexShrink: 1, textAlign: "right", fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    primary: { alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.round, backgroundColor: colors.primary },
    primaryText: { fontSize: typography.body, fontWeight: "800", color: colors.primaryForeground },
    secondary: { alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.round, borderWidth: 1, borderColor: colors.border },
    secondaryText: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    footer: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  }),
);
