import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";
import * as Sharing from "expo-sharing";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { WayfindingMap } from "@/components/WayfindingMap";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import { useHomePath } from "@/features/roles";
import { installWayfindingBeacon, listWayfindingBeacons, type WayfindingBeaconRecord } from "@/api/client";
import { getCurrentCoords } from "@/services/geolocation";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import { appAlert } from "@/components/Dialog";

// Who may put up visitor-guidance signs: the same people the server allows.
const ROLES = ["supervisor", "site_manager", "operations_manager", "org_admin"];
const KINDS: Record<string, string> = {
  Junction: "junction",
  "Gate / entrance": "gate",
  Viewpoint: "viewpoint",
  "Building / room": "room",
  "Help point": "help_point",
  "Safe point": "safe_point",
};

/**
 * Stand where the sign will go, name it, tap Install. The phone's GPS is the
 * position; the server links the new point to its nearest neighbours, so no
 * map has to be drawn. The placard link is shared on to be printed.
 */
export default function InstallBeaconScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const enabled = useHasModule("wayfinding");
  const sites = state.sites.filter((s) => s.active);
  const [siteId, setSiteId] = useState(() => sites[0]?.id ?? "");
  const [name, setName] = useState("");
  const [kindLabel, setKindLabel] = useState("Junction");
  const [fix, setFix] = useState<{ latitude: number; longitude: number; accuracy: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [beacons, setBeacons] = useState<WayfindingBeaconRecord[]>([]);
  const token = state.accessToken;

  const load = useCallback(async () => {
    if (!token || !siteId) return;
    try {
      setBeacons(await listWayfindingBeacons(token, siteId));
    } catch {
      /* the list is a convenience; installing still works */
    }
  }, [token, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!currentUser || !ROLES.includes(currentUser.role) || !enabled) return <Redirect href={homePath as never} />;

  const locate = async () => {
    const c = await getCurrentCoords();
    if (!c) return appAlert("Location needed", "Allow location access and try again, outdoors if you can.");
    setFix({ latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy });
  };

  const install = async () => {
    if (!token || !fix || !name.trim()) return appAlert("Missing details", "Name the sign and get your location first.");
    setBusy(true);
    try {
      const created = await installWayfindingBeacon(token, {
        siteId,
        name: name.trim(),
        kind: KINDS[kindLabel],
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        safePoint: KINDS[kindLabel] === "safe_point",
      });
      setName("");
      setFix(null);
      await load();
      appAlert("Installed", `Linked to ${created.edgeCount} nearby point(s). Share its placard link to print it.`);
    } catch (error) {
      appAlert("Could not install", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Wayfinding signs">
      {/* The existing signs and, once you have a position, where the new one will go. */}
      {beacons.length > 0 || fix ? (
        <WayfindingMap
          beacons={beacons}
          edges={[]}
          here={fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy } : null}
          draft={fix ? { latitude: fix.latitude, longitude: fix.longitude } : null}
          height={240}
        />
      ) : null}
      <Card>
        <SelectField
          label="Site"
          value={sites.find((s) => s.id === siteId)?.name ?? ""}
          options={sites.map((s) => s.name)}
          onChange={(label) => setSiteId(sites.find((s) => s.name === label)?.id ?? siteId)}
        />
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="North gate" />
        <SelectField label="Type" value={kindLabel} options={Object.keys(KINDS)} onChange={setKindLabel} />
        <Text style={styles.hint}>
          {fix
            ? `Position set${fix.accuracy != null ? ` (±${Math.round(fix.accuracy)} m)` : ""}`
            : "Stand where the sign will be placed."}
        </Text>
        <Button variant="outline" onPress={locate}>
          Use my location
        </Button>
        <Button onPress={install} loading={busy} disabled={!fix || !name.trim()}>
          Install sign here
        </Button>
      </Card>
      {beacons.map((b) => (
        <Card key={b.id}>
          <Text style={styles.title}>{b.name}</Text>
          <Text style={styles.hint}>
            {b.kind.replace("_", " ")} · {b.edgeCount} paths
          </Text>
          <Button
            variant="outline"
            onPress={() => Sharing.isAvailableAsync().then(() => appAlert("Placard link", `/w/${b.code}`))}
          >
            Show placard code
          </Button>
        </Card>
      ))}
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  label: { fontSize: typography.small, color: colors.mutedForeground, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.foreground,
    marginVertical: spacing.xs,
  },
  hint: { fontSize: typography.small, color: colors.mutedForeground, marginVertical: spacing.xs },
  title: { fontSize: typography.h2, fontWeight: "600", color: colors.foreground },
}));
