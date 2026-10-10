import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import { useHomePath } from "@/features/roles";
import { listWayfindingBeacons, recordWayfindingPatrol, type WayfindingBeaconRecord } from "@/api/client";
import { colors, spacing, typography, themedStyles } from "@/theme";
import { appAlert } from "@/components/Dialog";

const ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Walk a path to confirm it. Pick where you are starting, tap Start, walk to
 * the next sign, pick it and tap Arrived. The time you took is trusted at once
 * (a visitor's walk needs several to count), and the path is marked verified.
 * If something blocks the way, say so and routing avoids the path.
 */
export default function PatrolWalkScreen() {
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const enabled = useHasModule("wayfinding");
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [beacons, setBeacons] = useState<WayfindingBeaconRecord[]>([]);
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const token = state.accessToken;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!token || !siteId) return;
    try {
      setBeacons((await listWayfindingBeacons(token, siteId)).filter((b) => b.active));
    } catch {
      /* shown as an empty list */
    }
  }, [token, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (startedAt == null) return;
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [startedAt]);

  if (!currentUser || !ROLES.includes(currentUser.role) || !enabled) return <Redirect href={homePath as never} />;

  const names = beacons.map((b) => b.name);
  const from = beacons.find((b) => b.name === fromName);
  const to = beacons.find((b) => b.name === toName);

  const finish = async (blocked: boolean) => {
    if (!token || !from || !to) return appAlert("Pick both signs", "Choose where you started and where you are now.");
    setBusy(true);
    try {
      const result = await recordWayfindingPatrol(token, {
        aBeaconId: from.id,
        bBeaconId: to.id,
        ...(blocked ? { blocked: true } : { seconds: Math.max(5, elapsed) }),
      });
      appAlert(
        blocked ? "Path closed" : "Path confirmed",
        result.tasksCompleted > 0 ? `${result.tasksCompleted} walk-this-path task(s) completed.` : "Thank you.",
      );
      // The next leg starts where this one ended.
      setFromName(to.name);
      setToName("");
      setStartedAt(null);
      setElapsed(0);
    } catch (error) {
      appAlert("Could not save", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
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
        <SelectField label="Starting at" value={fromName} options={names} onChange={setFromName} disabled={startedAt != null} />
        {startedAt == null ? (
          <Button onPress={() => setStartedAt(Date.now())} disabled={!from}>
            Start walking
          </Button>
        ) : (
          <>
            <Text style={styles.timer}>{clock(elapsed)}</Text>
            <SelectField label="Arrived at" value={toName} options={names.filter((n) => n !== fromName)} onChange={setToName} />
            <Button onPress={() => finish(false)} loading={busy} disabled={!to}>
              I&apos;ve arrived
            </Button>
            <Button variant="destructive" onPress={() => finish(true)} disabled={!to || busy}>
              Path is blocked
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                setStartedAt(null);
                setElapsed(0);
              }}
            >
              Cancel walk
            </Button>
          </>
        )}
      </Card>
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  timer: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
    marginVertical: spacing.md,
  },
}));
