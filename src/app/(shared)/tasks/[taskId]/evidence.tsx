import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { useScanPath } from "@/features/roles";
import { addTaskEvidence, fileUrl, uploadImage } from "@/api/client";
import { taskStage } from "@/domain/status";
import { evidenceForSlot, evidenceSlots, slotProgress, type EvidenceSlot } from "@/domain/evidenceSlots";
import { useHasCapability, useHasModule } from "@/features/modules";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import { appAlert } from "@/components/Dialog";

/** The word on a tile: a checklist item's photos are just Before / After / Photo. */
function tileTitle(slot: EvidenceSlot): string {
  if (!slot.checklistItemId) return slot.label;
  return slot.kind === "before" ? "Before" : slot.kind === "after" ? "After" : "Photo";
}

/**
 * Every photo this task asks for, on one screen: a card per checklist item
 * with a tile for each photo (Before / After, or just Photo), so nothing is
 * hidden behind a collapsed section. Tap a tile to take (or retake) that
 * photo; the camera opens full screen and closes when the photo is done.
 */
export default function EvidenceScreen() {
  // `item` highlights one checklist item (from the "Take photo" button beside
  // it on the task screen); everything else stays on screen too.
  const { taskId, item: requestedItem } = useLocalSearchParams<{ taskId: string; item?: string }>();
  const { state, currentUser, dispatch } = useSmartClean();
  const insets = useSafeAreaInsets();
  const scanPath = useScanPath();
  const hasAttendance = useHasModule("attendance");
  const canScan = useHasCapability("qr_task_start");
  const task = state.tasks.find((t) => t.id === taskId);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraSlotKey, setCameraSlotKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
      </Screen>
    );
  }

  // Same gate as the task detail screen (see tasks/[taskId]/index.tsx) -
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
            <Button style={styles.clockInPromptButton} onPress={() => router.push(scanPath as never)}>
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
  // (see tasks/[taskId]/index.tsx) - the backend hard-blocks add_evidence
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

  // `task` is narrowed above; the closures below need a name that stays narrowed.
  const currentTask = task;
  const stage = taskStage(currentTask);
  const slots = evidenceSlots(currentTask, stage);
  const issueSlot = slots.find((slot) => slot.kind === "issue");
  const photoSlots = slots.filter((slot) => slot.kind !== "issue");

  // One card per checklist item (its Before / After tiles side by side); photos
  // that belong to the task as a whole share a card of their own.
  const groups: { key: string; title: string; subtitle?: string; slots: EvidenceSlot[]; itemId?: string }[] = [];
  for (const slot of photoSlots) {
    const key = slot.checklistItemId ?? "task";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        title: slot.checklistItemId ? (currentTask.checklist.find((c) => c.id === slot.checklistItemId)?.label ?? slot.label) : "Task photos",
        subtitle: slot.sectionName,
        slots: [],
        itemId: slot.checklistItemId,
      };
      groups.push(group);
    }
    group.slots.push(slot);
  }
  const requiredTotal = photoSlots.reduce((n, slot) => n + (slot.required ?? 0), 0);
  const takenTotal = photoSlots.reduce((n, slot) => n + (slot.required === null ? 0 : Math.min(slot.taken, slot.required)), 0);

  const cameraSlot = cameraSlotKey ? (slots.find((slot) => slot.key === cameraSlotKey) ?? null) : null;

  async function openCamera(slot: EvidenceSlot) {
    if (!slot.unlocked) {
      appAlert("Not yet", slot.lockedReason ?? "This photo isn't available yet.");
      return;
    }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        appAlert("Camera needed", "Allow camera access to capture task evidence.");
        return;
      }
    }
    setCameraSlotKey(slot.key);
  }

  async function capture() {
    if (!cameraRef.current || busy || !state.accessToken || !cameraSlot) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      if (!photo?.uri) return;
      // A checklist item's photo is labelled with the item and sent with its
      // id, so the server ties the image to exactly that item.
      const label = cameraSlot.checklistItemId
        ? `${currentTask.checklist.find((c) => c.id === cameraSlot.checklistItemId)?.label ?? cameraSlot.label} - ${tileTitle(cameraSlot)}`
        : cameraSlot.kind === "before"
          ? "Before photo"
          : cameraSlot.kind === "after"
            ? "After photo"
            : cameraSlot.kind === "evidence"
              ? "Evidence"
              : "Issue photo";
      const filePath = await uploadImage(state.accessToken, photo.uri, `${cameraSlot.kind}-${Date.now()}.jpg`);
      const updatedTask = await addTaskEvidence(state.accessToken, currentTask.id, {
        kind: cameraSlot.kind,
        checklistItemId: cameraSlot.checklistItemId,
        label,
        filePath,
        liveCapture: true,
        offlineOriginated: state.connectivity === "offline",
      });
      dispatch({ type: "UPDATE_TASK", taskId: currentTask.id, patch: updatedTask });
      // Stay in the camera only while this slot still wants more photos.
      const after = evidenceSlots(updatedTask, taskStage(updatedTask)).find((slot) => slot.key === cameraSlot.key);
      if (!after || after.required === null || after.taken >= after.required) setCameraSlotKey(null);
    } catch (error) {
      appAlert("Could not save the photo", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Capture evidence" backTo={`/tasks/${currentTask.id}`}>
      <Text style={styles.helpText}>
        Live capture only. Tap a photo to take it.
        {requiredTotal > 0 ? `  ${takenTotal} of ${requiredTotal} taken.` : ""}
      </Text>

      {groups.map((group) => (
        <Card
          key={group.key}
          style={[styles.group, group.itemId && group.itemId === requestedItem && styles.groupHighlight]}
        >
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle} numberOfLines={2}>
              {group.title}
            </Text>
            {group.subtitle && <Text style={styles.mutedSmall}>{group.subtitle}</Text>}
          </View>
          <View style={styles.tiles}>
            {group.slots.map((slot) => {
              const latest = evidenceForSlot(currentTask.evidence, slot)[0];
              const uri = latest ? (fileUrl(latest.filePath) ?? latest.uri) : undefined;
              const complete = slot.required !== null ? slot.taken >= slot.required : slot.taken > 0;
              const locked = !slot.unlocked;
              return (
                <Pressable
                  key={slot.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.title} ${tileTitle(slot)}${locked ? ", locked" : ""}`}
                  onPress={() => void openCamera(slot)}
                  style={[styles.tile, locked && styles.tileLocked, complete && styles.tileDone]}
                >
                  {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : null}
                  <View style={[styles.tileOverlay, uri ? styles.tileOverlayOnPhoto : null]}>
                    <Ionicons
                      name={locked ? "lock-closed-outline" : complete ? "checkmark-circle" : "camera-outline"}
                      size={22}
                      color={uri ? colors.white : complete ? colors.success : colors.mutedForeground}
                    />
                    <Text style={[styles.tileTitle, uri && styles.onPhoto]}>{tileTitle(slot)}</Text>
                    {slot.required !== null && (
                      <Text style={[styles.tileCount, uri && styles.onPhoto]}>{slotProgress(slot)}</Text>
                    )}
                    {locked && slot.lockedReason && (
                      <Text style={styles.tileHint} numberOfLines={2}>
                        {slot.lockedReason}
                      </Text>
                    )}
                    {!locked && uri && <Text style={[styles.tileHint, styles.onPhoto]}>Tap to retake</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ))}

      {issueSlot && (
        <Button
          variant="outline"
          disabled={!issueSlot.unlocked}
          icon={<Ionicons name="alert-circle-outline" size={16} color={colors.foreground} />}
          // An issue is a real problem a supervisor has to triage, not a photo
          // filed on this task: it opens the incident report, linked to this
          // task and its room.
          onPress={() => router.push(`/incidents/new?locationId=${currentTask.locationId ?? ""}&taskId=${currentTask.id}`)}
        >
          Report an issue
        </Button>
      )}

      <Button style={styles.doneButton} onPress={() => router.push(`/tasks/${currentTask.id}`)}>
        Done
      </Button>

      <Modal visible={cameraSlot !== null} animationType="slide" onRequestClose={() => setCameraSlotKey(null)}>
        <View style={styles.cameraScreen}>
          {cameraSlot && (
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          )}
          <View pointerEvents="none" style={styles.reticle} />
          <View style={[styles.cameraTop, { paddingTop: insets.top + spacing.sm }]}>
            <View style={styles.cameraTitleWrap}>
              <Text style={styles.cameraTitle} numberOfLines={1}>
                {cameraSlot?.checklistItemId
                  ? (currentTask.checklist.find((c) => c.id === cameraSlot.checklistItemId)?.label ?? cameraSlot.label)
                  : cameraSlot?.label}
              </Text>
              {cameraSlot && (
                <Text style={styles.cameraSub}>
                  {tileTitle(cameraSlot)}
                  {cameraSlot.required !== null ? ` - ${slotProgress(cameraSlot)}` : ""}
                </Text>
              )}
            </View>
            <Pressable accessibilityLabel="Close camera" onPress={() => setCameraSlotKey(null)} style={styles.cameraClose}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>
          <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              disabled={busy}
              onPress={() => void capture()}
              style={[styles.shutter, busy && styles.shutterBusy]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
          </View>
          {busy && (
            <View style={styles.captureOverlay}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.captureOverlayText}>Saving photo…</Text>
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  mutedSmall: { fontSize: typography.small, color: colors.mutedForeground },
  helpText: { fontSize: typography.small, color: colors.mutedForeground, marginBottom: spacing.md },
  group: { marginBottom: spacing.md, gap: spacing.sm },
  groupHighlight: { borderColor: colors.primary, borderWidth: 2 },
  groupHeader: { gap: 2 },
  groupTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: {
    flex: 1,
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  tileLocked: { opacity: 0.55 },
  tileDone: { borderColor: colors.success },
  tileOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, padding: spacing.sm },
  tileOverlayOnPhoto: { backgroundColor: "rgba(0,0,0,0.35)" },
  tileTitle: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
  tileCount: { fontSize: typography.tiny, fontWeight: "600", color: colors.mutedForeground },
  tileHint: { fontSize: typography.tiny, color: colors.mutedForeground, textAlign: "center" },
  onPhoto: { color: colors.white },
  doneButton: { marginTop: spacing.md },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  reticle: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "28%",
    bottom: "28%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: radius.lg,
  },
  cameraTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cameraTitleWrap: { flex: 1, minWidth: 0 },
  cameraTitle: { color: colors.white, fontSize: typography.body, fontWeight: "700" },
  cameraSub: { color: "rgba(255,255,255,0.8)", fontSize: typography.small },
  cameraClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  cameraBottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingTop: spacing.md },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white },
  captureOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  captureOverlayText: { color: colors.white, fontSize: typography.small },
  clockInPromptCard: { marginTop: spacing.md, alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  clockInPromptIcon: { marginBottom: spacing.xs },
  clockInPromptTitle: { fontSize: typography.h2, fontWeight: "700", color: colors.foreground, textAlign: "center" },
  clockInPromptText: { textAlign: "center" },
  clockInPromptButton: { marginTop: spacing.sm, alignSelf: "stretch" },
}));
