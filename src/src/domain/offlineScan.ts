// What a QR scan means when there is no connection: decided on the phone from
// the sites, rooms and tasks it already holds, following the same rules the
// server applies (see QrCodesController.resolve and AttendanceController.clock).
// The server re-checks everything when the scan syncs, so this only has to be
// right enough to tell the person "recorded" or "you are not on site".

import { distanceM } from "./nearestBeacon";

export interface ScanSite {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
  geofence?: { latitude?: number; longitude?: number; radiusMeters?: number; radius?: number };
}
export interface ScanLocation {
  id: string;
  siteId: string;
  name: string;
  qr: string;
}
export interface ScanTask {
  id: string;
  locationId?: string | null;
  requiredQr?: string;
  assigneeId: string;
  status: string;
  scheduledAt?: string;
  isSiteWide?: boolean;
  siteId: string;
}

export type OfflineScan =
  | { ok: false; reason: string; distanceMeters?: number }
  | {
      ok: true;
      kind: "site";
      site: ScanSite;
      /** What this scan would do: clock in, or clock out when already clocked in. */
      direction: "in" | "out";
      geofenceVerified: boolean;
      /** The person's open whole-site tasks here, which a scan can start. */
      siteTasks: ScanTask[];
    }
  | {
      ok: true;
      kind: "room";
      location: ScanLocation;
      site: ScanSite | undefined;
      /** The task this scan opens, or null when none is assigned on this phone. */
      task: ScanTask | null;
      geofenceVerified: boolean;
    };

const OPEN = new Set(["assigned", "not_started", "in_progress", "rework_required"]);

function sameLocalDay(iso: string | undefined, now: Date): boolean {
  if (!iso) return true; // no date to compare: do not wrongly exclude it
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function checkGeofence(
  site: ScanSite | undefined,
  coords: { latitude: number; longitude: number } | null,
): { reason?: string; verified: boolean; distanceMeters?: number } {
  const g = site?.geofence;
  if (!site || !g || g.latitude == null || g.longitude == null) {
    // Nothing to check against: not grounds to block (matches the server).
    return { verified: false };
  }
  if (!coords) return { verified: false, reason: "Enable location access to verify you're on site." };
  const radius = Number(g.radiusMeters ?? g.radius ?? 0);
  const distance = distanceM(coords, { latitude: g.latitude, longitude: g.longitude });
  if (distance <= radius) return { verified: true, distanceMeters: distance };
  return {
    verified: false,
    distanceMeters: distance,
    reason: `You're ${Math.round(distance)}m from ${site.name} - move within ${Math.round(radius)}m to verify.`,
  };
}

export function resolveOfflineScan(args: {
  code: string;
  userId: string;
  sites: ScanSite[];
  locations: ScanLocation[];
  tasks: ScanTask[];
  clockedIn: boolean;
  coords: { latitude: number; longitude: number } | null;
  now?: Date;
}): OfflineScan {
  const now = args.now ?? new Date();
  const code = args.code.trim();
  const mine = args.tasks.filter((t) => t.assigneeId === args.userId);

  const site = args.sites.find((s) => s.code === code && s.active !== false);
  if (site) {
    const fence = checkGeofence(site, args.coords);
    if (fence.reason) return { ok: false, reason: fence.reason, distanceMeters: fence.distanceMeters };
    return {
      ok: true,
      kind: "site",
      site,
      direction: args.clockedIn ? "out" : "in",
      geofenceVerified: fence.verified,
      siteTasks: mine.filter((t) => t.isSiteWide && t.siteId === site.id && OPEN.has(t.status) && sameLocalDay(t.scheduledAt, now)),
    };
  }

  const location = args.locations.find((l) => l.qr === code);
  if (location) {
    const candidates = mine
      .filter(
        (t) =>
          t.locationId === location.id &&
          t.requiredQr === code &&
          OPEN.has(t.status) &&
          sameLocalDay(t.scheduledAt, now),
      )
      // One already under way first, so a re-scan resumes it.
      .sort((a, b) => Number(b.status === "in_progress") - Number(a.status === "in_progress"));
    const task = candidates[0] ?? null;
    const roomSite = args.sites.find((s) => s.id === location.siteId);
    if (task) {
      // One task at a time, as on the server.
      const other = mine.find((t) => t.id !== task.id && t.status === "in_progress" && sameLocalDay(t.scheduledAt, now));
      if (other && task.status !== "in_progress") {
        return { ok: false, reason: "Finish and submit your current task before starting another one." };
      }
      const fence = checkGeofence(roomSite, args.coords);
      if (fence.reason) return { ok: false, reason: fence.reason, distanceMeters: fence.distanceMeters };
      return { ok: true, kind: "room", location, site: roomSite, task, geofenceVerified: fence.verified };
    }
    return { ok: true, kind: "room", location, site: roomSite, task: null, geofenceVerified: false };
  }

  return { ok: false, reason: "This code is not on this phone. Connect to the internet to check it." };
}
