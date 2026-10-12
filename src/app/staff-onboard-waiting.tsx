import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { collectStaffOnboarding, pollStaffOnboarding } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// The new starter is standing with their manager while this runs, so it
// polls briskly.
const POLL_MS = 3_000;

/**
 * The new employee's side of the approval wait.
 *
 * Shows the match word prominently: reading it aloud is this person's
 * half of the check that defeats a forwarded code. Their manager sees
 * the same word and only approves if the two agree.
 *
 * On approval this collects the session and hands it to the store, then
 * routes to "/" - which sends them straight to the password screen,
 * since the collected session is flagged mustChangePassword.
 */
export default function StaffOnboardWaiting() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const params = useLocalSearchParams<{
    claimId: string;
    claimSecret: string;
    matchWord: string;
    organisationName: string;
    firstName: string;
  }>();
  const insets = useSafeAreaInsets();
  const { signInWithSession } = useSmartClean();
  const [status, setStatus] = useState("scanned");
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Collection is single-use server-side, so a second attempt would fail
  // with a confusing "already completed".
  const collecting = useRef(false);

  const collect = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const { session, bootstrap, mustChangePassword, hasSeenWelcome } = await collectStaffOnboarding(
        params.claimId,
        params.claimSecret,
      );
      await signInWithSession(session, bootstrap, { mustChangePassword, hasSeenWelcome });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish signing you in.");
      collecting.current = false;
    }
  }, [params.claimId, params.claimSecret, signInWithSession]);

  const check = useCallback(async () => {
    if (collecting.current) return;
    try {
      const result = await pollStaffOnboarding(params.claimId, params.claimSecret);
      setStatus(result.status);
      setRejectedReason(result.rejectedReason);
      if (result.ready) await collect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lost contact with Šoma360.");
    }
  }, [params.claimId, params.claimSecret, collect]);

  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    void checkRef.current();
    const timer = setInterval(() => void checkRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const declined = status === "rejected" || status === "revoked";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl }]}>
      {declined ? (
        <Card style={styles.card}>
          <Ionicons name="close-circle-outline" size={40} color={colors.destructive} />
          <Text style={styles.title}>
            {status === "rejected" ? "Setup wasn't completed" : "This code was withdrawn"}
          </Text>
          <Text style={styles.muted}>
            {rejectedReason ??
              "Nothing has been lost. Your manager can show you a fresh code whenever you're ready."}
          </Text>
          <Button onPress={() => router.replace("/staff-onboard-scan")}>
            Scan a new code
          </Button>
          <Button variant="ghost" onPress={() => router.replace("/login")}>
            Back to sign in
          </Button>
        </Card>
      ) : (
        <Card style={styles.card}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.title}>
            {params.firstName ? `Almost there, ${params.firstName}` : "Almost there"}
          </Text>
          <Text style={styles.muted}>
            {params.organisationName
              ? `Your manager at ${params.organisationName} is confirming this.`
              : "Your manager is confirming this."}{" "}
            Read this word out to them:
          </Text>

          <View style={styles.matchBlock}>
            <Text style={styles.matchWord}>{params.matchWord}</Text>
          </View>

          <Text style={styles.fine}>
            They&apos;ll only approve if it matches what&apos;s on their screen. Keep this
            screen open.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Button variant="ghost" onPress={() => router.replace("/login")}>
            Cancel
          </Button>
        </Card>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: "center",
  },
  card: {
    gap: spacing.md,
    alignItems: "center",
  },
  title: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
    textAlign: "center",
  },
  muted: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 21,
  },
  matchBlock: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
  },
  matchWord: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  fine: {
    fontSize: typography.small,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 19,
  },
  error: {
    fontSize: typography.small,
    fontWeight: "600",
    color: colors.destructive,
    textAlign: "center",
  },
}));
