import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { useSmartClean } from "@/features/store";
import { getCapability, labelFor, requestUnlock, type BiometricKind } from "@/services/biometrics";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * The gate in front of a restored-but-locked session.
 *
 * Reached only from app/index.tsx, and only when all three are true: a
 * session was restored, the user turned the lock on for this device, and
 * the device can actually honour it. The session's tokens are already in
 * memory by this point - this screen decides whether the app reveals
 * them, which is why it offers no way forward except authenticating or
 * signing out.
 *
 * Signing out is the deliberate escape hatch rather than a "skip":
 * someone who cannot pass the prompt still needs a route back into the
 * app, and the honest one is to end the locked session and sign in with
 * a password.
 */
export default function LockScreen() {
  const { signOut, unlock } = useSmartClean();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<BiometricKind>("biometric");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The prompt is fired once automatically on mount; without this guard
  // React's development double-invoke (and any re-render while the OS
  // sheet is up) would stack a second system prompt on top of the first.
  const promptedRef = useRef(false);

  /** Clearing state.locked is NOT enough on its own.
   *
   * index.tsx sent us here with <Redirect href="/lock" />, so the router
   * is now parked on this screen and index.tsx is no longer mounted -
   * flipping the flag re-renders nothing that would navigate away, and
   * the app sat here unlocked-but-stuck after a successful scan. So we
   * navigate ourselves, back through "/" so index.tsx re-runs its own
   * role split (cleaner/manager/supervisor/auditor, plus the
   * set-password gate) rather than this screen guessing a destination.
   *
   * replace, not push: a locked screen must not sit in the back stack
   * where the hardware back button could return to it. */
  const release = useCallback(() => {
    unlock();
    router.replace("/");
  }, [unlock]);

  const attempt = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const capability = await getCapability();
    setKind(capability.kind);

    if (!capability.available) {
      // Biometrics disappeared between enabling the lock and now (sensor
      // reset, enrolment removed). Don't hold the session hostage to a
      // prompt that cannot succeed - let it through and let the profile
      // toggle be turned back on deliberately.
      setBusy(false);
      release();
      return;
    }

    const outcome = await requestUnlock(capability.kind);
    setBusy(false);

    if (outcome.status === "unlocked") {
      release();
      return;
    }
    if (outcome.status === "fallback") {
      setMessage(
        outcome.reason ||
          `Sign in with your password to continue, or try ${labelFor(capability.kind)} again.`,
      );
      return;
    }
    setMessage("Not recognised. Try again, or sign in with your password.");
  }, [release]);

  useEffect(() => {
    if (promptedRef.current) return;
    promptedRef.current = true;
    void attempt();
  }, [attempt]);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.brandBlock}>
        <Image
          source={require("../assets/logo-mark.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brand}>Šoma360</Text>
        <Text style={styles.tagline}>Locked</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.heading}>Unlock to continue</Text>
        <Text style={styles.copy}>
          Your session is still signed in on this device. Confirm it&apos;s you to carry
          on.
        </Text>

        {message && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        )}

        <Button onPress={() => attempt()} loading={busy} style={styles.unlockButton}>
          Unlock with {labelFor(kind)}
        </Button>

        <Button variant="ghost" onPress={() => handleSignOut()}>
          Sign in with password instead
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    gap: spacing.xxl,
  },
  brandBlock: {
    alignItems: "center",
    gap: spacing.xs,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.round,
    marginBottom: spacing.sm,
  },
  brand: {
    fontSize: typography.title,
    fontWeight: "800",
    color: colors.foreground,
  },
  tagline: {
    fontSize: typography.body,
    color: colors.mutedForeground,
  },
  body: {
    gap: spacing.md,
  },
  heading: {
    fontSize: typography.h1,
    fontWeight: "800",
    color: colors.foreground,
    textAlign: "center",
  },
  copy: {
    fontSize: typography.body,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
  noticeBox: {
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    fontSize: typography.small,
    color: colors.warningForeground,
    textAlign: "center",
    lineHeight: 18,
  },
  unlockButton: {
    marginTop: spacing.xs,
  },
});
