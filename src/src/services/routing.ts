/**
 * Road routing for live in-app navigation to a platform site (see
 * PlatformSiteNavigator). A near-verbatim port of the web app's
 * src/lib/smartclean/routing.ts - same OSRM HTTP API, same lon/lat
 * quirk, same polyline decoder - kept as a separate copy rather than a
 * shared package since mobile and web are separate deployable apps with
 * no existing shared-code mechanism between them.
 *
 * IMPORTANT - the default endpoint is OSRM's public demo server, which
 * its operators explicitly state is for development/demo only, with no
 * uptime guarantee. Point EXPO_PUBLIC_OSRM_URL at a self-hosted OSRM (or
 * a paid provider speaking the same API) before this is relied on
 * operationally - same caveat as the web app's VITE_OSRM_URL.
 */

function osrmBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_OSRM_URL;
  return (configured?.trim() || "https://router.project-osrm.org").replace(/\/$/, "");
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverType: string;
  maneuverModifier?: string;
  streetName: string;
  location: [number, number];
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  points: [number, number][];
  steps: RouteStep[];
}

export class RoutingError extends Error {}

export async function fetchRoute(
  from: [number, number],
  to: [number, number],
  signal?: AbortSignal,
  withSteps = false,
): Promise<RouteLeg> {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url = `${osrmBaseUrl()}/route/v1/driving/${coords}?overview=full&geometries=polyline6&alternatives=false&steps=${withSteps}`;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RoutingError("Couldn't reach the routing service.");
  }

  if (!response.ok) {
    throw new RoutingError(`Routing service returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    code?: string;
    routes?: {
      distance?: number;
      duration?: number;
      geometry?: string;
      legs?: {
        steps?: {
          distance?: number;
          duration?: number;
          name?: string;
          maneuver?: { type?: string; modifier?: string; location?: [number, number] };
        }[];
      }[];
    }[];
  };

  if (payload.code !== "Ok" || !payload.routes?.length) {
    throw new RoutingError(
      payload.code === "NoRoute" ? "No driveable route to that site." : "Couldn't calculate a route.",
    );
  }

  const route = payload.routes[0];
  if (!route.geometry || typeof route.distance !== "number" || typeof route.duration !== "number") {
    throw new RoutingError("Routing service returned an unexpected response.");
  }

  const decodedPoints = decodePolyline(route.geometry, 6);
  const steps: RouteStep[] = (route.legs ?? []).flatMap((leg) =>
    (leg.steps ?? [])
      .filter((step) => typeof step.distance === "number" && typeof step.duration === "number")
      .map((step) => ({
        instruction: describeManeuver(step.maneuver?.type, step.maneuver?.modifier, step.name),
        distanceMeters: step.distance!,
        durationSeconds: step.duration!,
        maneuverType: step.maneuver?.type ?? "turn",
        maneuverModifier: step.maneuver?.modifier,
        streetName: step.name || "",
        location: step.maneuver?.location
          ? [step.maneuver.location[1], step.maneuver.location[0]]
          : decodedPoints[0],
      })),
  );

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    points: decodedPoints,
    steps,
  };
}

function describeManeuver(type: string | undefined, modifier: string | undefined, street: string | undefined): string {
  const road = street ? ` onto ${street}` : "";
  const dir = modifier ? modifier.replace(/_/g, " ") : "";
  switch (type) {
    case "depart":
      return `Head out${road}`;
    case "arrive":
      return "You have arrived at your destination";
    case "roundabout":
    case "rotary":
      return `Enter the roundabout${road}`;
    case "merge":
      return `Merge ${dir}${road}`;
    case "fork":
      return `Keep ${dir} at the fork${road}`;
    case "turn":
      return dir ? `Turn ${dir}${road}` : `Continue${road}`;
    case "continue":
      return `Continue ${dir}${road}`.trim();
    case "new name":
      return `Continue${road}`;
    default:
      return `Continue${road}` || "Continue";
  }
}

function decodePolyline(encoded: string, precision: number): [number, number][] {
  const factor = 10 ** precision;
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lon / factor]);
  }

  return points;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(from: [number, number], to: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLon = toRad(to[1] - from[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export function distanceToPolylineMeters(point: [number, number], polyline: [number, number][]): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineMeters(point, polyline[0]);

  const latRad = (point[0] * Math.PI) / 180;
  const metersPerLatDeg = 111_320;
  const metersPerLonDeg = 111_320 * Math.cos(latRad);

  let closest = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a[1] * metersPerLonDeg;
    const ay = a[0] * metersPerLatDeg;
    const bx = b[1] * metersPerLonDeg;
    const by = b[0] * metersPerLatDeg;
    const px = point[1] * metersPerLonDeg;
    const py = point[0] * metersPerLatDeg;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const distance = Math.hypot(px - projX, py - projY);
    if (distance < closest) closest = distance;
  }
  return closest;
}

export function nearestPointIndex(point: [number, number], polyline: [number, number][]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const distance = haversineMeters(point, polyline[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}
