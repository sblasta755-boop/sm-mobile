import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { fileUrl, updateFloorPlanImage, uploadImage } from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Photo of an existing paper/printed floor plan, used as the visual
 * canvas's backdrop image - the lightest of the three mobile site-layout
 * flows, since it's almost entirely wiring an existing endpoint
 * (POST /upload/images) plus the read-modify-write updateFloorPlanImage
 * already documents. Unlike incidents/new.tsx's evidence photos, a
 * floor-plan photo isn't proof of a live condition, so - like
 * profile.tsx's avatar picker - both a gallery pick and a live capture
 * are legitimate here.
 */
export default function PhotoBackdropScreen() {
  const { siteId, floorId } = useLocalSearchParams<{ siteId: string; floorId: string }>();
  const { state, refreshBackendData } = useSmartClean();
  const site = state.sites.find((s) => s.id === siteId);
  const floor = site?.profile?.floors.find((f) => f.id === floorId);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedDimensions, setPickedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedDimensions({ width: asset.width, height: asset.height });
    setCameraOn(false);
  }

  async function startCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  const cameraRef = useRef<CameraView | null>(null);

  async function capturePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false, skipProcessing: true });
    if (!photo?.uri) return;
    setPickedUri(photo.uri);
    setPickedDimensions({ width: photo.width, height: photo.height });
    setCameraOn(false);
  }

  async function save() {
    if (!site || !floor || !pickedUri || !pickedDimensions || !state.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const filePath = await uploadImage(state.accessToken, pickedUri, `floor-plan-${Date.now()}.jpg`, "image/jpeg");
      await updateFloorPlanImage(state.accessToken, site, floor.id, {
        filePath,
        width: pickedDimensions.width,
        height: pickedDimensions.height,
        uploadedAt: new Date().toISOString(),
      });
      await refreshBackendData();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the floor plan");
    } finally {
      setBusy(false);
    }
  }

  if (!site || !floor) {
    return (
      <Screen title="Photo backdrop">
        <Card>
          <Text style={styles.emptyText}>Floor not found.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={`Photo backdrop — ${floor.name}`}>
      <Text style={styles.hint}>
        Take a photo of an existing floor plan, or pick one from your library. It becomes the
        backdrop rooms are arranged on when positioning is done from the web console.
      </Text>

      {cameraOn ? (
        <Card style={styles.cameraCard} padded={false}>
          <CameraView ref={cameraRef} style={styles.camera} />
          <View style={styles.cameraActions}>
            <Button
              variant="ghost"
              onPress={() => setCameraOn(false)}
              fullWidth={false}
              style={styles.cameraActionButton}
            >
              Cancel
            </Button>
            <Button onPress={capturePhoto} fullWidth={false} style={styles.cameraActionButton}>
              Capture
            </Button>
          </View>
        </Card>
      ) : pickedUri ? (
        <Card style={styles.previewCard}>
          <Image source={{ uri: pickedUri }} style={styles.preview} resizeMode="contain" />
          <Button variant="outline" onPress={() => { setPickedUri(null); setPickedDimensions(null); }}>
            Choose a different photo
          </Button>
        </Card>
      ) : (
        <View style={styles.pickRow}>
          <Button
            variant="outline"
            icon={<Ionicons name="camera-outline" size={16} color={colors.foreground} />}
            onPress={startCamera}
            fullWidth={false}
            style={styles.pickButton}
          >
            Take photo
          </Button>
          <Button
            variant="outline"
            icon={<Ionicons name="images-outline" size={16} color={colors.foreground} />}
            onPress={pickFromLibrary}
            fullWidth={false}
            style={styles.pickButton}
          >
            Choose from library
          </Button>
        </View>
      )}

      {floor.planImage && !pickedUri && (
        <Card style={styles.previewCard}>
          <Text style={styles.currentLabel}>Current backdrop</Text>
          <Image source={{ uri: fileUrl(floor.planImage.filePath) }} style={styles.preview} resizeMode="contain" />
        </Card>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {pickedUri && (
        <Button onPress={save} loading={busy} style={styles.saveButton}>
          Save floor plan
        </Button>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  pickRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pickButton: {
    flex: 1,
  },
  previewCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  currentLabel: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  cameraCard: {
    marginTop: spacing.md,
    overflow: "hidden",
  },
  camera: {
    width: "100%",
    height: 320,
  },
  cameraActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.sm,
    gap: spacing.sm,
  },
  cameraActionButton: {
    flex: 1,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: typography.small,
    color: colors.destructive,
  },
  saveButton: {
    marginTop: spacing.md,
  },
});
