import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Screen } from "@/components/Screen";
import { prepareEvidencePhoto } from "@/services/photoPrep";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { useSmartClean } from "@/features/store";
import { useHomePath, useScanPath } from "@/features/roles";
import { useHasCapability } from "@/features/modules";
import { fileUrl } from "@/api/client";
import { appAlert } from "@/components/Dialog";
import { drainQueue } from "@/features/evidenceUploader";
import { enqueueMutation } from "@/features/outbox";
import { keepPhoto } from "@/features/evidenceQueue";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";
import type { IncidentPriority } from "@/types/smartclean";

const CATEGORIES = ["Safety", "Security", "Damage", "Complaint", "Lost property", "Maintenance", "Chemical spill", "Missing stock"];
const PRIORITIES: IncidentPriority[] = ["low", "medium", "high", "critical"];
const MAX_PHOTOS = 10;

export default function NewIncidentScreen() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  // Set by the scan result screen (see app/(app)/scan.tsx's "Report
  // incident here") when the cleaner arrived via a QR code already tied
  // to a specific room/zone. There's no manual room/zone picker any
  // more - the QR scan is the only source of truth for location, so a
  // cleaner with no linked location gets a "scan first" gate below
  // instead of a form to fill in by hand.
  // taskId is set instead when arriving from a task's "Issue" evidence
  // capture (see tasks/[taskId]/evidence.tsx) - that task already has
  // its own locationId, so this screen reuses it as if the cleaner had
  // just scanned that same room/zone, and threads taskId through to
  // createIncident below so the report can be traced back to the task.
  const { locationId: linkedLocationId, taskId } = useLocalSearchParams<{
    locationId?: string;
    taskId?: string;
  }>();
  const { state, currentUser } = useSmartClean();
  const homePath = useHomePath();
  const scanPath = useScanPath();
  // Organisations without QR codes have nothing to scan, so the location is
  // chosen from a list instead. Fails open (QR) before bootstrap lands.
  const qrAvailable = useHasCapability("qr_codes");
  const [pickedLabel, setPickedLabel] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState<IncidentPriority>("medium");
  const [description, setDescription] = useState("");
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  // Optional - a reporter who already knows what needs doing can jot it
  // down here to pre-fill the checklist if a supervisor assigns a task
  // directly off this incident instead of sending someone to investigate
  // first. See IncidentCreateRequest.suggestedSteps on the backend.
  const [suggestedSteps, setSuggestedSteps] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  // Live capture only, same as every other evidence path in this app
  // (task evidence, the scan-in flow) - a photo attached to an incident
  // report is evidence of a real condition someone actually observed, so
  // it needs the same "taken right now, on this device" guarantee a
  // gallery upload can't provide.
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  // 16:9 inline preview is too short to frame a shot on a portrait
  // phone - expanding takes the same CameraView full-screen. Off by
  // default so the rest of the incident form stays visible.
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  // The location must come from a scanned QR code (see the "scan first"
  // gate below) - there's no manual room/zone picker any more, so the
  // site is always derived from the scanned location itself, never from
  // "whichever of the cleaner's assigned sites happens to be first".
  // Arriving via taskId (from a task's "Issue" evidence capture) is the
  // one other trusted source of a location: that task was itself only
  // ever created against a real room/zone, so its own locationId stands
  // in for a fresh scan rather than sending the cleaner to re-scan a
  // room they're already standing in mid-task.
  const sourceTask = taskId ? state.tasks.find((t) => t.id === taskId) : undefined;
  // The rooms a person can pick when QR is off: their own sites' locations.
  const pickable = state.locations
    .filter((l) => !currentUser?.siteIds.length || currentUser.siteIds.includes(l.siteId))
    .map((l) => ({
      id: l.id,
      label: `${state.sites.find((s) => s.id === l.siteId)?.name ?? "Site"} - ${l.name}`,
    }));
  const pickedId = pickable.find((p) => p.label === pickedLabel)?.id;
  const linkedLocation = state.locations.find(
    (l) => l.id === (linkedLocationId ?? sourceTask?.locationId ?? (qrAvailable ? undefined : pickedId)),
  );
  const site = linkedLocation ? state.sites.find((s) => s.id === linkedLocation.siteId) : undefined;
  // A stale/tampered link shouldn't silently let the report through with
  // a location that doesn't actually exist - only a linkedLocationId/
  // sourceTask.locationId that resolves to a real Location (and thus a
  // real site) counts.
  const locationId = linkedLocation?.id;
  const hasValidScan = Boolean(linkedLocation && site);

  function stopCamera() {
    setCameraOn(false);
  }

  async function startCamera() {
    if (photoPaths.length >= MAX_PHOTOS) return;
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  async function capturePhoto() {
    if (!cameraOn || !cameraRef.current || uploadingPhoto || !state.accessToken) return;
    if (photoPaths.length >= MAX_PHOTOS) return;
    setUploadingPhoto(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      if (!photo?.uri) return;
      // Shrunk first: a full camera frame is several megabytes to send.
      // Kept on the phone and sent with the report, so taking it needs no signal.
      const small = await prepareEvidencePhoto(photo.uri, photo.width, photo.height);
      const localUri = await keepPhoto(small, `incident_${Date.now()}`);
      setPhotoPaths((prev) => [...prev, localUri]);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto(filePath: string) {
    setPhotoPaths((prev) => prev.filter((p) => p !== filePath));
  }

  async function submit() {
    if (!site || !state.accessToken || !locationId || !hasValidScan) return;
    setBusy(true);
    try {
      // Saved on the phone and sent as soon as there is a connection (now, if
      // there already is one), so the report is never lost to a dead signal.
      if (!currentUser) return;
      await enqueueMutation({
        userId: currentUser.id,
        kind: "incident.create",
        payload: {
          siteId: site.id,
          locationId,
          category,
          priority,
          description,
          offlineOriginated: state.connectivity === "offline",
          localPhotos: photoPaths,
          suggestedSteps: suggestedSteps.map((s) => s.trim()).filter(Boolean),
          taskId: taskId || undefined,
        },
      });
      void drainQueue();
      if (state.connectivity === "offline") {
        appAlert("Report saved", "There is no connection right now. Your report is saved on this phone and will be sent automatically.");
      }
      // Back to the task that prompted this report (rather than /home)
      // when arriving via taskId - the cleaner was mid-task and should
      // land back where they left off, not at the top of the app.
      router.push(taskId ? `/tasks/${taskId}` : (homePath as never));
    } finally {
      setBusy(false);
    }
  }

  if (!hasValidScan && !qrAvailable) {
    return (
      <Screen title="Report incident">
        <Card style={styles.scanPromptCard}>
          <Ionicons name="location-outline" size={28} color={colors.primary} style={styles.scanPromptIcon} />
          <Text style={styles.scanPromptTitle}>Where did it happen?</Text>
          {pickable.length === 0 ? (
            <Text style={[styles.emptyLocations, styles.scanPromptText]}>
              There are no rooms or zones set up for your site yet. Ask your manager to add some.
            </Text>
          ) : (
            <SelectField
              label="Room / zone"
              value={pickedLabel || "Choose a room or zone"}
              options={pickable.map((p) => p.label)}
              onChange={setPickedLabel}
            />
          )}
          <Button
            variant="outline"
            style={styles.scanPromptButton}
            onPress={() => router.push(taskId ? `/tasks/${taskId}` : (homePath as never))}
          >
            {taskId ? "Back to task" : "Back home"}
          </Button>
        </Card>
      </Screen>
    );
  }

  if (!hasValidScan) {
    return (
      <Screen title="Report incident">
        <Card style={styles.scanPromptCard}>
          <Ionicons name="scan-outline" size={28} color={colors.primary} style={styles.scanPromptIcon} />
          <Text style={styles.scanPromptTitle}>Scan the room or zone QR code first</Text>
          <Text style={[styles.emptyLocations, styles.scanPromptText]}>
            An incident report is always tied to a specific room/zone - scan its QR code and choose
            &quot;Report incident here&quot; to open this form with the location already set.
          </Text>
          <Button
            style={styles.scanPromptButton}
            icon={<Ionicons name="scan-outline" size={16} color={colors.primaryForeground} />}
            onPress={() => router.push(scanPath as never)}
          >
            Scan QR code
          </Button>
          <Button
            variant="outline"
            style={styles.scanPromptButton}
            onPress={() => router.push(taskId ? `/tasks/${taskId}` : (homePath as never))}
          >
            {taskId ? "Back to task" : "Back home"}
          </Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Report incident">
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Room / zone</Text>
          <View style={styles.lockedField}>
            <Ionicons name="location" size={14} color={colors.foreground} />
            <Text style={styles.lockedFieldText}>{linkedLocation?.name}</Text>
          </View>
          <View style={styles.lockedRow}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.mutedForeground} />
            <Text style={styles.lockedText}>
              {qrAvailable ? "Set from the QR code you scanned." : "Chosen from your site's rooms."}
            </Text>
          </View>
        </View>

        <SelectField label="Category" value={category} options={CATEGORIES} onChange={setCategory} />
        <SelectField label="Priority" value={priority} options={PRIORITIES} onChange={(v) => setPriority(v as IncidentPriority)} capitalize />

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholder="Describe what happened"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.textarea]}
          />
          {description.length > 0 && description.length < 5 && (
            <Text style={styles.hintText}>
              A few more words needed - at least 5 characters to submit.
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Suggested steps (optional)</Text>
          <Text style={styles.emptyLocations}>
            Already know how to fix this? List the steps - a supervisor can assign them straight
            to a cleaner as a task instead of sending someone to investigate first.
          </Text>
          {suggestedSteps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <TextInput
                value={step}
                onChangeText={(text) =>
                  setSuggestedSteps((prev) => prev.map((s, i) => (i === index ? text : s)))
                }
                placeholder={`Step ${index + 1}`}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.stepInput]}
              />
              <Pressable
                accessibilityLabel="Remove step"
                onPress={() => setSuggestedSteps((prev) => prev.filter((_, i) => i !== index))}
                style={styles.stepRemoveButton}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addStepButton} onPress={() => setSuggestedSteps((prev) => [...prev, ""])}>
            <Ionicons name="add" size={16} color={colors.foreground} />
            <Text style={styles.addStepText}>Add step</Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Photos (optional)</Text>
          <Text style={styles.emptyLocations}>
            Live capture only - gallery uploads aren&apos;t accepted for incident evidence.
          </Text>

          {cameraOn ? (
            // Expanding grows this frame in place rather than opening a
            // Modal. A Modal is full-screen by definition: it hid the rest
            // of the form and pushed the controls under the status bar and
            // the gesture bar. Inline, the preview stays within the
            // screen's normal chrome, so the system bars can't be collided
            // with and no safe-area insets are needed. Only the frame's
            // aspect ratio changes between the two states.
              <View style={cameraExpanded ? styles.cameraFrameExpanded : styles.cameraFrame}>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
                <View pointerEvents="none" style={styles.reticle} />
                {uploadingPhoto && (
                  // The Take photo button already spins, but the preview
                  // is what the eye is on - without this the viewfinder
                  // looks completely unchanged while the upload runs.
                  <View style={styles.captureOverlay}>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.captureOverlayText}>Uploading photo…</Text>
                  </View>
                )}
                <Pressable
                  accessibilityLabel={cameraExpanded ? "Shrink camera" : "Expand camera"}
                  onPress={() => setCameraExpanded((open) => !open)}
                  style={styles.cameraExpandButton}
                >
                  <Ionicons
                    name={cameraExpanded ? "contract-outline" : "expand-outline"}
                    size={20}
                    color="#ffffff"
                  />
                </Pressable>
                <View style={styles.cameraActions}>
                  <Button
                    variant="outline"
                    style={styles.cameraActionButton}
                    disabled={uploadingPhoto || photoPaths.length >= MAX_PHOTOS}
                    loading={uploadingPhoto}
                    onPress={capturePhoto}
                  >
                    Take photo
                  </Button>
                  <Button
                    variant="outline"
                    style={styles.cameraActionButton}
                    onPress={() => {
                      // Collapse with the stream so the next capture
                      // doesn't reopen full-screen unasked.
                      setCameraExpanded(false);
                      stopCamera();
                    }}
                  >
                    Close
                  </Button>
                </View>
              </View>
          ) : (
            photoPaths.length < MAX_PHOTOS && (
              <Button variant="outline" onPress={startCamera}>
                Take photo
              </Button>
            )
          )}
          {permission && !permission.granted && (
            <Text style={styles.cameraError}>Camera access is required to attach a photo.</Text>
          )}

          {photoPaths.length > 0 && (
            <View style={styles.photoRow}>
              {photoPaths.map((filePath) => (
                <View key={filePath} style={styles.photoThumbWrap}>
                  <Image
                    source={{ uri: filePath.startsWith("file:") ? filePath : fileUrl(filePath) }}
                    style={styles.photoThumb}
                  />
                  <Pressable
                    accessibilityLabel="Remove photo"
                    onPress={() => removePhoto(filePath)}
                    style={styles.photoRemoveButton}
                  >
                    <Ionicons name="close" size={12} color={colors.white} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <Button disabled={busy || description.length < 5 || !locationId} onPress={submit}>
          Submit incident
        </Button>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  hintText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
  },
  emptyLocations: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  lockedText: {
    fontSize: typography.tiny,
    color: colors.mutedForeground,
  },
  lockedField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.muted,
  },
  lockedFieldText: {
    fontSize: typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  scanPromptCard: {
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.xs,
  },
  scanPromptIcon: {
    marginBottom: spacing.xs,
  },
  scanPromptTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  scanPromptText: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  scanPromptButton: {
    width: "100%",
    marginTop: spacing.xs,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepInput: {
    flex: 1,
  },
  stepRemoveButton: {
    padding: 4,
  },
  addStepButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addStepText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
  },
  cameraFrame: {
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#020617",
    marginTop: spacing.xs,
  },
  // Expanded is a taller portrait frame, not a full-screen takeover -
  // see the same style on the task evidence screen. 3/4 gives roughly
  // twice the height of the 16/9 collapsed state, which is what made
  // framing a shot hard, while the form's own chrome stays visible.
  cameraFrameExpanded: {
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#020617",
    marginTop: spacing.xs,
  },
  captureOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.overlay,
  },
  captureOverlayText: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.white,
  },
  cameraExpandButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  reticle: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    bottom: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cameraActions: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    gap: spacing.sm,
  },
  // Outline variant (white background, dark text) rather than the
  // default primary-blue one - that read as flat/dull against the dark
  // camera preview.
  cameraActionButton: {
    flex: 1,
  },
  cameraError: {
    marginTop: spacing.xs,
    color: colors.destructive,
    fontSize: typography.tiny,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoThumbWrap: {
    width: 64,
    height: 64,
  },
  photoThumb: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
  },
  photoRemoveButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.destructive,
    alignItems: "center",
    justifyContent: "center",
  },
}));
