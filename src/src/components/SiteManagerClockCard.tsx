import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { useHasCapability, useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";
import { colors, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

/**
 * Clock in and out for a site manager, when their organisation has switched that on (the platform operator's
 * "Site managers clock in and out" setting). Renders nothing otherwise; the server refuses the clock-in too.
 */
export function SiteManagerClockCard() {
  useThemeVersion();
  const { state, currentUser } = useSmartClean();
  const hasAttendance = useHasModule("attendance");
  const canScanClock = useHasCapability("qr_attendance");
  const hasQr = useHasCapability("qr_codes");
  if (currentUser?.role !== "site_manager" || !state.tenant?.siteManagerClockEnabled) return null;
  if (!hasAttendance || !canScanClock || !hasQr) return null;
  const clocked = state.attendance[currentUser.id]?.clockedInAt;
  const site = state.sites.find((s) => currentUser.siteIds.includes(s.id));
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Today&apos;s shift</Text>
          {site?.name ? <Text style={styles.sub}>{site.name}</Text> : null}
        </View>
        <StatusBadge tone={clocked ? "success" : "neutral"} label={clocked ? "Clocked in" : "Not clocked in"} />
      </View>
      {clocked ? (
        <Text style={styles.sub}>
          Clocked in at {new Date(clocked).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      ) : null}
      <Button
        variant={clocked ? "outline" : "primary"}
        icon={<Ionicons name={clocked ? "log-out-outline" : "scan"} size={18} color={clocked ? colors.foreground : colors.primaryForeground} />}
        onPress={() => router.push("/site-manager-scan")}
      >
        {clocked ? "Scan site QR to clock out" : "Scan site QR to clock in"}
      </Button>
    </Card>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    card: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    title: { fontSize: typography.body, fontWeight: "700", color: colors.foreground },
    sub: { fontSize: typography.small, color: colors.mutedForeground },
  }),
);
