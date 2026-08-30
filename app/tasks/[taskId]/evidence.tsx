import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { addTaskEvidence, fileUrl, uploadImage } from "@/api/client";
import { taskStage } from "@/domain/status";
import { colors, radius, spacing, typography } from "@/theme";
import type { Evidence } from "@/types/smartclean";

export default function EvidenceScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, dispatch } = useSmartClean();
  const task = state.tasks.find((t) => t.id === taskId);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
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
  if (taskIsWorkable && task.clockedIn === false) {
    return (
      <Screen title="Capture evidence">
        <Card style={styles.clockInPromptCard}>
          <Ionicons name="camera-outline" size={28} color={colors.primary} style={styles.clockInPromptIcon} />
          <Text style={styles.clockInPromptTitle}>Clock in to capture evidence</Text>
          <Text style={[styles.mutedSmall, styles.clockInPromptText]}>
            Scan your site&apos;s QR code to clock in before capturing task evidence.
          </Text>
          <Button style={styles.clockInPromptButton} onPress={() => router.push("/scan")}>
            Go to Scan
          </Button>
          <Button variant="outline" style={styles.clockInPromptButton} onPress={() => router.push(`/tasks/${task.id}`)}>
            Back to task
          </Button>
        </Card>
      </Screen>
    );
  }

  // Gamified capture order: Before is the only shot available until it's
  // taken (stage "scan"/"before"); After and Issue only unlock once the
  // checklist itself is fully done (stage "finish") — see
  // domain/status.ts's taskStage for the full sequence this mirrors on
  // the task detail screen.
  const stage = taskStage(task);
  const beforeTaken = task.evidence.some((e) => e.kind === "before");
  const canCaptureBefore = !beforeTaken;
  const canCaptureAfterOrIssue = stage === "finish";

  async function startCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  async function capture(kind: Evidence["kind"]) {
    if (!cameraOn || !cameraRef.current || busy || !task || !state.accessToken) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      if (!photo?.uri) return;
      const label = kind === "before" ? "Before photo" : kind === "after" ? "After photo" : "Issue photo";
      const filePath = await uploadImage(state.accessToken, photo.uri, `${kind}-${Date.now()}.jpg`);
      const updatedTask = await addTaskEvidence(state.accessToken, task.id, {
        kind,
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
    <Screen title="Capture evidence">
      <Text style={styles.helpText}>
        Live capture only — gallery uploads disabled for this task. Photos include time, device and location
        metadata.
      </Text>

      <View style={styles.cameraFrame}>
        {cameraOn ? (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View pointerEvents="none" style={styles.reticle} />
          </>
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.85)" />
            <Text style={styles.cameraHint}>Open camera for evidence</Text>
            <Text style={styles.cameraSubHint}>Gallery uploads are disabled.</Text>
            {permission && !permission.granted && (
              <Text style={styles.cameraError}>Camera access is required to capture evidence.</Text>
            )}
            <Button style={styles.startButton} onPress={startCamera}>
              Start camera
            </Button>
          </View>
        )}
      </View>

      <View style={styles.captureRow}>
        <Button
          variant="outline"
          style={styles.captureButton}
          disabled={!cameraOn || busy || !canCaptureBefore}
          onPress={() => capture("before")}
        >
          Before
        </Button>
        <Button
          style={styles.captureButton}
          disabled={!cameraOn || busy || !canCaptureAfterOrIssue}
          onPress={() => capture("after")}
        >
          After
        </Button>
        <Button
          variant="outline"
          style={styles.captureButton}
          disabled={!cameraOn || busy || !canCaptureAfterOrIssue}
          onPress={() => capture("issue")}
        >
          Issue
        </Button>
      </View>

      {!canCaptureAfterOrIssue && (
        <Text style={styles.stageHint}>
          {!beforeTaken
            ? "Take the Before photo first, then work through the checklist."
            : "After and Issue photos unlock once the checklist is complete."}
        </Text>
      )}

      <Text style={styles.sectionTitle}>{`Captured (${task.evidence.length})`}</Text>
      <View style={styles.list}>
        {task.evidence.length === 0 && <Text style={styles.mutedSmall}>No evidence captured yet.</Text>}
        {task.evidence.map((e) => (
          <Card key={e.id} style={styles.evidenceCard}>
            {fileUrl(e.filePath) ?? e.uri ? (
              <Image source={{ uri: fileUrl(e.filePath) ?? e.uri }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.neutral }]} />
            )}
            <View style={styles.evidenceInfo}>
              <Text style={styles.evidenceLabel}>{e.label}</Text>
              <Text style={styles.evidenceMeta}>
                {new Date(e.capturedAt).toLocaleString("en-ZA")} • {e.device}
                {e.offlineOriginated ? " • Offline" : ""}
              </Text>
              {e.duplicateOf && (
                <View style={styles.dupRow}>
                  <Ionicons name="warning-outline" size={11} color={colors.warningForeground} />
                  <Text style={styles.dupText}>Duplicate — supervisor review flagged</Text>
                </View>
              )}
            </View>
          </Card>
        ))}
      </View>

      <Button style={styles.backButton} onPress={() => router.push(`/tasks/${task.id}`)}>
        Back to task
      </Button>
    </Screen>
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
  cameraFrame: {
    aspectRatio: 16 / 9,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: "#020617",
    marginBottom: spacing.md,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: 4,
  },
  cameraHint: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  cameraSubHint: {
    color: "rgba(255,255,255,0.65)",
    fontSize: typography.tiny,
  },
  cameraError: {
    color: "#fca5a5",
    fontSize: typography.tiny,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  startButton: {
    marginTop: spacing.md,
    width: 160,
  },
  reticle: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  captureRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  captureButton: {
    flex: 1,
  },
  stageHint: {
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
    fontSize: typography.tiny,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  evidenceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  evidenceInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  evidenceLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.foreground,
    textTransform: "capitalize",
  },
  evidenceMeta: {
    fontSize: 10,
    color: colors.mutedForeground,
  },
  dupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  dupText: {
    fontSize: 10,
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
