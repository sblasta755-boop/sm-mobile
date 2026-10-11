import * as Location from "expo-location";

export interface DeviceCoords {
  latitude: number;
  longitude: number;
  /** The device's own confidence radius (metres) for this fix -
   * LocationObjectCoords.accuracy. Surfaced in the scan UI on a failed
   * geofence check so "the phone isn't sure where it is" can be told
   * apart from a genuine distance problem. */
  accuracy: number | null;
  /** Degrees clockwise from true north, or null when the platform isn't
   * reporting one - LocationObjectCoords.heading. Populated mainly while
   * actually moving; null is the common case at rest, not a failure -
   * live navigation (see PlatformSiteNavigator) falls back to a bearing
   * between consecutive fixes when this is null. Always null from
   * getCurrentCoords' single fix, same as the web equivalent. */
  heading: number | null;
  /** Metres/second, or null when unavailable. */
  speed: number | null;
}

/**
 * "Where is this device right now" for every geofenced action (QR scan,
 * clock-in/out) - resolves to null rather than throwing when permission
 * is denied/unavailable, since the backend already treats missing
 * coordinates as its own rejection reason (see
 * app.controllers.common.evaluate_geofence) with a clearer message than
 * a raw location error would give.
 */
export async function getCurrentCoords(): Promise<DeviceCoords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      heading: null,
      speed: null,
    };
  } catch {
    return null;
  }
}

// A fix worse than this is more likely to be a wrong guess than a real
// position - see the web equivalent's own comment (smartclean/
// geolocation.ts) for why 150m and not something closer to typical GPS
// accuracy.
const MAX_USABLE_ACCURACY_METERS = 150;

/**
 * Continuous position updates for live in-app turn-by-turn navigation
 * (see PlatformSiteNavigator) - the one-shot getCurrentCoords above
 * isn't enough once someone is actually driving and the map needs to
 * follow them.
 *
 * Returns a promise for an unsubscribe function (expo-location's own
 * watchPositionAsync is itself async, unlike the browser API's
 * synchronous watchPosition) - the caller owns calling it, on "Stop
 * navigation" and on unmount, since a live GPS watch must never
 * accidentally keep running or drain the device's battery in the
 * background.
 */
export async function watchPosition(
  onUpdate: (coords: DeviceCoords) => void,
  onError?: () => void,
): Promise<() => void> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      onError?.();
      return () => {};
    }
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (position) => {
        const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        // Silently skip rather than call onError - one bad fix isn't a
        // failure of location access, just noise to wait out.
        if (accuracy !== null && accuracy > MAX_USABLE_ACCURACY_METERS) return;
        onUpdate({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy,
          heading: Number.isFinite(position.coords.heading) && position.coords.heading! >= 0 ? position.coords.heading! : null,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        });
      },
    );
    return () => subscription.remove();
  } catch {
    onError?.();
    return () => {};
  }
}
