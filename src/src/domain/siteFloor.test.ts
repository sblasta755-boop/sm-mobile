import {
  VIEWBOX_UNITS,
  agoLabel,
  boxFor,
  centroidOf,
  fitLabel,
  heatColour,
  outlineOf,
  planHeight,
  pointsAttr,
  roomColour,
  statusCounts,
  viewBoxFor,
  zoomAbout,
} from "./siteFloor";

describe("colours", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  it("colours by status, and by age with an open incident always red", () => {
    expect(roomColour("clean", "status", null)).toBe("#22c55e");
    expect(roomColour("incident_open", "age", ago(1), now)).toBe("#ef4444");
    expect(roomColour("clean", "age", ago(1), now)).toBe("#22c55e");
  });
  it("heats from green to amber to red, and is grey when never cleaned", () => {
    expect(heatColour(null)).toBe("#64748b");
    expect(heatColour(ago(4), now)).toBe("#22c55e");
    expect(heatColour(ago(12), now)).toBe("#f59e0b");
    expect(heatColour(ago(24), now)).toBe("#ef4444");
    expect(heatColour(ago(8), now)).not.toBe("#22c55e");
  });
});

describe("counts and wording", () => {
  it("counts each status, treating a room with none as no activity", () => {
    const counts = statusCounts(["clean", "clean", undefined, "overdue"]);
    expect(counts.clean).toBe(2);
    expect(counts.no_data).toBe(1);
    expect(counts.overdue).toBe(1);
    expect(counts.incident_open).toBe(0);
  });
  it("says how long ago", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(agoLabel(null, now)).toBe("never");
    expect(agoLabel(new Date(now - 30_000).toISOString(), now)).toBe("just now");
    expect(agoLabel(new Date(now - 25 * 60_000).toISOString(), now)).toBe("25 min ago");
    expect(agoLabel(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("3 h ago");
    expect(agoLabel(new Date(now - 24 * 3_600_000).toISOString(), now)).toBe("yesterday");
    expect(agoLabel(new Date(now - 72 * 3_600_000).toISOString(), now)).toBe("3 days ago");
  });
});

describe("where a room sits", () => {
  it("uses its own layout, and a grid slot when nobody has arranged it", () => {
    expect(boxFor({ layout: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }, 0)).toMatchObject({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    const a = boxFor({ layout: {} }, 0);
    const b = boxFor({ layout: {} }, 1);
    const fifth = boxFor({ layout: undefined }, 4);
    expect(b.x).toBeGreaterThan(a.x + a.w - 1e-9);
    expect(fifth.y).toBeGreaterThan(a.y);
    expect(fifth.x).toBeCloseTo(a.x);
  });
  it("outlines a rectangle by its corners and a scanned room by its own points", () => {
    expect(outlineOf({ x: 0, y: 0, w: 0.5, h: 0.5 })).toHaveLength(4);
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(outlineOf({ x: 0, y: 0, w: 1, h: 1, points: tri })).toBe(tri);
    expect(outlineOf({ x: 0, y: 0, w: 1, h: 1, points: tri.slice(0, 2) })).toHaveLength(4);
  });
  it("finds the middle and writes points in plan units", () => {
    expect(centroidOf([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toEqual({ x: 0.5, y: 0.5 });
    expect(pointsAttr([{ x: 0.5, y: 0.5 }], 650)).toBe("500.0,325.0");
  });
  it("sizes the plan from its image, with a default shape when there is none", () => {
    expect(planHeight({ width: 2000, height: 1000 })).toBe(500);
    expect(planHeight(undefined)).toBe(VIEWBOX_UNITS * 0.65);
    expect(planHeight({ width: 0, height: 0 })).toBe(VIEWBOX_UNITS * 0.65);
  });
});

describe("zoom and pan", () => {
  const h = 650;
  it("shows the whole plan at 1x and a smaller part when zoomed", () => {
    expect(viewBoxFor(1, { x: 0, y: 0 }, h)).toEqual({ x: 0, y: 0, w: 1000, h });
    const z = viewBoxFor(2, { x: 100, y: 50 }, h);
    expect(z).toEqual({ x: 100, y: 50, w: 500, h: 325 });
  });
  it("never leaves the plan", () => {
    const v = viewBoxFor(2, { x: 9999, y: 9999 }, h);
    expect(v.x + v.w).toBeLessThanOrEqual(1000);
    expect(v.y + v.h).toBeLessThanOrEqual(h);
    expect(viewBoxFor(2, { x: -50, y: -50 }, h)).toMatchObject({ x: 0, y: 0 });
  });
  it("caps the zoom and zooms about the middle of the view", () => {
    expect(viewBoxFor(99, { x: 0, y: 0 }, h).w).toBe(1000 / 4);
    const zoomed = zoomAbout(1, { x: 0, y: 0 }, 2, h);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.pan).toEqual({ x: 250, y: 162.5 });
    expect(zoomAbout(4, { x: 0, y: 0 }, 2, h).zoom).toBe(4);
    expect(zoomAbout(1, { x: 0, y: 0 }, 0.5, h).zoom).toBe(1);
  });
});

describe("fitLabel", () => {
  it("shortens a name to the room, and drops it when only a sliver fits", () => {
    expect(fitLabel("Boardroom", 400, 24)).toBe("Boardroom");
    expect(fitLabel("Executive Boardroom", 150, 24)).toMatch(/…$/);
    expect(fitLabel("Executive Boardroom", 150, 24).length).toBeLessThan(19);
    expect(fitLabel("Kitchen", 30, 24)).toBe("");
  });
});
