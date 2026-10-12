export interface Point {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in metres between two coordinates. */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** The sign nearest `position`, if one is within `maxMeters`; otherwise null. */
export function nearestBeacon<T extends Point & { id: string }>(
  position: Point | null,
  beacons: T[],
  maxMeters: number,
  excludeId?: string,
): { beacon: T; meters: number } | null {
  if (!position) return null;
  let best: { beacon: T; meters: number } | null = null;
  for (const beacon of beacons) {
    if (beacon.id === excludeId) continue;
    const meters = distanceM(position, beacon);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { beacon, meters };
  }
  return best;
}
