import { convertRoomScanToLayout } from "./roomScanPlacement";

describe("convertRoomScanToLayout", () => {
  it("sets the floor's canvas scale from the first scan's bounding box", () => {
    // A 4m x 3m rectangular room, scanned with an arbitrary local origin.
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    const result = convertRoomScanToLayout({
      points,
      widthMeters: 4,
      floor: { canvasWidthMeters: undefined },
    });

    // canvasWidthMeters = bboxWidthM / 0.3 = 4 / 0.3
    expect(result.canvasWidthMetersToPersist).toBeCloseTo(4 / 0.3, 5);
    // The room's own width should then occupy exactly 0.3 of the canvas.
    const xs = result.points.map((p) => p.x);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeCloseTo(0.3, 5);
  });

  it("reuses an existing floor scale rather than overwriting it", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const result = convertRoomScanToLayout({
      points,
      widthMeters: 2,
      floor: { canvasWidthMeters: 10 },
    });

    expect(result.canvasWidthMetersToPersist).toBeUndefined();
    const xs = result.points.map((p) => p.x);
    const width = Math.max(...xs) - Math.min(...xs);
    // 2m room on a 10m-wide canvas -> occupies 0.2 of the canvas width.
    expect(width).toBeCloseTo(0.2, 5);
  });

  it("keeps two rooms scanned onto the same floor at a consistent relative scale", () => {
    const floorAfterFirstScan = { canvasWidthMeters: 20 }; // set by an earlier 4m-wide room / 0.2 fraction, say

    const smallRoom = convertRoomScanToLayout({
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      widthMeters: 2,
      floor: floorAfterFirstScan,
    });
    const largeRoom = convertRoomScanToLayout({
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      widthMeters: 4,
      floor: floorAfterFirstScan,
    });

    const widthOf = (points: { x: number }[]) => Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    // A 4m room should render exactly twice as wide as a 2m room on the
    // same floor's canvas, regardless of scan order.
    expect(widthOf(largeRoom.points)).toBeCloseTo(2 * widthOf(smallRoom.points), 5);
  });

  it("offsets every scanned room away from the canvas origin so multiple scans don't stack exactly on top of each other", () => {
    const result = convertRoomScanToLayout({
      points: [
        { x: 5, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 8 },
        { x: 5, y: 8 },
      ],
      widthMeters: 3,
      floor: { canvasWidthMeters: 10 },
    });

    // minX/minY in the input (5, 5) must map to the default offset, not
    // (0, 0) - proves the local-origin shift is applied before scaling.
    const minX = Math.min(...result.points.map((p) => p.x));
    const minY = Math.min(...result.points.map((p) => p.y));
    expect(minX).toBeCloseTo(0.05, 5);
    expect(minY).toBeCloseTo(0.05, 5);
  });

  it("rejects a degenerate scan with fewer than 3 points", () => {
    expect(() =>
      convertRoomScanToLayout({
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        widthMeters: 1,
        floor: { canvasWidthMeters: undefined },
      }),
    ).toThrow();
  });
});
