import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { GeofenceDistanceMap } from "@/components/GeofenceDistanceMap";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import type { Task } from "@/types/smartclean";
import {
  ApiError,
  clockIn as clockInRequest,
  clockOut as clockOutRequest,
  resolveQr,
  startTask as startTaskRequest,
} from "@/api/client";
import { reportBatteryOnce } from "@/features/deviceHealth";
import { getCurrentCoords } from "@/services/geolocation";
import { useTenantBranding } from "@/services/branding";
import { colors, radius, spacing, typography, themedStyles, status } from "@/theme";

// Mirrors the geofence rejection detail shape from app/(app)/scan.tsx -
// see that file's own comment for where the backend attaches this.
interface GeofenceDetail {
  distanceMeters: number;
  radiusMeters: number;
  deviceLatitude: number;
  deviceLongitude: number;
  siteLatitude: number;
  siteLongitude: number;
}

function asGeofenceDetail(detail: Record<string, unknown> | undefined): GeofenceDetail | undefined {
  if (
    detail &&
    typeof detail.distanceMeters === "number" &&
    typeof detail.radiusMeters === "number" &&
    typeof detail.deviceLatitude === "number" &&
    typeof detail.deviceLongitude === "number" &&
    typeof detail.siteLatitude === "number" &&
    typeof detail.siteLongitude === "number"
  ) {
    return detail as unknown as GeofenceDetail;
  }
  return undefined;
}

interface ScanResult {
  code: string;
  ok: boolean;
  reason?: string;
  siteName?: string;
  clockedOut?: boolean;
  geofenceDetail?: GeofenceDetail;
  accuracyMeters?: number | null;
}

function extractCode(raw: string): string {
  const match = raw.match(/\/scan\/([^/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toUpperCase();
  return raw.trim().toUpperCase();
}

/**
 * The supervisor's clock-in/out screen - a trimmed copy of the cleaner's
 * app/(app)/scan.tsx with everything that only makes sense for an
 * assignee removed: room/zone resolution, hourly-compliance claiming,
 * task checklist links, and "Report incident here". A supervisor scans
 * only ever means one thing - the site QR, to clock in or out - so this
 * screen only knows about that branch.
 *
 * Kept as its own file rather than reusing the cleaner screen because
 * that one's post-scan actions hardcode "/home" and "/tasks/[id]" -
 * routes that belong to the cleaner's own app and would be wrong here.
 */
export default function SuperviseScan() {
  const { state, currentUser, dispatch, refreshBackendData } = useSmartClean();
  const branding = useTenantBranding();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [approval, setApproval] = useState<{ siteName: string; at: string } | null>(null);
  const [distanceMapOpen, setDistanceMapOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanLockRef = useRef(false);
  // Site-wide tasks the site QR can start (resolve's siteTasks) - offered
  // instead of clocking out when already clocked in (or the organisation has
  // no attendance), so one scan can start work or end the shift.
  const attendanceOn = useHasModule("attendance");
  const [sitePicker, setSitePicker] = useState<{
    code: string;
    tasks: Task[];
    clockedIn: boolean;
    latitude: number | undefined;
    longitude: number | undefined;
  } | null>(null);
  const [startingSiteTask, setStartingSiteTask] = useState(false);
  const skipSitePickerRef = useRef(false);

  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  const scan = useCallback(
    async (rawCode: string) => {
      const code = extractCode(rawCode);
      if (!state.accessToken) return;
      setScanning(true);
      try {
        const coords = await getCurrentCoords();

        let resolved: Awaited<ReturnType<typeof resolveQr>>;
        try {
          resolved = await resolveQr(state.accessToken, code, coords?.latitude, coords?.longitude);
        } catch (error) {
          setResult({ code, ok: false, reason: error instanceof Error ? error.message : "Scan failed" });
          return;
        }

        // A room or zone code: the server has already marked THIS person's task
        // there as scanned (QrCodesController.resolve), so open it. This is how
        // a supervisor starts a task of their own that needs an area scan.
        if (resolved.valid && (resolved.kind === "room" || resolved.kind === "zone")) {
          const task = resolved.task as { id: string } | null;
          if (task) {
            router.push(`/tasks/${task.id}`);
            return;
          }
          setResult({
            code,
            ok: false,
            reason: "You have no task to do in this room today.",
            accuracyMeters: coords?.accuracy ?? null,
          });
          return;
        }

        if (!resolved.valid || resolved.kind !== "site") {
          setResult({
            code,
            ok: false,
            reason: String(resolved.reason ?? "That's not a site QR code."),
            geofenceDetail: asGeofenceDetail(resolved.verification as Record<string, unknown> | undefined),
            accuracyMeters: coords?.accuracy ?? null,
          });
          return;
        }

        const site = resolved.site as { id: string; name: string };
        const alreadyClockedIn = Boolean(
          currentUser && state.attendance[currentUser.id]?.clockedInAt,
        );
        const siteTasks = (resolved.siteTasks ?? []) as Task[];
        if (siteTasks.length > 0 && !skipSitePickerRef.current && (alreadyClockedIn || !attendanceOn)) {
          setSitePicker({
            code,
            tasks: siteTasks,
            clockedIn: alreadyClockedIn && attendanceOn,
            latitude: coords?.latitude,
            longitude: coords?.longitude,
          });
          return;
        }
        skipSitePickerRef.current = false;
        try {
          if (alreadyClockedIn) {
            await clockOutRequest(state.accessToken, {
              siteId: site.id,
              qrValue: code,
              latitude: coords?.latitude,
              longitude: coords?.longitude,
            });
          } else {
            await clockInRequest(state.accessToken, {
              siteId: site.id,
              qrValue: code,
              latitude: coords?.latitude,
              longitude: coords?.longitude,
            });
          }
          // Best-effort, never blocks the clock event itself - see
          // reportBatteryOnce's own comment.
          void reportBatteryOnce(state.accessToken);
          await refreshBackendData();
        } catch (error) {
          setResult({
            code,
            ok: false,
            reason:
              error instanceof Error
                ? error.message
                : alreadyClockedIn
                  ? "Clock-out failed"
                  : "Clock-in failed",
            geofenceDetail: error instanceof ApiError ? asGeofenceDetail(error.detail) : undefined,
            siteName: site.name,
            accuracyMeters: coords?.accuracy ?? null,
          });
          return;
        }
        setResult({ code, ok: true, siteName: site.name, clockedOut: alreadyClockedIn });
        if (!alreadyClockedIn) {
          setApproval({ siteName: site.name, at: new Date().toISOString() });
        }
      } finally {
        setScanning(false);
      }
    },
    [state.accessToken, state.attendance, currentUser, refreshBackendData, attendanceOn],
  );

  const onBarcodeScanned = useCallback(
    (event: BarcodeScanningResult) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setCameraOn(false);
      scan(event.data);
      setTimeout(() => {
        scanLockRef.current = false;
      }, 1500);
    },
    [scan],
  );

  async function startCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  return (
    <Screen title="Scan site QR">
      <View style={styles.cameraFrame}>
        {cameraOn ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={onBarcodeScanned}
            />
            <View pointerEvents="none" style={styles.reticle} />
            <Pressable style={styles.stopButton} onPress={() => setCameraOn(false)}>
              <Ionicons name="close" size={14} color={colors.foreground} />
              <Text style={styles.stopButtonText}>Stop</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.85)" />
            <Text style={styles.cameraHint}>Tap to open your camera</Text>
            {permission && !permission.granted && (
              <Text style={styles.cameraError}>Camera access is required to scan QR codes.</Text>
            )}
            <Button style={styles.startButton} onPress={startCamera}>
              Start camera
            </Button>
          </View>
        )}
        {scanning && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.scanningText}>Checking code…</Text>
          </View>
        )}
      </View>

      <Text style={styles.helpText}>
        Point at the {branding.name} site QR sticker to {clocked ? "clock out" : "clock in"}.
      </Text>

      <View style={styles.manualRow}>
        <TextInput
          value={manual}
          onChangeText={(v) => setManual(v.toUpperCase())}
          placeholder="Enter site QR code"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          style={styles.input}
        />
        <Button
          style={styles.manualButton}
          fullWidth={false}
          loading={scanning}
          onPress={() => manual && scan(manual)}
        >
          Scan
        </Button>
      </View>

      {sitePicker && (
        <Card style={styles.resultCard}>
          <Text style={styles.sitePickerTitle}>Start a site task</Text>
          <Text style={styles.sitePickerHint}>These are for the whole site. Pick the one you are starting.</Text>
          <View style={styles.sitePickerActions}>
            {sitePicker.tasks.map((task) => (
              <Button
                key={task.id}
                disabled={startingSiteTask}
                loading={startingSiteTask}
                onPress={async () => {
                  if (!state.accessToken) return;
                  setStartingSiteTask(true);
                  try {
                    const updated = await startTaskRequest(state.accessToken, task.id, {
                      qrValue: sitePicker.code,
                      latitude: sitePicker.latitude,
                      longitude: sitePicker.longitude,
                    });
                    dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: updated });
                    setSitePicker(null);
                    router.push(`/tasks/${task.id}`);
                  } catch (error) {
                    setSitePicker(null);
                    setResult({
                      code: sitePicker.code,
                      ok: false,
                      reason: error instanceof Error ? error.message : "Could not start the task.",
                      geofenceDetail: error instanceof ApiError ? asGeofenceDetail(error.detail) : undefined,
                    });
                  } finally {
                    setStartingSiteTask(false);
                  }
                }}
              >
                {task.title}
              </Button>
            ))}
            {sitePicker.clockedIn && (
              <Button
                variant="outline"
                disabled={startingSiteTask}
                onPress={() => {
                  // Same scan, but go on to clock out instead of picking a task.
                  const code = sitePicker.code;
                  setSitePicker(null);
                  skipSitePickerRef.current = true;
                  void scan(code);
                }}
              >
                Clock out instead
              </Button>
            )}
            <Button variant="outline" onPress={() => setSitePicker(null)}>
              Cancel
            </Button>
          </View>
        </Card>
      )}

      {result && (
        <Card style={[styles.resultCard, result.ok ? styles.resultOk : styles.resultBad]}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultCode}>{result.code}</Text>
            {result.ok ? <VerifiedBadge /> : <StatusBadge tone="destructive" label="Invalid" icon="close-circle-outline" />}
          </View>
          {result.ok ? (
            <View style={styles.resultBody}>
              <Text style={styles.resultLine}>
                Linked to: <Text style={styles.resultStrong}>{result.siteName}</Text>
              </Text>
              {result.clockedOut && (
                <Text style={styles.resultLine}>
                  <Text style={styles.resultStrong}>Clocked out.</Text> Have a good rest of your day.
                </Text>
              )}
              <View style={styles.checklist}>
                <ChecklistLine icon="shield-checkmark" text={`Identity verified - ${currentUser?.name}`} />
                <ChecklistLine
                  icon="time-outline"
                  text={`Timestamp ${new Date().toLocaleTimeString("en-ZA")}`}
                />
                <ChecklistLine icon="location" text="GPS within geofence" />
                <ChecklistLine icon="phone-portrait-outline" text="Device recognised" />
              </View>
              <Button style={styles.resultAction} onPress={() => router.push("/supervise-home")}>
                Back to Today
              </Button>
            </View>
          ) : (
            <View style={styles.resultBody}>
              <Text style={styles.resultError}>{result.reason}</Text>
              {result.geofenceDetail && result.accuracyMeters != null && (
                <Text style={styles.resultAccuracy}>
                  Your device&apos;s location accuracy right now is ±{Math.round(result.accuracyMeters)}m.
                  {result.accuracyMeters > result.geofenceDetail.radiusMeters
                    ? ` That's wider than the site's ${Math.round(result.geofenceDetail.radiusMeters)}m radius, so this reading may be unreliable - try moving somewhere with a clearer GPS signal.`
                    : ""}
                </Text>
              )}
              {result.geofenceDetail && (
                <Button
                  variant="outline"
                  style={styles.resultAction}
                  onPress={() => setDistanceMapOpen(true)}
                  icon={<Ionicons name="location-outline" size={16} color={colors.foreground} />}
                >
                  View my distance on a map
                </Button>
              )}
            </View>
          )}
        </Card>
      )}

      <Modal
        visible={distanceMapOpen && Boolean(result?.geofenceDetail)}
        animationType="slide"
        transparent
        onRequestClose={() => setDistanceMapOpen(false)}
      >
        <Pressable style={styles.mapBackdrop} onPress={() => setDistanceMapOpen(false)} />
        <View style={styles.mapSheet}>
          <View style={styles.mapSheetHeader}>
            <Text style={styles.mapSheetTitle}>Too far from the site</Text>
            <Pressable onPress={() => setDistanceMapOpen(false)} accessibilityLabel="Close map" hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={styles.mapSheetSubtitle}>
            Move within the shaded circle and scan again. The map uses free OpenStreetMap data.
          </Text>
          {result?.geofenceDetail && (
            <GeofenceDistanceMap
              deviceLatitude={result.geofenceDetail.deviceLatitude}
              deviceLongitude={result.geofenceDetail.deviceLongitude}
              siteLatitude={result.geofenceDetail.siteLatitude}
              siteLongitude={result.geofenceDetail.siteLongitude}
              radiusMeters={result.geofenceDetail.radiusMeters}
              distanceMeters={result.geofenceDetail.distanceMeters}
            />
          )}
        </View>
      </Modal>

      <Modal visible={Boolean(approval)} transparent animationType="fade" onRequestClose={() => setApproval(null)}>
        <View style={styles.approvalBackdrop}>
          <View style={styles.approvalCard}>
            <View style={styles.approvalIcon}>
              <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            </View>
            <Text style={styles.approvalTitle}>Shift approved</Text>
            <Text style={styles.approvalSub}>
              {approval
                ? `Site scan verified at ${new Date(approval.at).toLocaleTimeString("en-ZA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Site scan verified"}
            </Text>
            {approval?.siteName && <Text style={styles.approvalSite}>{approval.siteName}</Text>}
            <Button
              style={styles.approvalButton}
              onPress={() => {
                setApproval(null);
                router.push("/supervise-home");
              }}
            >
              Back to Today
            </Button>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ChecklistLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.checklistLine}>
      <Ionicons name={icon} size={12} color={colors.success} />
      <Text style={styles.checklistText}>{text}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  sitePickerTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  sitePickerHint: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  // Buttons stacked, one per task - a row would squeeze several titles.
  sitePickerActions: {
    gap: spacing.sm,
  },
  cameraFrame: {
    aspectRatio: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#0f172a",
    marginBottom: spacing.md,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cameraHint: {
    color: "rgba(255,255,255,0.9)",
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  cameraError: {
    color: "#fca5a5",
    fontSize: typography.tiny,
    textAlign: "center",
  },
  startButton: {
    marginTop: spacing.md,
    width: 160,
  },
  reticle: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  stopButton: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  stopButtonText: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.foreground,
  },
  helpText: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.overlay,
  },
  scanningText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.white,
  },
  manualRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  manualButton: {
    paddingHorizontal: spacing.lg,
  },
  resultCard: {
    gap: spacing.sm,
  },
  resultOk: {
    backgroundColor: colors.successSoft,
    borderColor: status.success.border,
  },
  resultBad: {
    backgroundColor: colors.destructiveSoft,
    borderColor: status.destructive.border,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultCode: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  resultBody: {
    gap: spacing.sm,
  },
  resultLine: {
    fontSize: typography.small,
    color: colors.foreground,
  },
  resultStrong: {
    fontWeight: "700",
  },
  checklist: {
    gap: 4,
  },
  checklistLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checklistText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  resultAction: {
    marginTop: spacing.xs,
  },
  resultError: {
    fontSize: typography.small,
    color: colors.destructive,
  },
  resultAccuracy: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  approvalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  approvalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: status.success.border,
    backgroundColor: colors.successSoft,
    padding: spacing.xl,
    alignItems: "center",
  },
  approvalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  approvalTitle: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.success,
  },
  approvalSub: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  approvalSite: {
    marginTop: spacing.sm,
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  approvalButton: {
    marginTop: spacing.lg,
  },
  mapBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  mapSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  mapSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  mapSheetTitle: {
    flex: 1,
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
  },
  mapSheetSubtitle: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
}));
