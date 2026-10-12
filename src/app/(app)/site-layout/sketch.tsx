import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { RoomSketchCanvas, type RoomSketchResult } from "@/components/RoomSketchCanvas";
import { useSmartClean } from "@/features/store";
import { updateLocationPosition } from "@/api/client";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

const MODES = ["Box", "Polygon"] as const;

/**
 * Quick, rough on-screen room-shape sketch for a room that already
 * exists (created from Organisation setup on the web) but hasn't been
 * arranged on the visual layout canvas yet. See RoomSketchCanvas for the
 * gesture/rendering details; this screen is just the room picker + save
 * flow around it.
 *
 * No metric scale involved here (unlike a future RoomPlan scan) -
 * sketches are relative/approximate by nature, so canvasWidthMeters is
 * never touched by this flow.
 */
export default function SketchScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const { siteId, floorId } = useLocalSearchParams<{ siteId: string; floorId: string }>();
  const { state, refreshBackendData } = useSmartClean();
  const site = state.sites.find((s) => s.id === siteId);
  const floor = site?.profile?.floors.find((f) => f.id === floorId);
  const rooms = state.locations.filter((l) => l.siteId === siteId && l.floor === floor?.name);

  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0];
  const [mode, setMode] = useState<(typeof MODES)[number]>("Box");
  const [result, setResult] = useState<RoomSketchResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeMode(next: (typeof MODES)[number]) {
    setMode(next);
    setResult(null);
    setResetKey((k) => k + 1);
  }

  function clearSketch() {
    setResult(null);
    setResetKey((k) => k + 1);
  }

  async function save() {
    if (!room || !result || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      await updateLocationPosition(state.accessToken, room.id, {
        x: result.x,
        y: result.y,
        w: result.w,
        h: result.h,
        points: result.points,
      });
      await refreshBackendData();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the sketch");
    } finally {
      setBusy(false);
    }
  }

  if (!site || !floor) {
    return (
      <Screen title="Sketch a room">
        <Card>
          <Text style={styles.emptyText}>Floor not found.</Text>
        </Card>
      </Screen>
    );
  }

  if (rooms.length === 0) {
    return (
      <Screen title="Sketch a room">
        <Card>
          <Text style={styles.emptyText}>
            No rooms on {floor.name} yet. Add rooms from Organisation setup on the web console
            first.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={`Sketch - ${floor.name}`}>
      {rooms.length > 1 && (
        <SelectField
          label="Room"
          value={room?.name ?? ""}
          onChange={(name) => setSelectedRoomId(rooms.find((r) => r.name === name)?.id ?? "")}
          options={rooms.map((r) => r.name)}
        />
      )}

      <SelectField label="Shape" value={mode} onChange={(value) => changeMode(value as (typeof MODES)[number])} options={MODES} />

      <Text style={styles.hint}>
        {mode === "Box"
          ? "Drag a rectangle over where this room roughly sits."
          : "Tap each corner in order, then tap the first corner again to close the shape."}
      </Text>

      <RoomSketchCanvas key={resetKey} mode={mode === "Box" ? "box" : "polygon"} onChange={setResult} />

      <View style={styles.actions}>
        <Button variant="outline" onPress={clearSketch} fullWidth={false} style={styles.actionButton}>
          Clear
        </Button>
        <Button onPress={save} loading={busy} disabled={!result} fullWidth={false} style={styles.actionButton}>
          Save
        </Button>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  emptyText: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  hint: {
    marginVertical: spacing.sm,
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  actions: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.destructive,
  },
}));
