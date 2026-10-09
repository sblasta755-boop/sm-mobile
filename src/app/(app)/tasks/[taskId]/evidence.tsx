import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { addTaskEvidence, fileUrl, uploadImage } from "@/api/client";
import { taskStage } from "@/domain/status";
import { evidenceForSlot, evidenceSlots, slotProgress, type EvidenceSlot, type SlotKind } from "@/domain/evidenceSlots";
import { useHasCapability, useHasModule } from "@/features/modules";
import { colors, radius, spacing, typography } from "@/theme";
import type { Evidence } from "@/types/smartclean";

// Icon per kind; the slots themselves (and their labels) come from the task -
// see domain/evidenceSlots.ts.
const KIND_ICON: Record<SlotKind, keyof typeof Ionicons.glyphMap> = {
  before: "image-outline",
  after: "image-outline",
  evidence: "camera-outline",
  issue: "alert-circle-outline",
};

export default function EvidenceScreen() {
  // `item` opens straight onto one checklist item's photo slot (from the
  // "Take photo" button beside that item on the task screen).
  const { taskId, item: requestedItem } = useLocalSearchParams<{ taskId: string; item?: string }>();
  const { state, currentUser, dispatch } = useSmartClean();
  const hasAttendance = useHasModule("attendance");
  const canScan = useHasCapability("qr_task_start");
  const task = state.tasks.find((t) => t.id === taskId);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(requestedItem ? `item:${requestedItem}` : null);
  // The inline preview is a 16:9 frame inside an accordion section (see
  // styles.cameraFrame), which on a portrait phone leaves a letterbox
  // strip barely tall enough to line a shot up. Expanding takes the
  // same CameraView full-screen. Off by default so the other categories
  // and the thumbnails stay visible while capturing.
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
      </Screen>
    );
  }

  // Same gate as the task detail screen (see tasks/[taskId]/index.tsx) —
  // reached directly here if the app was already on this screen when the
  // task's clockedIn flipped false (e.g. a background clock-out), or via
  // deep link. The backend hard-blocks add_evidence regardless; this just
  // stops a doomed camera session before it starts.
  const taskIsWorkable = ["assigned", "not_started", "in_progress", "rework_required"].includes(task.status);
  if (hasAttendance && taskIsWorkable && task.clockedIn === false) {
    return (
      <Screen title="Capture evidence" backTo={`/tasks/${task.id}`}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="camera-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Clock in to capture evidence</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            {canScan
              ? "Scan your site's QR code to clock in before capturing task evidence."
              : "Clock in from Home before capturing task evidence."}
          </Text>
          {canScan && (
            <Button style={styles.clockInPromptButton} onPress={() => router.push("/scan")}>
              Go to Scan
            </Button>
          )}
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(`/tasks/${task.id}`)}>
            Back to task
          </Button>
        </Card>
      </Screen>
    );
  }

  // Same "one task in progress at a time" gate as the task detail screen
  // (see tasks/[taskId]/index.tsx) — the backend hard-blocks add_evidence
  // regardless (TaskController._assert_no_other_task_in_progress); this
  // just stops a doomed camera session before it starts.
  const otherTaskInProgress =
    task.status !== "in_progress" &&
    state.tasks.find((t) => t.id !== task.id && t.assigneeId === currentUser?.id && t.status === "in_progress");
  if (taskIsWorkable && otherTaskInProgress) {
    return (
      <Screen title="Capture evidence" backTo={`/tasks/${task.id}`}>
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Finish your current task first</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            You&apos;re still working on &quot;{otherTaskInProgress.title}&quot;. Submit it before starting this one.
          </Text>
          <Button
            style={styles.clockInPromptButton}
            onPress={() => router.push(`/tasks/${otherTaskInProgress.id}`)}
          >
            Go to that task
          </Button>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(`/tasks/${task.id}`)}>
            Back to task
          </Button>
        </Card>
      </Screen>
    );
  }

  // Gamified capture order: Before unlocks the checklist; After and Issue
  // only unlock once the checklist itself is fully done — see
  // domain/status.ts's taskStage. Unlike before, a category isn't capped
  // at one shot once unlocked - canCapture only gates by stage, not by
  // whether that category already has a photo.
  const stage = taskStage(task);
  const slots = evidenceSlots(task, stage);

  // Always collapse when the stream goes away: the expanded overlay is
  // rendered off cameraOn, so stopping while expanded would leave
  // cameraExpanded set and the next capture would open full-screen
  // without the cleaner asking for it.
  function collapseAndStop() {
    setCameraExpanded(false);
    stopCamera();
  }

  function stopCamera() {
    setCameraOn(false);
    setActiveKey(null);
  }

  async function startCamera(key: string) {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
    setActiveKey(key);
  }

  async function capture(slot: EvidenceSlot) {
    if (!cameraOn || !cameraRef.current || busy || !task || !state.accessToken || activeKey !== slot.key) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      if (!photo?.uri) return;
      // A checklist item's photo is labelled with the item and sent with its
      // id, so the server ties the image to exactly that item.
      const label = slot.checklistItemId
        ? slot.label
        : slot.kind === "before"
          ? "Before photo"
          : slot.kind === "after"
            ? "After photo"
            : slot.kind === "evidence"
              ? "Evidence"
              : "Issue photo";
      const filePath = await uploadImage(state.accessToken, photo.uri, `${slot.kind}-${Date.now()}.jpg`);
      const updatedTask = await addTaskEvidence(state.accessToken, task.id, {
        kind: slot.kind,
        checklistItemId: slot.checklistItemId,
        label,
        filePath,
        liveCapture: true,
        offlineOriginated: state.connectivity === "offline",
      });
      dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: updatedTask });
    } finally {
      setBusy(false);
    }
  }


  return (
    <Screen title="Capture evidence" backTo={`/tasks/${task.id}`}>
      <Text style={styles.helpText}>
        Live capture only — gallery uploads disabled for this task. Photos include time, device and location
        metadata.
      </Text>

      <View style={styles.sections}>
        {slots.map((slot) => {
          const { key, kind, label, description } = slot;
          const icon = KIND_ICON[kind];
          const items = evidenceForSlot(task.evidence, slot);
          const locked = slot.unlocked ? null : slot.lockedReason;
          const isOpen = openSection === key;
          const isActive = activeKey === key;
          const complete = slot.required !== null && slot.taken >= slot.required;

          return (
            <Card key={key} style={styles.section} padded={false}>
              <Pressable
                style={styles.sectionHeader}
                disabled={!!locked}
                onPress={() => {
                  const next = isOpen ? null : key;
                  setOpenSection(next);
                  // collapseAndStop, not stopCamera - switching category
                  // while expanded would otherwise tear the stream down
                  // but leave the expanded flag set.
                  if (isActive && next !== key) collapseAndStop();
                }}
              >
                <View style={styles.sectionHeaderLeft}>
                  {locked ? (
                    <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
                  ) : (slot.required !== null ? complete : items.length > 0) ? (
                    <View style={styles.doneBadge}>
                      <Ionicons name="checkmark" size={12} color={colors.white} />
                    </View>
                  ) : (
                    <Ionicons name={icon} size={16} color={colors.mutedForeground} />
                  )}
                  <View style={styles.sectionLabelWrap}>
                    <Text style={[styles.sectionLabel, locked && styles.sectionLabelLocked]} numberOfLines={2}>
                      {label}
                    </Text>
                    {slot.sectionName && <Text style={styles.mutedSmall}>{slot.sectionName}</Text>}
                  </View>
                  {slot.required !== null ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{slotProgress(slot)}</Text>
                    </View>
                  ) : (
                    items.length > 0 && (
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{items.length}</Text>
                      </View>
                    )
                  )}
                </View>
                <Ionicons
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>

              {isOpen && (
                <View style={styles.sectionBody}>
                  {locked ? (
                    <Text style={styles.mutedSmall}>{locked}</Text>
                  ) : kind === "issue" ? (
                    // Not a camera-capture category like Before/After -
                    // an issue is a real problem a supervisor needs to
                    // actually triage and act on, not just a photo
                    // attached to this task's own record with no
                    // further path. Opens the same incident-report flow
                    // a cleaner reaches from a QR scan (see
                    // incidents/new.tsx), pre-linked to this task's own
                    // location and id so it shows up as a real,
                    // trackable incident (assignable to an investigation
                    // or a fix) rather than sitting unseen in this
                    // task's evidence.
                    <>
                      <Text style={styles.mutedSmall}>{description}</Text>
                      <Button
                        variant="outline"
                        style={styles.openCameraButton}
                        icon={<Ionicons name="alert-circle-outline" size={16} color={colors.foreground} />}
                        onPress={() =>
                          router.push(`/incidents/new?locationId=${task.locationId}&taskId=${task.id}`)
                        }
                      >
                        Report incident
                      </Button>
                    </>
                  ) : (
                    <>
                      <Text style={styles.mutedSmall}>{description}</Text>

                      {isActive && cameraOn ? (
                        // Expanding grows this frame in place rather than
                        // opening a Modal. A Modal is full-screen by
                        // definition: it hid the rest of the screen and
                        // pushed the controls under the status bar and the
                        // gesture bar. Inline, the preview stays within the
                        // screen's normal chrome - Screen's own layout
                        // already accounts for the system bars, so nothing
                        // can collide with them and no safe-area insets are
                        // needed here at all. Only the frame's aspect ratio
                        // changes between the two states.
                        <View style={cameraExpanded ? styles.cameraFrameExpanded : styles.cameraFrame}>
                          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
                          <View pointerEvents="none" style={styles.reticle} />
                          {busy && <CaptureOverlay label="Saving photo…" />}
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
                              disabled={busy}
                              loading={busy}
                              onPress={() => capture(slot)}
                            >
                              Take photo
                            </Button>
                            <Button variant="outline" style={styles.cameraActionButton} onPress={collapseAndStop}>
                              Close
                            </Button>
                          </View>
                        </View>
                      ) : (
                        <Button variant="outline" style={styles.openCameraButton} onPress={() => startCamera(key)}>
                          {slot.required !== null
                            ? complete
                              ? "Retake photo"
                              : "Take photo"
                            : items.length > 0
                              ? "Add another photo"
                              : "Take photo"}
                        </Button>
                      )}
                      {isActive && permission && !permission.granted && (
                        <Text style={styles.cameraError}>Camera access is required to capture evidence.</Text>
                      )}

                      {items.length > 0 && (
                        <View style={styles.thumbGrid}>
                          {items.map((e) => (
                            <EvidenceThumb key={e.id} evidence={e} />
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}
            </Card>
          );
        })}
      </View>

      <Button style={styles.backButton} onPress={() => router.push(`/tasks/${task.id}`)}>
        Back to task
      </Button>
    </Screen>
  );
}

// Covers the viewfinder while a capture uploads. The Take photo button
// already spins, but the preview is where the eye is - without this the
// camera looks completely unresponsive for the couple of seconds the
// upload and addTaskEvidence call take, which is exactly when people
// tap again. Not pointerEvents="none": swallowing taps is half the
// point.
function CaptureOverlay({ label }: { label: string }) {
  return (
    <View style={styles.captureOverlay}>
      <ActivityIndicator color={colors.white} />
      <Text style={styles.captureOverlayText}>{label}</Text>
    </View>
  );
}

function EvidenceThumb({ evidence: e }: { evidence: Evidence }) {
  const uri = fileUrl(e.filePath) ?? e.uri;
  return (
    <View style={styles.thumbWrap}>
      {uri ? <Image source={{ uri }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: colors.neutral }]} />}
      <Text style={styles.thumbTime}>
        {new Date(e.capturedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
      </Text>
      {e.duplicateOf && (
        <View style={styles.dupRow}>
          <Ionicons name="warning-outline" size={9} color={colors.warningForeground} />
          <Text style={styles.dupText}>Duplicate</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mutedSmall: {
    fontSize: typography.small,
    color: colors.mutedForeground,
  },
  helpText: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  sections: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  section: {
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionLabelWrap: { flexShrink: 1 },
  sectionLabel: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
  },
  sectionLabelLocked: {
    color: colors.mutedForeground,
  },
  doneBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countBadgeText: {
    fontSize: typography.tiny,
    fontWeight: "700",
    color: colors.primary,
  },
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  cameraFrame: {
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#020617",
  },
  // Expanded is a taller portrait frame, not a full-screen takeover: a
  // Modal hid the rest of the screen and put the controls under the
  // system bars. 3/4 gives roughly twice the height of the 16/9
  // collapsed state - enough to actually frame a shot - while the
  // screen's header, the other categories and the tab bar stay visible.
  cameraFrameExpanded: {
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#020617",
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
  // Both camera-frame action buttons use the outline variant (white
  // background, dark text) rather than the default primary-blue one -
  // that read as flat/dull against the dark camera preview.
  cameraActionButton: {
    flex: 1,
  },
  openCameraButton: {
    width: "100%",
  },
  cameraError: {
    color: colors.destructive,
    fontSize: typography.tiny,
  },
  thumbGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  thumbWrap: {
    width: "31%",
  },
  thumb: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
  },
  thumbTime: {
    marginTop: 2,
    fontSize: 10,
    color: colors.mutedForeground,
  },
  dupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  dupText: {
    fontSize: 9,
    color: colors.warningForeground,
  },
  backButton: {
    marginTop: spacing.sm,
  },
  clockInPromptCard: {
    marginTop: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  clockInPromptIcon: {
    marginBottom: spacing.xs,
  },
  clockInPromptTitle: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  clockInPromptText: {
    textAlign: "center",
  },
  clockInPromptButton: {
    marginTop: spacing.sm,
    alignSelf: "stretch",
  },
});
