import { distanceM, nearestBeacon } from "./nearestBeacon";

const b = (id: string, latitude: number) => ({ id, latitude, longitude: 28 });

describe("nearestBeacon", () => {
  it("measures roughly 111 m per thousandth of a degree of latitude", () => {
    expect(Math.round(distanceM({ latitude: -26, longitude: 28 }, { latitude: -26.001, longitude: 28 }))).toBe(111);
  });

  it("picks the closest sign inside the limit", () => {
    const here = { latitude: -26.0, longitude: 28 };
    const found = nearestBeacon(here, [b("far", -26.01), b("near", -26.0002), b("mid", -26.0005)], 100);
    expect(found?.beacon.id).toBe("near");
  });

  it("returns nothing when no sign is close enough, there is no position, or the only one is excluded", () => {
    const here = { latitude: -26.0, longitude: 28 };
    expect(nearestBeacon(here, [b("far", -26.01)], 100)).toBeNull();
    expect(nearestBeacon(null, [b("near", -26.0001)], 100)).toBeNull();
    expect(nearestBeacon(here, [b("near", -26.0001)], 100, "near")).toBeNull();
  });
});
