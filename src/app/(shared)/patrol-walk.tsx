import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { WayfindingMap, type MapPoint } from "@/components/WayfindingMap";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import { useHomePath } from "@/features/roles";
import {
  listWayfindingBeacons,
  listWayfindingEdges,
  recordWayfindingPatrol,
  type WayfindingBeaconRecord,
  type WayfindingEdgeRecord,
} from "@/api/client";
import { nearestBeacon } from "@/domain/nearestBeacon";
import { watchPosition } from "@/services/geolocation";
import { appAlert } from "@/components/Dialog";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// A sign this close to you is offered as the one you are at (to start from, or to arrive at).
const NEAR_METERS = 40;
// Keep the trail light: one point per few metres is plenty for a line on a map.
const MAX_TRAIL_POINTS = 600;
// Fixes less accurate than this say little about which way someone walked.
const MAX_FIX_ERROR_M = 40;
const MAX_POINTS_SENT = 300;

/** The walked track as [[lat, lng], ...]: only decent fixes, thinned so the request stays small. The
 * server simplifies it further and keeps it as the path's shape. */
function trackToSend(trail: { latitude: number; longitude: number; accuracy?: number | null }[]): number[][] | undefined {
  const good = trail.filter((p) => p.accuracy == null || p.accuracy <= MAX_FIX_ERROR_M);
  if (good.length < 3) return undefined;
  const step = Math.max(1, Math.ceil(good.length / MAX_POINTS_SENT));
  const thinned = good.filter((_, i) => i % step === 0 || i === good.length - 1);
  return thinned.map((p) => [p.latitude, p.longitude]);
}

/**
 * Walk a path to confirm it, with a map. The map shows the site's signs and the
 * paths between them (grey dashed = estimate, green = walked, red = closed) and
 * where you are. Start at a sign (tap it on the map, or accept the nearest one),
 * walk, and tap the sign you reach. The time you took is trusted at once and
 * the path is marked verified; if something blocks it, say so and routing
 * avoids it.
 */
export default function PatrolWalkScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const enabled = useHasModule("wayfinding");
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [beacons, setBeacons] = useState<WayfindingBeaconRecord[]>([]);
  const [edges, setEdges] = useState<WayfindingEdgeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [here, setHere] = useState<MapPoint | null>(null);
  const [trail, setTrail] = useState<MapPoint[]>([]);
  const token = state.accessToken;
  const walking = startedAt != null;
  const walkingRef = useRef(walking);
  walkingRef.current = walking;

  const load = useCallback(async () => {
    if (!token || !siteId) return;
    try {
      const [b, e] = await Promise.all([listWayfindingBeacons(token, siteId), listWayfindingEdges(token, siteId)]);
      setBeacons(b.filter((x) => x.active));
      setEdges(e);
    } catch {
      /* shown as an empty map */
    } finally {
      setLoaded(true);
    }
  }, [token, siteId]);

  useEffect(() => {
    setLoaded(false);
    setFromId(null);
    setToId(null);
    void load();
  }, [load]);

  // Where you are, live, for as long as the screen is open (and the trail while walking).
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void watchPosition((coords) => {
      const point = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
      setHere(point);
      if (walkingRef.current) setTrail((t) => (t.length >= MAX_TRAIL_POINTS ? t : [...t, point]));
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    if (startedAt == null) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const from = beacons.find((b) => b.id === fromId) ?? null;
  const to = beacons.find((b) => b.id === toId) ?? null;
  const near = useMemo(
    () => nearestBeacon(here, beacons, NEAR_METERS, walking ? fromId ?? undefined : undefined),
    [here, beacons, walking, fromId],
  );

  if (!currentUser || !ROLES.includes(currentUser.role) || !enabled) return <Redirect href={homePath as never} />;

  const names = beacons.map((b) => b.name);
  const pick = (id: string) => {
    if (!walking) setFromId(id);
    else if (id !== fromId) setToId(id);
  };

  const finish = async (blocked: boolean) => {
    if (!token || !from || !to) return appAlert("Pick both signs", "Choose where you started and where you are now.");
    setBusy(true);
    try {
      const result = await recordWayfindingPatrol(token, {
        aBeaconId: from.id,
        bBeaconId: to.id,
        ...(blocked ? { blocked: true } : { seconds: Math.max(5, elapsed), trail: trackToSend(trail) }),
      });
      const saved = result.shapeSource === "walked" ? " The way you walked is saved as the path." : "";
      appAlert(
        blocked ? "Path closed" : "Path confirmed",
        (result.tasksCompleted > 0 ? `${result.tasksCompleted} walk-this-path task(s) completed.` : "Thank you.") + saved,
      );
      // The next leg starts where this one ended, and the map shows the path as walked.
      setFromId(to.id);
      setToId(null);
      setStartedAt(null);
      setElapsed(0);
      setTrail([]);
      void load();
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancelWalk = () => {
    setStartedAt(null);
    setElapsed(0);
    setTrail([]);
    setToId(null);
  };

  return (
    <Screen title="Walk a path">
      <Card>
        <SelectField
          label="Site"
          value={sites.find((s) => s.id === siteId)?.name ?? ""}
          options={sites.map((s) => s.name)}
          onChange={(label) => setSiteId(sites.find((s) => s.name === label)?.id ?? siteId)}
        />
      </Card>

      {loaded && beacons.length === 0 ? (
        <Card style={styles.empty}>
          <Ionicons name="compass-outline" size={34} color={colors.primary} />
          <Text style={styles.emptyTitle}>No signs on this site yet</Text>
          <Text style={styles.emptyText}>
            Walking a path confirms the route between two signs. Install at least two signs first.
          </Text>
          <Button fullWidth={false} onPress={() => router.push("/install-beacon" as never)}>
            Install signs
          </Button>
        </Card>
      ) : (
        <>
          <WayfindingMap
            beacons={beacons}
            edges={edges}
            here={here}
            trail={trail}
            fromId={fromId}
            toId={toId}
            height={320}
            onPick={pick}
          />

          <Card style={styles.panel}>
            {!walking ? (
              <>
                <Text style={styles.step}>1. Choose where you are starting</Text>
                <Text style={styles.help}>Tap a sign on the map, or pick it here.</Text>
                {near && near.beacon.id !== fromId && (
                  <Pressable accessibilityRole="button" style={styles.nearChip} onPress={() => setFromId(near.beacon.id)}>
                    <Ionicons name="locate" size={16} color={colors.primary} />
                    <Text style={styles.nearText}>
                      You are {Math.round(near.meters)} m from {near.beacon.name}. Start here
                    </Text>
                  </Pressable>
                )}
                <SelectField
                  label="Starting at"
                  value={from?.name ?? ""}
                  options={names}
                  onChange={(n) => setFromId(beacons.find((b) => b.name === n)?.id ?? null)}
                />
                <Button
                  disabled={!from}
                  onPress={() => {
                    setTrail(here ? [here] : []);
                    setStartedAt(Date.now());
                  }}
                >
                  Start walking
                </Button>
              </>
            ) : (
              <>
                <Text style={styles.timer}>{clock(elapsed)}</Text>
                <Text style={styles.help}>
                  Walking from <Text style={styles.strong}>{from?.name}</Text>. Tap the sign you reach on the map, or pick it here.
                </Text>
                {near && near.beacon.id !== toId && (
                  <Pressable accessibilityRole="button" style={styles.nearChip} onPress={() => setToId(near.beacon.id)}>
                    <Ionicons name="locate" size={16} color={colors.primary} />
                    <Text style={styles.nearText}>
                      {near.beacon.name} is {Math.round(near.meters)} m away. I have arrived here
                    </Text>
                  </Pressable>
                )}
                <SelectField
                  label="Arrived at"
                  value={to?.name ?? ""}
                  options={names.filter((n) => n !== from?.name)}
                  onChange={(n) => setToId(beacons.find((b) => b.name === n)?.id ?? null)}
                />
                <Button onPress={() => finish(false)} loading={busy} disabled={!to}>
                  I&apos;ve arrived
                </Button>
                <View style={styles.row}>
                  <Button variant="destructive" fullWidth={false} style={styles.rowButton} onPress={() => finish(true)} disabled={!to || busy}>
                    Path is blocked
                  </Button>
                  <Button variant="outline" fullWidth={false} style={styles.rowButton} onPress={cancelWalk}>
                    Cancel walk
                  </Button>
                </View>
              </>
            )}
          </Card>
        </>
      )}
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    panel: { gap: spacing.sm, marginTop: spacing.md },
    step: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    help: { fontSize: typography.small, color: colors.mutedForeground, lineHeight: 18 },
    strong: { fontWeight: "700", color: colors.foreground },
    timer: { fontSize: typography.title, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    nearChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
    },
    nearText: { flex: 1, fontSize: typography.small, fontWeight: "600", color: colors.primary },
    row: { flexDirection: "row", gap: spacing.sm },
    rowButton: { flex: 1 },
    empty: { alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
    emptyTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    emptyText: { fontSize: typography.small, color: colors.mutedForeground, textAlign: "center" },
  }),
);
