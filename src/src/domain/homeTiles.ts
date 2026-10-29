// What the home screen offers beyond today's tasks, as plain data.
//
// Every feature used to add its own full-width card to the home screen, which pushed the day's
// tasks off the first screen. New features add ONE entry to homeTiles() instead, and the screen
// draws them as a grid of tiles. Kept free of React so the rules can be tested on their own.

export type HomeTileKey = "rounds" | "corrective" | "stock" | "incident" | "schedule" | "leave" | "progress";

export type HomeTileAction = { kind: "route"; path: string };

export interface HomeTile {
  key: HomeTileKey;
  label: string;
  /** An Ionicons name. */
  icon: string;
  action: HomeTileAction;
  hint?: string;
  /** A count shown on the tile when something needs attention. */
  badge?: number;
}

export interface HomeTileInput {
  hourlyCompliance: boolean;
  /** Rounds this person can claim right now. */
  roundsToClaim: number;
  correctiveActions: boolean;
  /** Open corrective actions assigned to this person, first one's id when there is exactly one. */
  openCorrective: { count: number; onlyId?: string };
  stock: boolean;
  incidents: boolean;
  hasQr: boolean;
  schedule: boolean;
  /** The Leave module is on. */
  leave?: boolean;
  /** Gamification is on for this person. */
  progress: boolean;
}

/** The tiles for the bottom of a staff home screen, in the order they are drawn. */
export function homeTiles(input: HomeTileInput): HomeTile[] {
  const tiles: HomeTile[] = [];
  if (input.hourlyCompliance) {
    tiles.push({
      key: "rounds",
      label: "Hourly rounds",
      icon: "shield-checkmark-outline",
      action: { kind: "route", path: "/hourly-compliance" },
      hint: input.roundsToClaim > 0 ? `${input.roundsToClaim} to claim` : "My checklist",
      badge: input.roundsToClaim > 0 ? input.roundsToClaim : undefined,
    });
  }
  if (input.correctiveActions && input.openCorrective.count > 0) {
    const { count, onlyId } = input.openCorrective;
    tiles.push({
      key: "corrective",
      label: "Corrective actions",
      icon: "alert-circle-outline",
      action: { kind: "route", path: count === 1 && onlyId ? `/corrective-actions/${onlyId}` : "/corrective-actions" },
      hint: `${count} open`,
      badge: count,
    });
  }
  if (input.stock) {
    tiles.push({ key: "stock", label: "Stock", icon: "cube-outline", action: { kind: "route", path: "/stock" }, hint: "Issue, waste, restock" });
  }
  if (input.incidents) {
    tiles.push({
      key: "incident",
      label: "Report incident",
      icon: "warning-outline",
      action: { kind: "route", path: input.hasQr ? "/scan" : "/incidents/new" },
    });
  }
  if (input.schedule) {
    tiles.push({ key: "schedule", label: "My schedule", icon: "calendar-outline", action: { kind: "route", path: "/schedule" } });
  }
  if (input.leave) {
    tiles.push({ key: "leave", label: "Leave", icon: "airplane-outline", action: { kind: "route", path: "/leave" }, hint: "Ask for time off" });
  }
  if (input.progress) {
    tiles.push({ key: "progress", label: "My progress", icon: "trophy-outline", action: { kind: "route", path: "/progress" } });
  }
  return tiles;
}

export type TodayRowKey = "booking" | "points" | "tasks";

/** Which rows the Today card shows: the booking and points rows only when there is something to
 * say, and the task count always. */
export function todayRows(input: { hasBooking: boolean; hasPoints: boolean }): TodayRowKey[] {
  const rows: TodayRowKey[] = [];
  if (input.hasBooking) rows.push("booking");
  if (input.hasPoints) rows.push("points");
  rows.push("tasks");
  return rows;
}
