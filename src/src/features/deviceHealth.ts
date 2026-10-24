import { useEffect, useRef } from "react";
import * as Battery from "expo-battery";
import * as Device from "expo-device";
import { SubscriptionError, reportDeviceHealth } from "@/api/client";
import { useHasModule } from "@/features/modules";
import { useSmartClean } from "@/features/store";

// 20 minutes: frequent enough that a supervisor's audit view reflects
// roughly "this shift", not yesterday's last sample, without polling a
// battery API (a real hardware read, not free) on every render or
// waking a backgrounded app just to sample it - see the periodic effect
// below, which only runs while the app is actually in the foreground.
const SAMPLE_INTERVAL_MS = 20 * 60 * 1000;

/** Reads this device's current battery level/charging state and reports
 * it to the backend. Exported (not just used internally by the periodic
 * hook below) so clock-in/out call sites can report at that natural
 * checkpoint too - see app/(app)/scan.tsx and
 * app/(supervise)/supervise-scan.tsx. Best-effort throughout: a battery
 * read or report failure must never block or fail the action that
 * triggered it. */
export async function reportBatteryOnce(accessToken: string): Promise<void> {
  try {
    const available = await Battery.isAvailableAsync();
    if (!available) return;
    const { batteryLevel, batteryState } = await Battery.getPowerStateAsync();
    if (batteryLevel < 0) return;
    await reportDeviceHealth(accessToken, {
      batteryLevel: Math.round(batteryLevel * 100),
      isCharging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL,
      deviceModel: Device.modelName ?? undefined,
      osVersion: Device.osVersion ?? undefined,
    });
  } catch (error) {
    // 402: this organisation has the Device health module switched off. Not a failure.
    if (error instanceof SubscriptionError) return;
    console.warn("[device-health] Failed to report battery", error);
  }
}

/** Periodic battery sample while the app is open and someone is signed
 * in - the "keeping track of their mobile battery" half of the feature
 * that isn't already covered by the clock-in/out checkpoints. Mount
 * once, at the root (inside SmartCleanProvider), same convention as
 * usePushRegistration - see app/_layout.tsx.
 *
 * Deliberately foreground-only: there is no background task here (no
 * expo-task-manager), since a stale-but-recent sample from the last
 * time the app was open is more honest than pretending to track a phone
 * whose app isn't running. */
export function useDeviceHealthReporting() {
  const { state, currentUser } = useSmartClean();
  // Stops sampling when an operator has switched Device health off for this organisation.
  const enabled = useHasModule("device_health");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!currentUser || !state.accessToken || !enabled) return;

    void reportBatteryOnce(state.accessToken);
    timerRef.current = setInterval(() => {
      if (state.accessToken) void reportBatteryOnce(state.accessToken);
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentUser, state.accessToken, enabled]);
}
