import type { LocationLayoutPoint, SiteFloorProfile } from "@/types/smartclean";

/** How much of the canvas width a freshly-scanned room's bounding box
 * should occupy when it's the first scan on a floor (and therefore also
 * sets that floor's canvasWidthMeters) - a constant, not user-
 * configurable in v1. Leaves room for other rooms to be added around it
 * later rather than filling the whole canvas with one room. */
const DEFAULT_FIRST_ROOM_CANVAS_FRACTION = 0.3;

/** Default top-left offset (normalized 0-1) a scanned room lands at.
 * RoomPlan has no idea where on the floor this room physically sits
 * relative to any other room already arranged there - see the plan's
 * metric-scale-anchor design. A manager repositions it on the web app's
 * FloorPlanCanvas afterward; this constant only avoids stacking every
 * scanned room exactly on top of the canvas origin. */
const DEFAULT_PLACEMENT_OFFSET = { x: 0.05, y: 0.05 };

export interface RoomScanConversionInput {
  /** Wall-corner points from a RoomScanResult, in meters, arbitrary
   * local origin (RoomPlan's own session-relative frame). */
  points: { x: number; y: number }[];
  widthMeters: number;
  /** The floor this scan is being placed on - canvasWidthMeters, if
   * already set by an earlier scan, is reused and NOT overwritten, so
   * multiple rooms scanned onto the same floor stay at a consistent
   * scale relative to each other. */
  floor: Pick<SiteFloorProfile, "canvasWidthMeters">;
}

export interface RoomScanConversionResult {
  points: LocationLayoutPoint[];
  /** Only set when this scan is the one establishing the floor's scale
   * (floor.canvasWidthMeters was previously unset) - the caller PATCHes
   * this onto the floor's spaceProfile alongside saving the room's own
   * position. Undefined when reusing an existing scale (nothing to
   * write back for the floor itself). */
  canvasWidthMetersToPersist: number | undefined;
}

/**
 * Converts a RoomPlan scan's real-world meter coordinates into the
 * normalized 0-1 canvas coordinates Location.layout stores - the
 * pure-math core of the metric-scale-anchor design (see the plan doc's
 * "The metric-scale gap" section), kept isolated from any native/camera
 * code specifically so it's unit-testable without a device or simulator.
 *
 * Deliberately does NOT try to guess a room's position relative to its
 * neighbors - every scanned room lands at DEFAULT_PLACEMENT_OFFSET and a
 * human repositions it afterward (see scan.tsx and FloorPlanCanvas.tsx's
 * edit mode). This function only gets the SHAPE and SCALE right.
 */
export function convertRoomScanToLayout(input: RoomScanConversionInput): RoomScanConversionResult {
  const { points, widthMeters, floor } = input;
  if (points.length < 3) {
    throw new Error("A room scan needs at least 3 wall corners to place on the canvas.");
  }

  const xsM = points.map((p) => p.x);
  const ysM = points.map((p) => p.y);
  const minXM = Math.min(...xsM);
  const minYM = Math.min(...ysM);
  const bboxWidthM = Math.max(...xsM) - minXM || widthMeters || 1;

  let canvasWidthMeters = floor.canvasWidthMeters;
  let canvasWidthMetersToPersist: number | undefined;
  if (canvasWidthMeters == null || canvasWidthMeters <= 0) {
    // First scan on this floor: this room's own bounding box becomes
    // the scale anchor, sized to occupy DEFAULT_FIRST_ROOM_CANVAS_FRACTION
    // of the canvas width.
    canvasWidthMeters = bboxWidthM / DEFAULT_FIRST_ROOM_CANVAS_FRACTION;
    canvasWidthMetersToPersist = canvasWidthMeters;
  }

  const normalizedPoints: LocationLayoutPoint[] = points.map((p) => ({
    x: DEFAULT_PLACEMENT_OFFSET.x + (p.x - minXM) / canvasWidthMeters!,
    y: DEFAULT_PLACEMENT_OFFSET.y + (p.y - minYM) / canvasWidthMeters!,
  }));

  return { points: normalizedPoints, canvasWidthMetersToPersist };
}
