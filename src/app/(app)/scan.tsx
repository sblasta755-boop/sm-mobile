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
import { BrokenGlassIcon } from "@/components/BrokenGlassIcon";
import { useSmartClean } from "@/features/store";
import { useHasModule } from "@/features/modules";
import type { Task } from "@/types/smartclean";
import {
  ApiError,
  claimTableSession,
  clockIn as clockInRequest,
  clockOut as clockOutRequest,
  resolveQr,
  startTask as startTaskRequest,
} from "@/api/client";
import { reportBatteryOnce } from "@/features/deviceHealth";
import { getCurrentCoords } from "@/services/geolocation";
import { useTenantBranding } from "@/services/branding";
import { colors, radius, spacing, typography, themedStyles, status } from "@/theme";

// The structured payload evaluate_geofence attaches to a geofence
// rejection's AppError.detail (see app/controllers/common.py on the
// backend) - only present when the rejection reason was actually
// distance-based (device coordinates were supplied but outside the
// radius), not for the "no geofence configured" or "no GPS" cases,
// which have nothing to plot. Mirrors the web app's mobile.scan.tsx.
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
  linkedName?: string;
  taskId?: string;
  /** The scanned room/zone's own id - set whenever the QR code resolved
   * to a real Location, whether or not it also carried an assigned
   * task, so "Report incident here" can link straight to that location
   * regardless of why the scan otherwise succeeded or failed. */
  locationId?: string;
  kind?: string;
  clockedOut?: boolean;
  geofenceVerified?: boolean;
  geofenceDetail?: GeofenceDetail;
  siteName?: string;
  /** The device's own confidence radius for the fix behind this scan -
   * see DeviceCoords.accuracy. Shown alongside a geofence rejection so
   * a poor-accuracy reading is visible instead of just "you're too
   * far". */
  accuracyMeters?: number | null;
}

const SUGGESTIONS = ["SITE-SBP-001", "ROOM-SBP-BTH-02", "ZONE-SBP-REC-01", "STOCK-SBP-001"];

function extractCode(raw: string): string {
  // /scan/<code> is the web app's own deep-link poster pattern; /table/
  // <code> is the same idea for a table's printed QR (see the "no-login
  // customer table page" route in smart-property-operations) - the
  // physical code must be scannable by an ordinary phone camera (which
  // needs a URL to open something) AND by this in-app scanner (which
  // just needs the bare code), so the printed QR encodes a full
  // https://<customer-app>/table/<code> URL and both scanners extract
  // the same <code> back out of it. See TableSessionController's
  // "Customer-facing" section docstring on the backend for why the
  // customer QR moved from a session token to the table's own permanent
  // code.
  const match = raw.match(/\/(?:scan|table)\/([^/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toUpperCase();
  return raw.trim().toUpperCase();
}

export default function ScanScreen() {
  const { state, currentUser, dispatch, refreshBackendData } = useSmartClean();
  const branding = useTenantBranding();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [approval, setApproval] = useState<{ siteName: string; at: string } | null>(null);
  const [distanceMapOpen, setDistanceMapOpen] = useState(false);
  // A claimable hourly-compliance round the last scan found but hasn't
  // claimed yet - see QrCodesController.resolve's confirmClaim
  // handling. Cleared once the cleaner confirms (or backs out).
  const [claimPreview, setClaimPreview] = useState<{
    code: string;
    location: { id: string; name: string } | undefined;
    task: { id: string; title: string; hourlyComplianceSlot?: string | null };
    latitude: number | undefined;
    longitude: number | undefined;
  } | null>(null);
  const [confirmingClaim, setConfirmingClaim] = useState(false);
  // Site-wide tasks the site QR can start - see QrCodesController.resolve's
  // siteTasks. Offered instead of clocking out when this person is already
  // clocked in (or the organisation has no attendance), so one scan of the
  // site code can either start work or end the shift, and they choose.
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
  // Covers the whole scan round-trip (geolocation -> resolveQr ->
  // clock in/out -> refreshBackendData), which can run for seconds on a
  // slow connection. Without it the camera closed and the screen sat
  // unchanged, so cleaners tapped a suggestion or Scan again thinking
  // nothing had happened. Mirrors the web screen's own scanningCode.
  const [scanning, setScanning] = useState(false);
  const scanLockRef = useRef(false);

  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  const scan = useCallback(
    async (rawCode: string) => {
      const code = extractCode(rawCode);
      setRecent((r) => [code, ...r.filter((c) => c !== code)].slice(0, 4));

      if (!state.accessToken) return;
      setScanning(true);
      try {
      // Fetched once per scan and reused for every call below — the
      // backend rejects a geofenced scan outright when this is null (see
      // evaluate_geofence), so a denied/unavailable location fails the
      // scan rather than silently proceeding unverified.
      const coords = await getCurrentCoords();

      let resolved: Awaited<ReturnType<typeof resolveQr>>;
      try {
        resolved = await resolveQr(state.accessToken, code, coords?.latitude, coords?.longitude);
      } catch (error) {
        setResult({ code, ok: false, reason: error instanceof Error ? error.message : "Scan failed" });
        return;
      }

      if (!resolved.valid) {
        // A room/zone QR's geofence rejection (QrCodesController.resolve
        // - a task assigned here, or an hourly-compliance round, exists
        // but the device isn't within the site's radius) comes back as
        // a normal 200 body with its own "verification"/"siteName"
        // fields, not a thrown ApiError like the site-QR clock-in/out
        // path below - so geofenceDetail has to be read from here
        // instead of an error's .detail. Previously dropped entirely:
        // the rejection reason showed, but "View my distance on a map"
        // never appeared for this path even though the backend was
        // already sending everything needed to draw it.
        setResult({
          code,
          ok: false,
          reason: String(resolved.reason ?? "QR code is not recognised."),
          geofenceDetail: asGeofenceDetail(resolved.verification as Record<string, unknown> | undefined),
          siteName: typeof resolved.siteName === "string" ? resolved.siteName : undefined,
          accuracyMeters: coords?.accuracy ?? null,
        });
        return;
      }

      if (resolved.kind === "site") {
        const site = resolved.site as { id: string; name: string };
        // Re-scanning the site QR is also how you clock out — mirrors
        // clocking in: both require the same physical presence proof,
        // rather than clock-out trusting a stored site code with no
        // fresh verification. Which one happens depends on whether this
        // user is already clocked in.
        // Which direction to attempt. This is a HINT only: the server
        // derives the real answer from the last recorded event and
        // refuses a clock-in when already in (or a clock-out when not),
        // so a stale cached value here produces a clear "You are already
        // clocked in." rather than a silently duplicated event. It used
        // to be the ONLY thing keeping these alternating - nothing
        // server-side checked, so two clock-ins both succeeded and the
        // first one vanished from the record.
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
          // reportBatteryOnce's own comment for why a failed read/report
          // here must not surface as a clock-in/out failure.
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
        setResult({
          code,
          ok: true,
          linkedName: site.name,
          kind: "site",
          clockedOut: alreadyClockedIn,
          geofenceVerified: true,
        });
        if (!alreadyClockedIn) {
          setApproval({ siteName: site.name, at: new Date().toISOString() });
        }
        return;
      }

      if (resolved.kind === "room" || resolved.kind === "zone") {
        const location = resolved.location as { id: string; name: string; type?: string } | null;
        const task = resolved.task as { id: string } | null;

        // A table QR resolves here too (QrCodesController.resolve knows
        // nothing about TableSession - it only ever reports a Location's
        // ordinary Task, and a table's whole point is that it usually
        // has none). Without this branch every table scan fell straight
        // into the "no assigned task" case below, which is wrong: the
        // scan is a waiter claiming the table, not a cleaner looking for
        // task work. See TablesScreen.claim in app/(app)/tables/index.tsx
        // for the same call - this is the other entry point into it, the
        // one the "Scan or type table code" hint on that screen actually
        // promised ("Scan a table's QR from the main Scan tab").
        if (location?.type === "table") {
          try {
            const claimResult = await claimTableSession(state.accessToken, { value: code });
            if (claimResult.blocked) {
              setResult({
                code,
                ok: false,
                reason: claimResult.blockedReason ?? "This table is occupied.",
                locationId: location.id,
                linkedName: location.name,
              });
              return;
            }
            if (claimResult.takeoverOffered) {
              router.push({
                pathname: "/tables/[sessionId]",
                params: {
                  sessionId: "takeover",
                  qrValue: code,
                  servedByName: claimResult.servedByName ?? "",
                  staleSignal: claimResult.staleSignal ?? "",
                },
              });
              return;
            }
            if (claimResult.claimed && claimResult.session) {
              await refreshBackendData();
              router.push({
                pathname: "/tables/[sessionId]",
                params: {
                  sessionId: claimResult.session.id,
                  needsCleanConfirm: claimResult.cleaningConfirmationRequired ? "1" : "0",
                },
              });
              return;
            }
          } catch (error) {
            setResult({
              code,
              ok: false,
              reason: error instanceof Error ? error.message : "Could not claim this table.",
              locationId: location.id,
              linkedName: location.name,
            });
          }
          return;
        }
        // A claimable hourly-compliance round was found but not claimed
        // yet (see QrCodesController.resolve's confirmClaim handling) -
        // show the cleaner exactly which round this is and let them
        // confirm before it's actually claimed, rather than claiming
        // silently the instant the scan resolves. Previously this was
        // the same call that claimed outright, with no way to see - let
        // alone correct - a claim on the wrong round (e.g. an older
        // overdue slot instead of the one actually due right now)
        // before it had already happened.
        const claimTaskPreview = resolved.claimPreview as
          | { id: string; title: string; hourlyComplianceSlot?: string | null }
          | null
          | undefined;
        if (claimTaskPreview) {
          setClaimPreview({
            code,
            location: location ?? undefined,
            task: claimTaskPreview,
            latitude: coords?.latitude,
            longitude: coords?.longitude,
          });
          return;
        }
        if (!task) {
          // No assigned task doesn't mean the scan itself failed - the
          // location still resolved to a real room/zone, which is
          // enough to offer "Report incident here" even though there's
          // nothing to work right now.
          setResult({
            code,
            ok: false,
            reason: "No assigned task for this location right now.",
            locationId: location?.id,
            linkedName: location?.name,
          });
          return;
        }
        await refreshBackendData();
        setResult({
          code,
          ok: true,
          linkedName: location?.name,
          locationId: location?.id,
          taskId: task.id,
          kind: resolved.kind,
          geofenceVerified: true,
        });
        return;
      }

        setResult({ code, ok: true, kind: (resolved.kind as string | undefined) ?? undefined });
      } finally {
        // finally, not a tail call: every branch above returns early
        // (geofence rejection, clock-in failure, no task here), and each
        // one must clear the spinner too.
        setScanning(false);
      }
    },
    [state.accessToken, state.attendance, currentUser, refreshBackendData],
  );

  const confirmClaim = useCallback(async () => {
    if (!state.accessToken || !claimPreview) return;
    setConfirmingClaim(true);
    try {
      const resolved = await resolveQr(
        state.accessToken,
        claimPreview.code,
        claimPreview.latitude,
        claimPreview.longitude,
        true,
      );
      const task = resolved.task as { id: string } | null;
      if (!task) {
        // Someone else claimed it between the preview and this confirm
        // (a genuine race, not a bug) - resolve would have returned a
        // fresh claimPreview for whatever's still open instead, or no
        // task at all if nothing is. Re-scanning picks up wherever
        // things actually stand now rather than assuming the preview
        // is still accurate.
        setClaimPreview(null);
        setResult({
          code: claimPreview.code,
          ok: false,
          reason: "This round was claimed by someone else - scan again to see what's left.",
        });
        return;
      }
      await refreshBackendData();
      setResult({
        code: claimPreview.code,
        ok: true,
        linkedName: claimPreview.location?.name,
        locationId: claimPreview.location?.id,
        taskId: task.id,
        kind: (resolved.kind as string | undefined) ?? undefined,
        geofenceVerified: true,
      });
      setClaimPreview(null);
    } catch (error) {
      setClaimPreview(null);
      setResult({
        code: claimPreview.code,
        ok: false,
        reason: error instanceof Error ? error.message : "Failed to claim this round",
      });
    } finally {
      setConfirmingClaim(false);
    }
  }, [state.accessToken, claimPreview, refreshBackendData]);

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
    <Screen title="Scan QR">
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
          // onBarcodeScanned closes the camera and fires scan() without
          // awaiting it, so without this the frame goes blank and stays
          // blank for the whole round-trip - the exact moment people
          // scan again.
          <View style={styles.scanningOverlay}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.scanningText}>Checking code…</Text>
          </View>
        )}
      </View>

      <Text style={styles.helpText}>
        Point at a {branding.name} QR sticker. You can also tap a suggestion or type a code.
      </Text>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            style={[styles.suggestionChip, scanning && styles.suggestionChipDisabled]}
            disabled={scanning}
            onPress={() => scan(s)}
          >
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.manualRow}>
        <TextInput
          value={manual}
          onChangeText={(v) => setManual(v.toUpperCase())}
          placeholder="Enter QR code"
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

      {claimPreview && (
        <Card style={[styles.resultCard, styles.resultInfo]}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultCode}>{claimPreview.code}</Text>
            <StatusBadge tone="info" label="Ready to claim" />
          </View>
          <View style={styles.resultBody}>
            <Text style={styles.resultLine}>
              You&apos;re about to claim{" "}
              <Text style={styles.resultStrong}>{claimPreview.task.title}</Text>
              {claimPreview.task.hourlyComplianceSlot
                ? ` (${claimPreview.task.hourlyComplianceSlot} slot)`
                : ""}
              .
            </Text>
            <Text style={styles.claimHint}>
              This round is still open for other cleaners too - once you confirm, it&apos;s yours
              and everyone else eligible is notified it&apos;s taken.
            </Text>
            <View style={styles.claimActions}>
              <Button
                style={styles.claimActionButton}
                loading={confirmingClaim}
                onPress={confirmClaim}
              >
                Confirm and start
              </Button>
              <Button
                variant="outline"
                style={styles.claimActionButton}
                disabled={confirmingClaim}
                onPress={() => setClaimPreview(null)}
              >
                Cancel
              </Button>
            </View>
          </View>
        </Card>
      )}

      {sitePicker && (
        <Card style={styles.resultCard}>
          <Text style={styles.sitePickerTitle}>Start a site task</Text>
          <Text style={styles.claimHint}>These are for the whole site. Pick the one you are starting.</Text>
          <View style={styles.sitePickerActions}>
            {sitePicker.tasks.map((task) => (
              <Button
                key={task.id}
                style={styles.claimActionButton}
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
                style={styles.claimActionButton}
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
            <Button variant="outline" style={styles.claimActionButton} onPress={() => setSitePicker(null)}>
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
                Linked to: <Text style={styles.resultStrong}>{result.linkedName}</Text>
              </Text>
              {result.clockedOut && (
                <Text style={styles.resultLine}>
                  <Text style={styles.resultStrong}>Clocked out.</Text> Have a good rest of your day.
                </Text>
              )}
              <View style={styles.checklist}>
                <ChecklistLine icon="shield-checkmark" text={`Identity verified — ${currentUser?.name}`} />
                <ChecklistLine
                  icon="time-outline"
                  text={`Timestamp ${new Date().toLocaleTimeString("en-ZA")}`}
                />
                <ChecklistLine
                  icon="location"
                  text={result.geofenceVerified ? "GPS within geofence" : "Location check passed"}
                />
                <ChecklistLine icon="phone-portrait-outline" text="Device recognised" />
              </View>
              {result.kind === "site" && clocked && !result.clockedOut && (
                <Button style={styles.resultAction} onPress={() => router.push("/home")}>
                  Continue to my tasks
                </Button>
              )}
              {result.clockedOut && (
                <Button style={styles.resultAction} onPress={() => router.push("/home")}>
                  Back to home
                </Button>
              )}
              {result.taskId && (
                <Button style={styles.resultAction} onPress={() => router.push(`/tasks/${result.taskId}`)}>
                  Open task checklist
                </Button>
              )}
              {result.locationId && (
                <Button
                  variant="outline"
                  style={styles.resultAction}
                  onPress={() => router.push(`/incidents/new?locationId=${result.locationId}`)}
                  icon={<BrokenGlassIcon size={16} color={colors.foreground} />}
                >
                  Report incident here
                </Button>
              )}
            </View>
          ) : (
            <View style={styles.resultBody}>
              <Text style={styles.resultError}>{result.reason}</Text>
              {result.locationId && (
                <Button
                  variant="outline"
                  style={styles.resultAction}
                  onPress={() => router.push(`/incidents/new?locationId=${result.locationId}`)}
                  icon={<BrokenGlassIcon size={16} color={colors.foreground} />}
                >
                  Report incident here
                </Button>
              )}
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
            <Text style={styles.mapSheetTitle}>Too far from {result?.siteName ?? "the site"}</Text>
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
              siteName={result.siteName}
            />
          )}
        </View>
      </Modal>

      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent</Text>
          {recent.map((c) => (
            <Text key={c} style={styles.recentItem}>
              {c}
            </Text>
          ))}
        </View>
      )}

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
            <View style={styles.approvalSparkle}>
              <Ionicons name="sparkles" size={14} color={colors.success} />
              <Text style={styles.approvalSparkleText}>Verification complete</Text>
            </View>
            <Button
              style={styles.approvalButton}
              onPress={() => {
                setApproval(null);
                router.push("/home");
              }}
            >
              Continue to my tasks
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
    marginBottom: spacing.sm,
  },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  suggestionChipDisabled: {
    opacity: 0.5,
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
  suggestionText: {
    fontSize: typography.tiny,
    fontWeight: "600",
    color: colors.foreground,
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
  resultInfo: {
    backgroundColor: colors.infoSoft,
    borderColor: status.info.border,
  },
  // Buttons stacked, one per task - a row would squeeze several titles.
  sitePickerActions: {
    gap: spacing.sm,
  },
  sitePickerTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  claimHint: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  claimActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  claimActionButton: {
    flex: 1,
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
  recentSection: {
    marginTop: spacing.lg,
  },
  recentTitle: {
    fontSize: typography.tiny,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  recentItem: {
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
  approvalSparkle: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  approvalSparkleText: {
    fontSize: typography.tiny,
    color: colors.success,
    fontWeight: "600",
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
