import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import Svg, { Path } from "react-native-svg";
import { Button } from "@/components/Button";
import { PhotoCapture } from "@/components/PhotoCapture";
import { SignatureDrawer } from "@/components/SignatureDrawer";
import { appAlert } from "@/components/Dialog";
import { resolveVerificationScan } from "@/api/client";
import { nameFieldCopy, strokesToPath } from "@/domain/signoff";
import {
  photoLimits,
  referenceFromScan,
  signoffMode,
  signoffStepProblems,
  type VerificationAnswerDraft,
  type VerificationStep,
} from "@/domain/verification";
import { colors, radius, spacing, themedStyles, typography, useThemeVersion } from "@/theme";

interface StepProps {
  step: VerificationStep;
  answer: VerificationAnswerDraft | undefined;
  token: string;
  /** The signed-in person's name, for a sign-off that must match their account. */
  accountName: string;
  onChange: (next: VerificationAnswerDraft) => void;
}

/** The input for one step of a workflow, chosen by the step's component type. */
export function StepBody(props: StepProps) {
  useThemeVersion();
  const { step } = props;
  return (
    <View style={styles.body}>
      <Text style={styles.label}>
        {step.label}
        {!step.required && step.type !== "confirm" ? "  (optional)" : ""}
      </Text>
      {step.helpText ? <Text style={styles.help}>{step.helpText}</Text> : null}
      {step.type === "photo" && <PhotoStep {...props} />}
      {step.type === "text" && <TextStep {...props} />}
      {step.type === "note" && <TextStep {...props} multiline />}
      {step.type === "confirm" && <ConfirmStep {...props} />}
      {step.type === "scan" && <ScanStep {...props} />}
      {step.type === "reference" && <ReferenceStep {...props} />}
      {step.type === "signoff" && <SignoffStep {...props} />}
    </View>
  );
}

function PhotoStep({ step, answer, token, onChange }: StepProps) {
  const { min, max } = photoLimits(step);
  const files = answer?.filePaths ?? [];
  return (
    <View style={styles.gap}>
      <Text style={styles.help}>
        Taken now, with the camera.{" "}
        {min > 0 ? `${min === max ? min : `${min} to ${max}`} photo${max === 1 ? "" : "s"} needed.` : `Up to ${max}.`}
      </Text>
      <PhotoCapture
        token={token}
        files={files}
        max={max}
        label={files.length > 0 ? "Add another photo" : "Take photo"}
        onChange={(filePaths) => onChange({ ...answer, filePaths, capturedAt: new Date().toISOString() })}
      />
    </View>
  );
}

function TextStep({ answer, onChange, multiline }: StepProps & { multiline?: boolean }) {
  return (
    <TextInput
      value={typeof answer?.value === "string" ? answer.value : ""}
      onChangeText={(value) => onChange({ ...answer, value })}
      multiline={multiline}
      numberOfLines={multiline ? 4 : 1}
      maxLength={multiline ? 4000 : 500}
      placeholderTextColor={colors.mutedForeground}
      style={[styles.input, multiline && styles.textarea]}
    />
  );
}

function ConfirmStep({ answer, onChange }: StepProps) {
  const on = answer?.value === true;
  return (
    <View style={styles.confirmRow}>
      <Text style={styles.confirmText}>{on ? "Confirmed" : "Not confirmed yet"}</Text>
      <Switch
        value={on}
        onValueChange={(value) => onChange({ ...answer, value, capturedAt: new Date().toISOString() })}
        accessibilityLabel="Confirm"
      />
    </View>
  );
}

/** Sign with a typed name, a drawn signature or both, as the workflow says (same rules as a task sign-off). */
function SignoffStep({ step, answer, accountName, onChange }: StepProps) {
  const mode = signoffMode(step);
  const requireMatch = step.config.requireNameMatch !== false;
  const given = answer?.signoff ?? { name: "", strokes: [], width: 0, height: 0 };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const copy = nameFieldCopy({ mode, requireNameMatch: requireMatch, accountName });
  const problems = signoffStepProblems(step, answer, accountName);
  const mismatch = given.name.trim() !== "" && problems.includes("The name must match your account name");
  const signed = given.strokes.length > 0;

  return (
    <View style={styles.gap}>
      {mode !== "signature" && (
        <View style={styles.gap}>
          <Text style={styles.help}>{copy.label}</Text>
          <TextInput
            value={given.name}
            onChangeText={(name) =>
              onChange({ ...answer, signoff: { ...given, name }, capturedAt: new Date().toISOString() })
            }
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={160}
            placeholder={copy.placeholder}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, mismatch && styles.inputError]}
          />
          {mismatch && <Text style={styles.error}>The name must match your account name.</Text>}
        </View>
      )}
      {mode !== "name" && (
        <View style={styles.gap}>
          <Text style={styles.help}>Signature</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={signed ? "Change your signature" : "Tap to sign"}
            style={styles.signatureBox}
            onPress={() => setDrawerOpen(true)}
          >
            {signed ? (
              <Svg width="100%" height="100%" viewBox={`0 0 ${given.width} ${given.height}`}>
                <Path
                  d={strokesToPath(given.strokes)}
                  stroke={colors.foreground}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            ) : (
              <View style={styles.signatureEmpty}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
                <Text style={styles.signatureAdd}>Tap to sign</Text>
              </View>
            )}
          </Pressable>
          {signed && (
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange({ ...answer, signoff: { ...given, strokes: [], width: 0, height: 0 } })}
            >
              <Text style={styles.clearLink}>Clear signature</Text>
            </Pressable>
          )}
          <SignatureDrawer
            visible={drawerOpen}
            initial={signed ? { strokes: given.strokes, width: given.width, height: given.height } : null}
            onClose={() => setDrawerOpen(false)}
            onDone={(result) => {
              onChange({
                ...answer,
                signoff: { ...given, strokes: result.strokes, width: result.width, height: result.height },
                capturedAt: new Date().toISOString(),
              });
              setDrawerOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

/** A reference can be typed, scanned or both, as the workflow says. */
function ReferenceStep({ step, answer, token, onChange }: StepProps) {
  const mode = String(step.config.mode ?? "either");
  const value = typeof answer?.value === "string" ? answer.value : "";
  return (
    <View style={styles.gap}>
      {mode !== "scan" && (
        <TextInput
          value={value}
          onChangeText={(next) => onChange({ ...answer, value: next })}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={120}
          placeholder="Type the order number"
          placeholderTextColor={colors.mutedForeground}
          style={styles.input}
        />
      )}
      {mode !== "type" && (
        <ScanBox
          token={token}
          idleLabel={value ? "Scan again" : "Scan the order number"}
          onCode={async (raw) => onChange({ ...answer, value: referenceFromScan(raw), capturedAt: new Date().toISOString() })}
        />
      )}
      {mode === "scan" && value ? (
        <Text style={styles.scanned}>
          Order number: <Text style={styles.scannedStrong}>{value}</Text>
        </Text>
      ) : null}
    </View>
  );
}

function ScanStep({ step, answer, token, onChange }: StepProps) {
  const staffQr = step.config.scanKind === "staff_qr";
  const scan = answer?.scan;
  return (
    <View style={styles.gap}>
      {scan ? (
        <View style={styles.scannedCard}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          <Text style={styles.scanned}>
            {scan.name ? <Text style={styles.scannedStrong}>{scan.name}</Text> : <Text style={styles.scannedStrong}>{scan.value}</Text>}
            {staffQr ? "  (staff QR)" : ""}
          </Text>
        </View>
      ) : null}
      <ScanBox
        token={token}
        idleLabel={scan ? "Scan again" : staffQr ? "Scan the staff QR" : "Scan the code"}
        onCode={async (raw) => {
          if (staffQr) {
            // The server names the person; a code that is not a staff QR is refused here, not at the end.
            const person = await resolveVerificationScan(token, raw);
            onChange({ scan: { value: raw, name: person.name }, capturedAt: new Date().toISOString() });
          } else {
            onChange({ scan: { value: raw.trim() }, capturedAt: new Date().toISOString() });
          }
        }}
      />
    </View>
  );
}

/** A camera that reads one QR code, hands it over, and closes. */
function ScanBox({
  idleLabel,
  onCode,
}: {
  token: string;
  idleLabel: string;
  onCode: (raw: string) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [checking, setChecking] = useState(false);
  const lock = useRef(false);

  const onScanned = useCallback(
    async (event: BarcodeScanningResult) => {
      if (lock.current) return;
      lock.current = true;
      setCameraOn(false);
      setChecking(true);
      try {
        await onCode(event.data);
      } catch (error) {
        appAlert("Could not use that code", error instanceof Error ? error.message : "Try again.");
      } finally {
        setChecking(false);
        // Hold off a moment so the same code is not read twice as the camera closes.
        setTimeout(() => {
          lock.current = false;
        }, 1200);
      }
    },
    [onCode],
  );

  async function open() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  return (
    <View style={styles.gap}>
      {cameraOn ? (
        <View style={styles.frame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
          <View pointerEvents="none" style={styles.reticle} />
          <Pressable style={styles.stop} onPress={() => setCameraOn(false)} accessibilityRole="button">
            <Ionicons name="close" size={14} color={colors.foreground} />
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        </View>
      ) : (
        <Button variant="outline" onPress={open} disabled={checking} loading={checking}>
          {idleLabel}
        </Button>
      )}
      {checking && !cameraOn ? <ActivityIndicator color={colors.primary} /> : null}
      {permission && !permission.granted && !permission.canAskAgain && (
        <Text style={styles.error}>Camera access is required. Allow it in the phone&apos;s settings.</Text>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    body: { gap: spacing.sm },
    gap: { gap: spacing.sm },
    label: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    help: { fontSize: typography.small, color: colors.mutedForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.body,
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    textarea: { minHeight: 96, textAlignVertical: "top" },
    inputError: { borderColor: colors.destructive },
    signatureBox: {
      height: 140,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.sm,
    },
    signatureEmpty: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    signatureAdd: { fontSize: typography.body, fontWeight: "700", color: colors.primary },
    clearLink: { fontSize: typography.small, color: colors.mutedForeground, textDecorationLine: "underline" },
    confirmRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.card,
    },
    confirmText: { fontSize: typography.body, color: colors.foreground },
    frame: { aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#020617" },
    reticle: {
      position: "absolute",
      top: "20%",
      left: "20%",
      right: "20%",
      bottom: "20%",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.85)",
      borderRadius: radius.lg,
    },
    stop: {
      position: "absolute",
      top: 8,
      right: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.round,
    },
    stopText: { fontSize: typography.tiny, color: colors.foreground, fontWeight: "600" },
    scannedCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.card,
    },
    scanned: { fontSize: typography.body, color: colors.foreground },
    scannedStrong: { fontWeight: "700" },
    error: { color: colors.destructive, fontSize: typography.tiny },
  }),
);
