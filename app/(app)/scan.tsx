import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge, VerifiedBadge } from "@/components/StatusBadge";
import { useSmartClean } from "@/features/store";
import { nowIso } from "@/services/ids";
import { colors, radius, spacing, typography } from "@/theme";

interface ScanResult {
  code: string;
  ok: boolean;
  reason?: string;
  linkedName?: string;
  taskId?: string;
  kind?: string;
}

const SUGGESTIONS = ["SITE-SBP-001", "ROOM-SBP-BTH-02", "ZONE-SBP-REC-01", "STOCK-SBP-001"];

function extractCode(raw: string): string {
  const match = raw.match(/\/scan\/([^/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toUpperCase();
  return raw.trim().toUpperCase();
}

export default function ScanScreen() {
  const { state, dispatch, currentUser } = useSmartClean();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [approval, setApproval] = useState<{ siteName: string; at: string } | null>(null);
  const scanLockRef = useRef(false);

  const clocked = currentUser ? state.attendance[currentUser.id]?.clockedInAt : undefined;

  const scan = useCallback(
    (rawCode: string) => {
      const code = extractCode(rawCode);
      setRecent((r) => [code, ...r.filter((c) => c !== code)].slice(0, 4));

      const qr = state.qrCodes.find((q) => q.code === code);

      if (!qr) {
        setResult({ code, ok: false, reason: "Unknown QR code. Verify with your supervisor." });
        return;
      }
      if (!qr.active) {
        setResult({ code, ok: false, reason: "This QR is inactive or expired." });
        return;
      }

      if (qr.kind === "site") {
        const site = state.sites.find((s) => s.id === qr.targetId);
        if (!site) {
          setResult({ code, ok: false, reason: "Site not found." });
          return;
        }
        const assigned = currentUser?.siteIds.includes(site.id);
        if (!assigned) {
          setResult({ code, ok: false, reason: "You are not assigned to this site." });
          return;
        }
        dispatch({ type: "CLOCK_IN", userId: currentUser!.id, siteId: site.id });
        setResult({ code, ok: true, linkedName: site.name, kind: "site" });
        setApproval({ siteName: site.name, at: nowIso() });
        return;
      }

      if (qr.kind === "room" || qr.kind === "zone") {
        const task = state.tasks.find((t) => t.requiredQr === code && t.assigneeId === currentUser?.id);
        if (!task) {
          setResult({ code, ok: false, reason: "No assigned task for this location right now." });
          return;
        }
        dispatch({ type: "UPDATE_TASK", taskId: task.id, patch: { qrVerified: true } });
        setResult({ code, ok: true, linkedName: qr.targetName, taskId: task.id, kind: qr.kind });
        return;
      }

      setResult({ code, ok: true, linkedName: qr.targetName, kind: qr.kind });
    },
    [state.qrCodes, state.sites, state.tasks, currentUser, dispatch],
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
      </View>

      <Text style={styles.helpText}>
        Point at a SmartClean QR sticker. You can also tap a suggestion or type a code.
      </Text>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} style={styles.suggestionChip} onPress={() => scan(s)}>
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
        <Button style={styles.manualButton} fullWidth={false} onPress={() => manual && scan(manual)}>
          Scan
        </Button>
      </View>

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
              <View style={styles.checklist}>
                <ChecklistLine icon="shield-checkmark" text={`Identity verified — ${currentUser?.name}`} />
                <ChecklistLine
                  icon="time-outline"
                  text={`Timestamp ${new Date().toLocaleTimeString("en-ZA")}`}
                />
                <ChecklistLine icon="location" text="GPS within geofence" />
                <ChecklistLine icon="phone-portrait-outline" text="Device recognised" />
              </View>
              {result.kind === "site" && clocked && (
                <Button style={styles.resultAction} onPress={() => router.push("/home")}>
                  Continue to my tasks
                </Button>
              )}
              {result.taskId && (
                <Button style={styles.resultAction} onPress={() => router.push(`/tasks/${result.taskId}`)}>
                  Open task checklist
                </Button>
              )}
            </View>
          ) : (
            <Text style={styles.resultError}>{result.reason}</Text>
          )}
        </Card>
      )}

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

const styles = StyleSheet.create({
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
    borderColor: "#a8ddc5",
  },
  resultBad: {
    backgroundColor: colors.destructiveSoft,
    borderColor: "#f4aaa4",
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
    borderColor: "#a8ddc5",
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
});
