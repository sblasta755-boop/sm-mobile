import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Device from "expo-device";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { scanStaffOnboardingCode } from "@/api/client";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Where a new employee scans the code their manager is showing them.
 *
 * The staff counterpart to onboard-scan.tsx. Separate screens rather
 * than one with a mode flag, because they hit different endpoints with
 * different authorisation and different copy - and because the two flows
 * must stay distinguishable: the backend refuses an organisation code
 * presented here, and vice versa (see expected_kind on
 * find_by_scan_value).
 *
 * Reached from the login screen. By definition nobody here can sign in
 * yet: their account exists but holds a password nobody has seen.
 */
export default function StaffOnboardScan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The camera fires repeatedly while a code stays in frame. Without
  // this, one scan becomes a burst of POSTs and every one after the
  // first loses the race it just won.
  const claimed = useRef(false);

  const onScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      if (claimed.current || busy) return;
      claimed.current = true;
      setBusy(true);
      setError(null);
      try {
        const deviceLabel =
          [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || Platform.OS;
        const scan = await scanStaffOnboardingCode(result.data, deviceLabel);
        router.replace({
          pathname: "/staff-onboard-waiting",
          params: {
            claimId: scan.claimId,
            claimSecret: scan.claimSecret,
            matchWord: scan.matchWord,
            organisationName: scan.organisationName ?? "",
            firstName: scan.staffFirstName ?? "",
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "That code didn't work.");
        claimed.current = false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Checking camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Card style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={32} color={colors.primary} />
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.muted}>
            Šoma360 uses the camera only to read the code your manager is showing you.
          </Text>
          <Button onPress={() => void requestPermission()}>Allow camera</Button>
          <Button variant="ghost" onPress={() => router.replace("/login")}>
            Back to sign in
          </Button>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : (result) => void onScanned(result)}
      />

      <View style={[styles.overlay, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          onPress={() => router.replace("/login")}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={20} color={colors.white} />
        </Pressable>

        <View style={styles.reticle} />

        <Card style={styles.instructions}>
          <Text style={styles.title}>Scan to join your team</Text>
          <Text style={styles.muted}>
            {busy
              ? "Checking the code…"
              : "Point the camera at the QR code your manager is showing you."}
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.black,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reticle: {
    alignSelf: "center",
    width: 240,
    height: 240,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.white,
    opacity: 0.85,
  },
  instructions: {
    gap: spacing.xs,
  },
  permissionCard: {
    gap: spacing.md,
    alignItems: "center",
  },
  title: {
    fontSize: typography.h2,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
  },
  muted: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 19,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.destructive,
    textAlign: "center",
  },
});
