import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSmartClean } from "@/features/store";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { colors, radius, spacing, typography, themedStyles } from "@/theme";
import type { Role } from "@/types/smartclean";

/**
 * The one-time screen a QR-onboarded account sees right after choosing
 * its password - see app/index.tsx's `!state.hasSeenWelcome` redirect.
 *
 * Deliberately the last stop before the role's own home screen rather
 * than a step inside it: every role reaches here through the same
 * onboarding path, so the check belongs in the shared gateway, not
 * duplicated across (app)/(manage)/(supervise)/(audit)/(platform).
 *
 * Dismissing calls markWelcomeSeen(), which flips local state
 * immediately (so this screen cannot show twice even offline) and
 * best-effort tells the backend, which is the real source of truth on
 * the next login or refresh.
 */
const COPY: Record<Role, { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  cleaner: {
    icon: "sparkles",
    title: "You're all set up",
    body: "Scan a site QR code to clock in, work through your assigned tasks, and log evidence as you go - everything syncs even if you lose signal on site.",
  },
  waiter: {
    icon: "restaurant",
    title: "You're all set up",
    body: "Scan a site QR code to clock in, then scan a table's QR to open a table session - show the customer QR, handle requests, and log your cleaning tasks as you go.",
  },
  supervisor: {
    icon: "shield-checkmark",
    title: "You're all set up",
    body: "Review submitted work, run inspections, and raise corrective actions when something needs fixing - all from the sites assigned to you.",
  },
  site_manager: {
    icon: "business",
    title: "You're all set up",
    body: "Keep an eye on your sites: staffing, attendance, task completion, and any incidents that come in - scoped to the locations you manage.",
  },
  operations_manager: {
    icon: "bar-chart",
    title: "You're all set up",
    body: "Track performance across every site, manage staff and schedules, and stay ahead of incidents and corrective actions as they happen.",
  },
  org_admin: {
    icon: "shield",
    title: "Welcome to Šoma360",
    body: "Your organisation is live. From here you can add sites and staff, configure how your teams work, and see everything happening across your business.",
  },
  system_admin: {
    icon: "server",
    title: "Welcome to the console",
    body: "You have platform-level access to every organisation on Šoma360. Use it to support and administer tenants from the operator console.",
  },
  client_auditor: {
    icon: "eye",
    title: "You're all set up",
    body: "You have read-only access to review site quality: dashboards, reports, and inspection results for the sites you've been given visibility into.",
  },
};

export default function Welcome() {
  const { currentUser, markWelcomeSeen } = useSmartClean();
  const insets = useSafeAreaInsets();
  const copy = COPY[currentUser?.role ?? "cleaner"];

  const dismiss = () => {
    void markWelcomeSeen();
    router.replace("/");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.brandBlock}>
        <Image source={require("../assets/logo-mark.png")} style={styles.logoImage} resizeMode="contain" />
      </View>

      <Card style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name={copy.icon} size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>
          {currentUser?.name ? `${copy.title}, ${currentUser.name.split(" ")[0]}` : copy.title}
        </Text>
        <Text style={styles.body}>{copy.body}</Text>
      </Card>

      <Button onPress={dismiss} style={styles.cta}>
        Get started
      </Button>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    gap: spacing.xl,
  },
  brandBlock: {
    alignItems: "center",
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
  },
  card: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
    textAlign: "center",
  },
  body: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: spacing.md,
  },
  cta: {
    marginTop: spacing.sm,
  },
}));
