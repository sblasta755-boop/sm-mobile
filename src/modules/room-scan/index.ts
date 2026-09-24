import { Platform } from "react-native";
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type { ComponentType } from "react";

// Both platforms, backed by genuinely different native implementations:
// iOS uses Apple's first-party RoomPlan framework (a single high-level
// call that hands back a finished room graph); Android has no equivalent
// first-party API, so its side is a bespoke ARCore plane-detection +
// wall-fitting + line-intersection pipeline built from scratch (see
// android/src/main/java/expo/modules/roomscan/ - RoomOutlineBuilder.kt
// in particular). Both emit the exact same RoomScanResult shape below,
// so nothing above this native boundary needs to know which platform
// produced it. requireNativeModule/requireNativeViewManager throw on a
// platform with no matching native module, so every export here guards
// on Platform.OS first rather than letting that throw surface to a
// caller that forgot to check isSupported().

export interface RoomScanResult {
  /** Ordered top-down wall-corner points, in meters, in an arbitrary
   * local origin (neither RoomPlan nor ARCore has an absolute
   * in-building reference frame - see the plan's metric-scale-anchor
   * design for how a caller converts this into normalized canvas
   * coordinates). */
  points: { x: number; y: number }[];
  widthMeters: number;
  lengthMeters: number;
}

interface RoomScanNativeModule {
  isSupported(): Promise<boolean>;
}

/** Device/OS capability gate - false on web, iOS < 16/pre-A12 devices,
 * and Android devices where Google Play Services for AR isn't
 * installed/up to date/supported (see ArCoreAvailability.kt - this
 * collapses ARCore's richer availability states into the same simple
 * boolean RoomPlan's isSupported already is, by design: no install-
 * prompt state machine in v1 on either platform). Always check this
 * before rendering <RoomScanView> - it renders nothing useful (and
 * startSession() is a no-op) when unsupported. */
export async function isRoomPlanSupported(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  try {
    const native = requireNativeModule<RoomScanNativeModule>("RoomScan");
    return await native.isSupported();
  } catch {
    // Module not linked into this build (e.g. running in Expo Go, or a
    // dev-client build made before this module was added) - treat as
    // unsupported rather than crashing.
    return false;
  }
}

/** Why a scan might not be progressing, straight from ARCore's own
 * camera tracking state - see RoomScanProgressEvent.kt for the mapping.
 * "tracking" is the healthy state; everything else is something the user
 * can usually fix by changing how they're moving or where they're
 * pointing the phone. */
export type RoomScanTrackingState =
  | "tracking"
  | "initializing"
  | "excessive_motion"
  | "insufficient_light"
  | "insufficient_features"
  | "paused";

export interface RoomScanProgress {
  /** Distinct physical walls found so far, already de-duplicated the same
   * way the final outline will be (ARCore often tracks one wall as
   * several planes, so this is NOT a raw plane count). */
  wallCount: number;
  tracking: RoomScanTrackingState;
  /** Tracked surfaces that are not walls (floors, desks). Lets the UI
   * distinguish "seeing nothing" from "working, but no wall resolved
   * yet" - two situations that look identical if you only watch
   * wallCount sit at zero. Absent on iOS, which never emits progress. */
  otherSurfaceCount: number;
}

export interface RoomScanViewProps {
  /** true starts the native AR capture session; false stops it. The
   * screen using this toggles it on mount / on an explicit Cancel. */
  isActive: boolean;
  onCaptureFinished?: (event: { nativeEvent: RoomScanResult }) => void;
  onCaptureError?: (event: { nativeEvent: { message: string } }) => void;
  onCaptureCancelled?: () => void;
  /** Live progress while scanning. ANDROID ONLY in practice: iOS's
   * RoomCaptureView draws Apple's own live wall overlay and never emits
   * this, so a caller must not depend on it firing - treat "no events
   * yet" as a valid state rather than as a stalled scan. */
  onScanProgress?: (event: { nativeEvent: RoomScanProgress }) => void;
  style?: object;
}

/** Null when the native view isn't available: on web, and also in any
 * build where the module isn't linked (Expo Go, or a dev-client built
 * before this module existed). requireNativeViewManager THROWS in that
 * second case, and because this runs at module-import time an unguarded
 * throw takes down the whole importing screen rather than degrading to
 * the "not supported" state the caller already handles - so it's wrapped,
 * mirroring isRoomPlanSupported()'s own try/catch above. */
export const RoomScanView: ComponentType<RoomScanViewProps> | null = (() => {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    return requireNativeViewManager("RoomScan");
  } catch {
    return null;
  }
})();
