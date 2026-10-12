import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { collectOnboarding, pollOnboarding } from "@/api/client";
import { colors, radius, spacing, typography, themedStyles, useThemeVersion } from "@/theme";

// The customer is standing there watching this screen while their
// contact decides, so it polls briskly. 3s keeps the wait feeling live
// without hammering the endpoint.
const POLL_MS = 3_000;

/**
 * The customer's side of the approval wait.
 *
 * Shows the match word prominently, because reading it aloud is the
 * customer's half of the check that defeats a forwarded screenshot -
 * their contact is looking at the same word and will only approve if
 * the two agree.
 *
 * On approval this collects the session and hands it to the store, then
 * routes to "/" which sends them straight to the password screen (the
 * collected session is flagged mustChangePassword).
 */
export default function OnboardWaiting() {
  useThemeVersion(); // re-render with the new colours when the theme changes
  const params = useLocalSearchParams<{
    claimId: string;
    claimSecret: string;
    matchWord: string;
    organisationName: string;
  }>();
  const insets = useSafeAreaInsets();
  const { signInWithSession } = useSmartClean();
  const [status, setStatus] = useState<string>("scanned");
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Collection is single-use server-side, so a second attempt would fail
  // with a confusing "already completed". One shot, guarded locally too.
  const collecting = useRef(false);

  const collect = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const { session, bootstrap, mustChangePassword, hasSeenWelcome } = await collectOnboarding(
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
      const result = await pollOnboarding(params.claimId, params.claimSecret);
      setStatus(result.status);
      setRejectedReason(result.rejectedReason);
      if (result.ready) {
        await collect();
      }
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

  const rejected = status === "rejected";
  const revoked = status === "revoked";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl }]}>
      {rejected || revoked ? (
        <Card style={styles.card}>
          <Ionicons name="close-circle-outline" size={40} color={colors.destructive} />
          <Text style={styles.title}>
            {rejected ? "Onboarding wasn't completed" : "This code was withdrawn"}
          </Text>
          <Text style={styles.muted}>
            {rejectedReason ??
              "Nothing has been lost - your organisation is still set up. Your Šoma360 contact can issue a fresh code whenever you're ready."}
          </Text>
          <Button onPress={() => router.replace("/onboard-scan")}>Scan a new code</Button>
          <Button variant="ghost" onPress={() => router.replace("/login")}>
            Back to sign in
          </Button>
        </Card>
      ) : (
        <Card style={styles.card}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.title}>
            {params.organisationName ? `Onboarding ${params.organisationName}` : "Almost there"}
          </Text>
          <Text style={styles.muted}>
            Your Šoma360 contact is confirming this request. Read this word out to them:
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
