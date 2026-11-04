import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, View } from "react-native";
import {
  getCapability,
  isLockEnabled,
  labelFor,
  labelForSentenceStart,
  setLockEnabled,
  type BiometricKind,
} from "@/services/biometrics";
import { SettingsRow } from "@/components/SettingsKit";
import { colors, spacing, themedStyles } from "@/theme";

/**
 * The biometric lock toggle, shared by every role's profile screen.
 *
 * One component rather than four copies for the same reason the shared
 * profile routes exist: this is a device setting that every role should
 * find in the same place, worded the same way.
 *
 * Renders NOTHING when the device has no sensor or nothing enrolled.
 * A toggle that cannot be honoured is worse than no toggle - switching
 * it on would arm a lock screen whose prompt could never succeed. That
 * also means an older build without the native module simply shows no
 * row, rather than an error.
 */
export function BiometricLockRow() {
  const [kind, setKind] = useState<BiometricKind | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [capability, on] = await Promise.all([getCapability(), isLockEnabled()]);
      if (cancelled) return;
      setKind(capability.available ? capability.kind : null);
      setEnabled(on);
      setChecking(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <View style={styles.row}>
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      </View>
    );
  }

  // No usable biometrics on this device - say nothing at all.
  if (!kind) return null;

  const label = labelFor(kind);
  const sentenceLabel = labelForSentenceStart(kind);

  async function toggle(next: boolean) {
    // Optimistic: the write is best-effort and a failure just means the
    // lock is off next launch, which is the safe direction.
    setEnabled(next);
    await setLockEnabled(next);
  }

  return (
    <SettingsRow
      // Only a face-ONLY device gets the face glyph. A device with
      // both is represented by the fingerprint, which is the more
      // recognisable "biometrics" mark of the two.
      icon={kind === "face" ? "scan-outline" : "finger-print-outline"}
      title={`Unlock with ${label}`}
      sub={
        enabled
          ? `${sentenceLabel} will be required when you open the app.`
          : "The app currently opens straight to your session."
      }
      right={
        <Switch
          value={enabled}
          onValueChange={(next) => void toggle(next)}
          trackColor={{ true: colors.primary, false: colors.neutral }}
          accessibilityLabel={`Unlock with ${label}`}
        />
      }
    />
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
}));
