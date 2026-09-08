import * as Location from "expo-location";

export interface DeviceCoords {
  latitude: number;
  longitude: number;
  /** The device's own confidence radius (metres) for this fix -
   * LocationObjectCoords.accuracy. Surfaced in the scan UI on a failed
   * geofence check so "the phone isn't sure where it is" can be told
   * apart from a genuine distance problem. */
  accuracy: number | null;
}

/**
 * "Where is this device right now" for every geofenced action (QR scan,
 * clock-in/out) — resolves to null rather than throwing when permission
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
    };
  } catch {
    return null;
  }
}
