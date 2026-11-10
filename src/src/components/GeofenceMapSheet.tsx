import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GeofenceDistanceMap } from "@/components/GeofenceDistanceMap";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";

/** What the server sends when a clock event is refused for being outside the site's radius. */
export interface GeofenceDetail {
  distanceMeters: number;
  radiusMeters: number;
  deviceLatitude: number;
  deviceLongitude: number;
  siteLatitude: number;
  siteLongitude: number;
}

/** The detail, only when it has everything needed to draw the map. */
export function asGeofenceDetail(detail: Record<string, unknown> | undefined): GeofenceDetail | undefined {
  if (
    detail &&
    typeof detail.distanceMeters === "number" &&
    typeof detail.radiusMeters === "number" &&
    typeof detail.deviceLatitude === "number" &&
    typeof detail.deviceLongitude === "number" &&
    typeof detail.siteLatitude === "number" &&
    typeof detail.siteLongitude === "number"
  ) {
    return detail as unknown as GeofenceDetail;
  }
  return undefined;
}

/** "Too far from <site>" bottom sheet with the distance map. */
export function GeofenceMapSheet({
  detail,
  siteName,
  hint = "Move within the shaded circle and try again. The map uses free OpenStreetMap data.",
  onClose,
}: {
  detail: GeofenceDetail | null;
  siteName?: string;
  hint?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={Boolean(detail)} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Too far from {siteName ?? "the site"}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close map" hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{hint}</Text>
        {detail && (
          <GeofenceDistanceMap
            deviceLatitude={detail.deviceLatitude}
            deviceLongitude={detail.deviceLongitude}
            siteLatitude={detail.siteLatitude}
            siteLongitude={detail.siteLongitude}
            radiusMeters={detail.radiusMeters}
            distanceMeters={detail.distanceMeters}
            siteName={siteName}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    title: { flex: 1, fontSize: typography.h2, fontWeight: "700", color: colors.foreground },
    subtitle: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
