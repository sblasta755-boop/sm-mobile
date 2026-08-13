import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { newId, nowIso } from "@/services/ids";
import { colors, radius, spacing, typography } from "@/theme";
import type { Evidence } from "@/types/smartclean";

const SEEDS = [11, 27, 42, 58, 73, 88];

export default function EvidenceScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { state, dispatch } = useSmartClean();
  const task = state.tasks.find((t) => t.id === taskId);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seedIdx, setSeedIdx] = useState(0);
  const cameraRef = useRef<CameraView | null>(null);

  if (!task) {
    return (
      <Screen title="Task not found">
        <Text style={styles.mutedSmall}>This task does not exist.</Text>
      </Screen>
    );
  }

  async function startCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  async function capture(kind: Evidence["kind"]) {
    if (!cameraOn || !cameraRef.current || busy || !task) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      const seed = SEEDS[seedIdx % SEEDS.length];
      const dup = task.evidence.find((e) => e.imgSeed === seed);
      dispatch({
        type: "ADD_EVIDENCE",
        taskId: task.id,
        evidence: {
          id: newId("ev"),
          taskId: task.id,
          kind,
          label: kind === "before" ? "Before photo" : kind === "after" ? "After photo" : "Issue photo",
          capturedAt: nowIso(),
          device: "Mobile app",
          offlineOriginated: state.connectivity === "offline",
          duplicateOf: dup?.id,
          imgSeed: seed,
          uri: photo?.uri,
        },
      });
      setSeedIdx((i) => i + 1);
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
        <Button variant="outline" style={styles.captureButton} disabled={!cameraOn || busy} onPress={() => capture("before")}>
          Before
        </Button>
        <Button style={styles.captureButton} disabled={!cameraOn || busy} onPress={() => capture("after")}>
          After
        </Button>
        <Button variant="outline" style={styles.captureButton} disabled={!cameraOn || busy} onPress={() => capture("issue")}>
          Issue
        </Button>
      </View>

      <Text style={styles.sectionTitle}>{`Captured (${task.evidence.length})`}</Text>
      <View style={styles.list}>
        {task.evidence.length === 0 && <Text style={styles.mutedSmall}>No evidence captured yet.</Text>}
        {task.evidence.map((e) => (
          <Card key={e.id} style={styles.evidenceCard}>
            {e.uri ? (
              <Image source={{ uri: e.uri }} style={styles.thumb} />
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
            <Pressable
              accessibilityLabel="Delete evidence"
              onPress={() => dispatch({ type: "REMOVE_EVIDENCE", taskId: task.id, evidenceId: e.id })}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={18} color={colors.mutedForeground} />
            </Pressable>
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
});
