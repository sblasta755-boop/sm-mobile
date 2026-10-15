import { resolveOfflineScan, type ScanLocation, type ScanSite, type ScanTask } from "./offlineScan";

const site: ScanSite = {
  id: "s1",
  name: "HQ",
  code: "SITE-1",
  geofence: { latitude: -26.0, longitude: 28.0, radiusMeters: 100 },
};
const room: ScanLocation = { id: "l1", siteId: "s1", name: "Boardroom", qr: "ROOM-1" };
const now = new Date(2026, 9, 15, 10, 0);
const today = new Date(2026, 9, 15, 12, 0).toISOString();
const task = (over: Partial<ScanTask>): ScanTask => ({
  id: "t1",
  locationId: "l1",
  requiredQr: "ROOM-1",
  assigneeId: "u1",
  status: "assigned",
  scheduledAt: today,
  siteId: "s1",
  ...over,
});
const base = { userId: "u1", sites: [site], locations: [room], clockedIn: false, now };
const near = { latitude: -26.0003, longitude: 28.0 };
const far = { latitude: -26.01, longitude: 28.0 };

describe("resolveOfflineScan", () => {
  it("clocks in on the site code when on site, and out when already in", () => {
    const inn = resolveOfflineScan({ ...base, code: "SITE-1", tasks: [], coords: near });
    expect(inn.ok && inn.kind === "site" && inn.direction).toBe("in");
    const out = resolveOfflineScan({ ...base, code: "SITE-1", tasks: [], coords: near, clockedIn: true });
    expect(out.ok && out.kind === "site" && out.direction).toBe("out");
  });
  it("refuses a site scan from outside the boundary or with no location, with the server's wording", () => {
    const outside = resolveOfflineScan({ ...base, code: "SITE-1", tasks: [], coords: far });
    expect(!outside.ok && outside.reason).toContain("move within 100m");
    const none = resolveOfflineScan({ ...base, code: "SITE-1", tasks: [], coords: null });
    expect(!none.ok && none.reason).toContain("Enable location access");
  });
  it("lets a site with no boundary through, unverified", () => {
    const open = { ...site, geofence: {} };
    const r = resolveOfflineScan({ ...base, sites: [open], code: "SITE-1", tasks: [], coords: null });
    expect(r.ok && r.kind === "site" && r.geofenceVerified).toBe(false);
  });
  it("opens today's task assigned to me at the room, resuming one already started", () => {
    const r = resolveOfflineScan({
      ...base, code: "ROOM-1", coords: near,
      tasks: [task({ id: "a" }), task({ id: "b", status: "in_progress" }), task({ id: "x", assigneeId: "u2" })],
    });
    expect(r.ok && r.kind === "room" && r.task?.id).toBe("b");
  });
  it("ignores another day's task and another person's, and says when nothing is assigned", () => {
    const old = new Date(2026, 9, 14, 12, 0).toISOString();
    const r = resolveOfflineScan({ ...base, code: "ROOM-1", coords: near, tasks: [task({ scheduledAt: old })] });
    expect(r.ok && r.kind === "room" && r.task).toBeNull();
  });
  it("keeps to one task at a time and checks the boundary only when there is a task", () => {
    const busy = task({ id: "other", locationId: "l2", requiredQr: "ROOM-2", status: "in_progress" });
    const r = resolveOfflineScan({ ...base, code: "ROOM-1", coords: near, tasks: [task({}), busy] });
    expect(!r.ok && r.reason).toContain("Finish and submit");
    const tooFar = resolveOfflineScan({ ...base, code: "ROOM-1", coords: far, tasks: [task({})] });
    expect(!tooFar.ok && tooFar.reason).toContain("move within");
    const noTask = resolveOfflineScan({ ...base, code: "ROOM-1", coords: far, tasks: [] });
    expect(noTask.ok).toBe(true);
  });
  it("does not know a code it has never seen", () => {
    const r = resolveOfflineScan({ ...base, code: "NOPE", tasks: [], coords: near });
    expect(!r.ok && r.reason).toContain("not on this phone");
  });
});
