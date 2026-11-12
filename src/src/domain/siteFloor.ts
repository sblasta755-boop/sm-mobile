// The pure parts of the live floor plan: colours, counts, where a room sits and what part of the plan is in view.
// They mirror the web app's lib/smartclean/floorView.ts and components/smartclean/FloorPlanCanvas.tsx so the two read a
// floor the same way. The drawing itself is components/FloorPlanSvg.tsx.

import type { LocationLiveStatusValue } from "@/api/client";
import type { Location, LocationLayoutPoint } from "@/types/smartclean";

/** The plan is drawn in a 1000-unit-wide box; its height follows the plan image's own shape. */
export const VIEWBOX_UNITS = 1000;
const FALLBACK_ASPECT = 0.65;
export const MAX_ZOOM = 4;

export const STATUS_ORDER: LocationLiveStatusValue[] = [
  "incident_open",
  "overdue",
  "in_progress",
  "awaiting_review",
  "clean",
  "no_data",
];

export const STATUS_LABEL: Record<LocationLiveStatusValue, string> = {
  incident_open: "Incident open",
  overdue: "Overdue",
  in_progress: "In progress",
  awaiting_review: "Awaiting review",
  clean: "Clean",
  no_data: "No activity",
};

export const STATUS_HEX: Record<LocationLiveStatusValue, string> = {
  incident_open: "#ef4444",
  overdue: "#f59e0b",
  in_progress: "#0ea5e9",
  awaiting_review: "#7dd3fc",
  clean: "#22c55e",
  no_data: "#64748b",
};

function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const from = (pa >> shift) & 255;
    const to = (pb >> shift) & 255;
    return Math.round(from + (to - from) * Math.min(1, Math.max(0, t)));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** Green for a room cleaned in the last four hours, easing to amber by twelve and red by a day. Never cleaned is grey. */
export function heatColour(lastCleanedAt: string | null | undefined, now = Date.now()): string {
  if (!lastCleanedAt) return "#64748b";
  const hours = Math.max(0, (now - new Date(lastCleanedAt).getTime()) / 3_600_000);
  if (hours <= 4) return "#22c55e";
  if (hours <= 12) return lerpHex("#22c55e", "#f59e0b", (hours - 4) / 8);
  return lerpHex("#f59e0b", "#ef4444", Math.min(1, (hours - 12) / 12));
}

/** A room's colour: by status, or by how long since it was cleaned (an open incident is always red). */
export function roomColour(
  status: LocationLiveStatusValue,
  mode: "status" | "age",
  lastCleanedAt: string | null | undefined,
  now = Date.now(),
): string {
  if (mode === "age") return status === "incident_open" ? STATUS_HEX.incident_open : heatColour(lastCleanedAt, now);
  return STATUS_HEX[status];
}

/** How many rooms are in each status, for the key. */
export function statusCounts(
  statuses: (LocationLiveStatusValue | undefined)[],
): Record<LocationLiveStatusValue, number> {
  const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<LocationLiveStatusValue, number>;
  for (const s of statuses) out[s ?? "no_data"] += 1;
  return out;
}

/** "2 h ago", "3 days ago", "never". */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export interface RoomBox {
  x: number;
  y: number;
  w: number;
  h: number;
  points?: LocationLayoutPoint[];
}

const GRID_GAP = 0.02;

/** A room nobody has arranged yet still shows, in a tidy grid slot, instead of piling up at the corner. */
function autoGrid(index: number): RoomBox {
  const perRow = 4;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  const w = (1 - GRID_GAP * (perRow + 1)) / perRow;
  const h = 0.16;
  return { x: GRID_GAP + col * (w + GRID_GAP), y: GRID_GAP + row * (h + GRID_GAP), w, h };
}

export function boxFor(location: Pick<Location, "layout">, index: number): RoomBox {
  const l = location.layout;
  if (l && l.x != null && l.y != null && l.w != null && l.h != null) {
    return { x: l.x, y: l.y, w: l.w, h: l.h, points: l.points };
  }
  return autoGrid(index);
}

/** The corners of a room, normalised 0-1: its own outline when it was scanned or sketched, else its rectangle. */
export function outlineOf(box: RoomBox): LocationLayoutPoint[] {
  if (box.points && box.points.length >= 3) return box.points;
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
}

/** The middle of an outline, where the room's name goes. */
export function centroidOf(points: LocationLayoutPoint[]): LocationLayoutPoint {
  const n = points.length || 1;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

/** Outline corners as an SVG `points` string, in plan units. */
export function pointsAttr(outline: LocationLayoutPoint[], planHeight: number): string {
  return outline.map((p) => `${(p.x * VIEWBOX_UNITS).toFixed(1)},${(p.y * planHeight).toFixed(1)}`).join(" ");
}

/** The plan's height in plan units (its width is VIEWBOX_UNITS). */
export function planHeight(image?: { width: number; height: number } | null): number {
  const aspect = image && image.width > 0 ? image.height / image.width : FALLBACK_ASPECT;
  return VIEWBOX_UNITS * aspect;
}

/** The part of the plan in view. A smaller box is a closer look; it never leaves the plan. */
export function viewBoxFor(
  zoom: number,
  pan: { x: number; y: number },
  height: number,
): { x: number; y: number; w: number; h: number } {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const w = VIEWBOX_UNITS / z;
  const h = height / z;
  return {
    x: Math.min(Math.max(0, pan.x), VIEWBOX_UNITS - w),
    y: Math.min(Math.max(0, pan.y), height - h),
    w,
    h,
  };
}

/** The new pan for zooming about the middle of what is in view now. */
export function zoomAbout(
  zoom: number,
  pan: { x: number; y: number },
  factor: number,
  height: number,
): { zoom: number; pan: { x: number; y: number } } {
  const view = viewBoxFor(zoom, pan, height);
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  return { zoom: next, pan: { x: cx - VIEWBOX_UNITS / next / 2, y: cy - height / next / 2 } };
}

/** A name cut to what fits in a room `widthUnits` wide at `fontSize`, or "" when not even a few letters fit. */
export function fitLabel(name: string, widthUnits: number, fontSize: number): string {
  const capacity = Math.floor(widthUnits / (fontSize * 0.55));
  if (capacity < 3) return "";
  return name.length <= capacity ? name : `${name.slice(0, Math.max(1, capacity - 1))}…`;
}
