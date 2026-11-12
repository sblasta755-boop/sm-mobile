import { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "@/components/Button";
import { uploadImage, fileUrl } from "@/api/client";
import { prepareEvidencePhoto } from "@/services/photoPrep";
import { appAlert } from "@/components/Dialog";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/**
 * Live camera capture that uploads each photo straight away and hands back where it was stored.
 *
 * Live capture only, like every other evidence path in the app: a photo of a fault or of a quotation
 * is taken there and then. Unlike incident reports it is NOT queued for later; maintenance needs a
 * connection to submit, so an upload that fails says so and nothing is silently lost.
 */
export function PhotoCapture({
  token,
  files,
  onChange,
  label = "Take photo",
  max = 10,
}: {
  token: string;
  files: string[];
  onChange: (next: string[]) => void;
  label?: string;
  max?: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  async function open() {
    if (files.length >= max) return;
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  // The prepared photo that could not be sent (no signal, session renewing). Kept on the phone so the person can
  // retry instead of retaking it.
  const [unsent, setUnsent] = useState<string | null>(null);

  async function send(uri: string) {
    setUploading(true);
    try {
      const filePath = await uploadImage(token, uri, `maintenance_${Date.now()}.jpg`);
      onChange([...files, filePath]);
      setUnsent(null);
    } catch (error) {
      setUnsent(uri);
      appAlert(
        "Photo not sent",
        `${error instanceof Error ? error.message : "Check your connection."} Your photo is kept: tap Retry.`,
      );
    } finally {
      setUploading(false);
    }
  }

  async function capture() {
    if (!cameraRef.current || uploading) return;
    setUploading(true);
    let small: string | null = null;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false, skipProcessing: true });
      if (!photo?.uri) return;
      small = await prepareEvidencePhoto(photo.uri, photo.width, photo.height);
    } catch (error) {
      appAlert("Photo not taken", error instanceof Error ? error.message : "Try again.");
      return;
    } finally {
      setUploading(false);
    }
    if (small) await send(small);
  }

  return (
    <View style={styles.wrap}>
      {unsent && (
        <View style={styles.unsent}>
          <Image source={{ uri: unsent }} style={styles.unsentThumb} />
          <View style={styles.unsentText}>
            <Text style={styles.unsentTitle}>Not sent yet</Text>
            <Text style={styles.unsentHint}>The photo is kept on this phone.</Text>
          </View>
          <Button fullWidth={false} variant="outline" disabled={uploading} loading={uploading} onPress={() => send(unsent)}>
            Retry
          </Button>
          <Button fullWidth={false} variant="ghost" disabled={uploading} onPress={() => setUnsent(null)}>
            Discard
          </Button>
        </View>
      )}
      {cameraOn ? (
        <View style={styles.frame}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          {uploading && (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.overlayText}>Uploading photo…</Text>
            </View>
          )}
          <View style={styles.actions}>
            <Button variant="outline" style={styles.action} disabled={uploading || !!unsent || files.length >= max} loading={uploading} onPress={capture}>
              Take photo
            </Button>
            <Button variant="outline" style={styles.action} onPress={() => setCameraOn(false)}>
              Close
            </Button>
          </View>
        </View>
      ) : (
        files.length < max && (
          <Button variant="outline" onPress={open}>
            {label}
          </Button>
        )
      )}
      {permission && !permission.granted && !permission.canAskAgain && (
        <Text style={styles.error}>Camera access is required. Allow it in the phone&apos;s settings.</Text>
      )}
      {files.length > 0 && (
        <View style={styles.row}>
          {files.map((filePath) => (
            <View key={filePath} style={styles.thumbWrap}>
              <Image source={{ uri: fileUrl(filePath) }} style={styles.thumb} />
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => onChange(files.filter((f) => f !== filePath))}
                style={styles.remove}
              >
                <Ionicons name="close" size={12} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    frame: { aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#020617" },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      backgroundColor: colors.overlay,
    },
    overlayText: { fontSize: typography.small, fontWeight: "600", color: colors.white },
    actions: { position: "absolute", bottom: 8, left: 8, right: 8, flexDirection: "row", gap: spacing.sm },
    action: { flex: 1 },
    error: { color: colors.destructive, fontSize: typography.tiny },
    unsent: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.destructive,
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    unsentThumb: { width: 48, height: 48, borderRadius: radius.md },
    unsentText: { flex: 1 },
    unsentTitle: { fontSize: typography.small, fontWeight: "700", color: colors.foreground },
    unsentHint: { fontSize: typography.tiny, color: colors.mutedForeground },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    thumbWrap: { width: 64, height: 64 },
    thumb: { width: "100%", height: "100%", borderRadius: radius.md },
    remove: {
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
  }),
);
