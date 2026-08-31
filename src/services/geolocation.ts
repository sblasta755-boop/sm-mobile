import * as Location from "expo-location";

export interface DeviceCoords {
  latitude: number;
  longitude: number;
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
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}
