import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Animated, Easing, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { useSmartClean } from "@/features/store";
import { updateLocationPosition, updateSite } from "@/api/client";
import { convertRoomScanToLayout } from "@/features/roomScanPlacement";
import {
  isRoomPlanSupported,
  RoomScanView,
  type RoomScanProgress,
  type RoomScanResult,
  type RoomScanTrackingState,
} from "room-scan";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * True AR room scanning - Apple RoomPlan on iOS (16+, A12+ chip), a
 * bespoke ARCore plane-detection + wall-fitting pipeline on Android (no
 * first-party equivalent exists there - see the room-scan module's
 * android/ directory). This screen's job is narrow on either platform:
 * host the native capture view, receive its result, convert real-world
 * meters to this floor's normalized canvas coordinates
 * (convertRoomScanToLayout - the metric-scale-anchor logic, kept as its
 * own unit-tested pure function), save it, and hand off to the web app
 * for fine positioning.
 *
 * UNVERIFIED end-to-end on both platforms: RoomCaptureSession only runs
 * on a real iOS device (not the Simulator); ARCore's Session likewise
 * needs a real Android device's camera/motion tracking (no ARCore
 * emulator path exercises real plane detection). Neither platform's
 * actual capture flow - the native view mounting, a user walking a real
 * room, onCaptureFinished firing with sane geometry - has been
 * exercised. What IS verified: isRoomPlanSupported gates correctly on
 * each platform (Platform.OS check + a defensive try/catch around the
 * native call), convertRoomScanToLayout's math is unit-tested
 * (roomScanPlacement.test.ts), and Android's wall-fitting/corner-
 * intersection geometry is separately unit-tested natively (see
 * modules/room-scan/android/src/test/) - none of that substitutes for a
 * real on-device scan.
 */
export default function ScanRoomScreen() {
  const { siteId, floorId, locationId } = useLocalSearchParams<{
    siteId: string;
    floorId: string;
    locationId?: string;
  }>();
  const { state, refreshBackendData } = useSmartClean();
  const site = state.sites.find((s) => s.id === siteId);
  const floor = site?.profile?.floors.find((f) => f.id === floorId);
  const rooms = state.locations.filter((l) => l.siteId === siteId && l.floor === floor?.name);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(locationId ?? rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set by Cancel so the capture callbacks know to throw the result away
   * rather than save it. A ref, not state, because it is read inside the
   * native event callbacks immediately after the same tap that sets it -
   * a state update would not have been applied yet. */
  const discardRef = useRef(false);
  /** CAMERA is a runtime permission on Android, and ARCore's
   * Session.resume() throws CameraNotAvailableException without it - the
   * native view then never builds its GLSurfaceView and renders as a
   * blank area. Requested here before the view is ever mounted, the same
   * way photo-backdrop.tsx gates its own CameraView. */
  const [permission, requestPermission] = useCameraPermissions();
  /** Live native scan feedback. Android-only: iOS's RoomCaptureView draws
   * Apple's own overlay and never emits onScanProgress, so this stays
   * null there and the panel renders its own "starting up" state rather
   * than implying a stalled scan. */
  const [progress, setProgress] = useState<RoomScanProgress | null>(null);

  useEffect(() => {
    isRoomPlanSupported().then(setSupported);
  }, []);

  async function handleCaptureFinished(event: { nativeEvent: RoomScanResult }) {
    setActive(false);
    if (discardRef.current) return; // Cancelled - drop the scan silently.
    if (!room || !site || !floor || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const { points, canvasWidthMetersToPersist } = convertRoomScanToLayout({
        points: event.nativeEvent.points,
        widthMeters: event.nativeEvent.widthMeters,
        floor,
      });

      if (canvasWidthMetersToPersist != null) {
        // First scan on this floor - persist the scale it establishes,
        // via the same read-modify-write updateFloorPlanImage's sibling
        // helper documents (whole-spaceProfile PATCH, shallow merge
        // gotcha on the backend). Reuses updateSite directly here since
        // this isn't a planImage change.
        const floors = (site.profile?.floors ?? []).map((f) =>
          f.id === floor.id ? { ...f, canvasWidthMeters: canvasWidthMetersToPersist } : f,
        );
        await updateSite(state.accessToken, site.id, {
          geofence: { spaceProfile: { floors, updatedAt: new Date().toISOString() } },
        });
      }

      await updateLocationPosition(state.accessToken, room.id, {
        x: Math.min(...points.map((p) => p.x)),
        y: Math.min(...points.map((p) => p.y)),
        w: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
        h: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
        points,
      });
      await refreshBackendData();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the scanned room");
    } finally {
      setBusy(false);
    }
  }

  function handleScanProgress(event: { nativeEvent: RoomScanProgress }) {
    setProgress(event.nativeEvent);
  }

  function handleCaptureError(event: { nativeEvent: { message: string } }) {
    setActive(false);
    // A cancelled scan almost always "fails" (too few walls seen) - that
    // is expected, not an error worth showing. Everything else must
    // surface: a session that fails to start (no camera permission,
    // ARCore unavailable) emits here and otherwise leaves the user
    // staring at an empty preview with no explanation.
    if (discardRef.current) return;
    setError(event.nativeEvent.message);
  }

  if (!site || !floor) {
    return (
      <Screen title="Scan a room">
        <Card>
          <Text style={styles.emptyText}>Floor not found.</Text>
        </Card>
      </Screen>
    );
  }

  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return (
      <Screen title="Scan a room">
        <Card>
          <Ionicons name="phone-portrait-outline" size={22} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Not available here</Text>
          <Text style={styles.emptyText}>
            Room scanning needs the Šoma360 mobile app on iPhone or Android. Use the photo
            backdrop or manual sketch instead.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (supported === false) {
    return (
      <Screen title="Scan a room">
        <Card>
          <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
          <Text style={styles.emptyTitle}>Not supported on this device</Text>
          {Platform.OS === "ios" ? (
            <Text style={styles.emptyText}>
              Room scanning needs iOS 16 or later on an iPhone XS or newer. Use the photo backdrop
              or manual sketch instead.
            </Text>
          ) : (
            <>
              <Text style={styles.emptyText}>
                Room scanning needs Google Play Services for AR, which isn&apos;t installed, is out
                of date, or isn&apos;t supported on this device. Use the photo backdrop or manual
                sketch instead.
              </Text>
              <Button
                variant="outline"
                onPress={() =>
                  Linking.openURL("https://play.google.com/store/apps/details?id=com.google.ar.core")
                }
                style={styles.playStoreLink}
              >
                Update Google Play Services for AR
              </Button>
            </>
          )}
        </Card>
      </Screen>
    );
  }

  if (rooms.length === 0) {
    return (
      <Screen title="Scan a room">
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
    <Screen title={`Scan — ${floor.name}`}>
      {!active && (
        <>
          {rooms.length > 1 && (
            <SelectField
              label="Room"
              value={room?.name ?? ""}
              onChange={(name) => setSelectedRoomId(rooms.find((r) => r.name === name)?.id ?? "")}
              options={rooms.map((r) => r.name)}
            />
          )}
          <Text style={styles.hint}>
            Walk slowly around {room?.name ?? "the room"}&apos;s perimeter, keeping every wall in
            view. The scan tracks walls as it finds them — tap Done once you&apos;ve gone all the
            way around.
          </Text>
          <Button
            onPress={async () => {
              if (!permission?.granted) {
                const res = await requestPermission();
                if (!res.granted) {
                  setError(
                    "Camera access is needed to scan a room. Enable it for Šoma360 in your device settings.",
                  );
                  return;
                }
              }
              discardRef.current = false;
              setError(null);
              setProgress(null);
              setActive(true);
            }}
            disabled={!room || supported !== true}
            loading={busy}
          >
            Start scan
          </Button>
          {!room ? (
            <Text style={styles.hint}>Select a room above to enable Start scan.</Text>
          ) : (
            supported === null && (
              <Text style={styles.hint}>Checking this device's scanning support…</Text>
            )
          )}
        </>
      )}

      {active && !RoomScanView && (
        <Card>
          <Text style={styles.emptyTitle}>Scanner unavailable</Text>
          <Text style={styles.emptyText}>
            The room-scanning component isn&apos;t part of this build. Use the photo backdrop or
            manual sketch instead.
          </Text>
        </Card>
      )}

      {active && RoomScanView && (
        <>
          <View style={styles.scanContainer}>
            <RoomScanView
              style={styles.scanView}
              isActive={active}
              onCaptureFinished={handleCaptureFinished}
              onCaptureError={handleCaptureError}
              onScanProgress={handleScanProgress}
            />
          </View>
          <ScanProgressPanel progress={progress} />
          <Text style={styles.scanHint}>
            Keep walking until you&apos;ve seen every wall, then tap Done.
          </Text>
          {/* Done and Cancel both drop isActive to false, which is what
              stops the native session - the difference is what the result
              handlers are allowed to do with the outcome. discardRef is
              read by handleCaptureFinished/handleCaptureError, since the
              native side finalizes and emits on any stop and has no
              separate "abandon" path. */}
          <View style={styles.scanActions}>
            <Button
              variant="outline"
              onPress={() => {
                discardRef.current = true;
                setActive(false);
              }}
              fullWidth={false}
              style={styles.scanActionButton}
            >
              Cancel
            </Button>
            <Button
              onPress={() => {
                discardRef.current = false;
                setActive(false);
              }}
              fullWidth={false}
              style={styles.scanActionButton}
            >
              Done
            </Button>
          </View>
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </Screen>
  );
}

/** Per-tracking-state coaching copy. Every non-"tracking" state is
 * something the user can usually fix themselves, so each one says what
 * to DO, not just what is wrong. */
const TRACKING_HINTS: Record<RoomScanTrackingState, { label: string; tone: "ok" | "warn" }> = {
  tracking: { label: "Tracking", tone: "ok" },
  initializing: { label: "Starting up — move the phone slowly", tone: "warn" },
  excessive_motion: { label: "Slow down — you're moving too fast", tone: "warn" },
  insufficient_light: { label: "Too dark — turn on more light", tone: "warn" },
  insufficient_features: { label: "Point at a wall with more detail", tone: "warn" },
  paused: { label: "Tracking paused — hold steady", tone: "warn" },
};

/**
 * What to tell the user right now, given what the session can actually
 * see. Ordered most-blocking first.
 *
 * The case that matters most is healthy tracking with no walls yet: a
 * blank painted wall gives ARCore very little to lock onto, so the
 * honest advice is to aim at a corner or somewhere with more visual
 * detail. Without this the user sees "Tracking" next to a zero and
 * reasonably concludes the feature is broken.
 */
function coachingFor(progress: RoomScanProgress | null): string {
  if (!progress) return "Starting the camera…";

  if (progress.tracking !== "tracking") return TRACKING_HINTS[progress.tracking].label;

  if (progress.wallCount === 0) {
    return progress.otherSurfaceCount > 0
      ? "Surfaces detected, but no wall yet — aim at where the wall meets the floor or a corner."
      : "Move the phone slowly side to side, and aim where the wall meets the floor.";
  }

  if (progress.wallCount < 3) {
    return "Good — now turn and walk to the next wall, keeping it in view.";
  }

  return "Enough walls for a shape — keep going for a better fit, then tap Done.";
}

/**
 * Live scan feedback. Without this the camera preview alone gives the
 * user no way to tell a working scan from a frozen one.
 *
 * A null `progress` is the legitimate pre-first-event state (and the
 * permanent state on iOS, where RoomPlan draws its own overlay and never
 * emits onScanProgress) - it reads as "starting up", never as an error.
 */
function ScanProgressPanel({ progress }: { progress: RoomScanProgress | null }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A continuously animating dot is the part that proves the session is
    // alive even while the wall count sits still - a static badge cannot
    // distinguish "scanning, nothing new yet" from "frozen".
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const hint = progress ? TRACKING_HINTS[progress.tracking] : TRACKING_HINTS.initializing;
  const wallCount = progress?.wallCount ?? 0;

  return (
    <View style={styles.progressPanel}>
      <View style={styles.progressRow}>
        <Animated.View
          style={[
            styles.pulseDot,
            {
              backgroundColor: hint.tone === "ok" ? colors.success : colors.warning,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) },
              ],
            },
          ]}
        />
        <Text style={styles.progressStatus}>{hint.label}</Text>
        <Text style={styles.wallCount}>{wallCount}</Text>
        <Text style={styles.wallCountLabel}>
          {wallCount === 1 ? "wall" : "walls"}
        </Text>
      </View>

      <Text style={styles.progressFootnote}>{coachingFor(progress)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  hint: {
    marginVertical: spacing.md,
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  scanContainer: {
    height: 480,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  scanView: {
    flex: 1,
  },
  progressPanel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressStatus: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  wallCount: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.primary,
  },
  wallCountLabel: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  progressFootnote: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  scanHint: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  scanActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  scanActionButton: {
    flex: 1,
  },
  playStoreLink: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.destructive,
  },
});
