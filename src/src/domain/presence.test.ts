import { BATCH_SIZE, MAX_QUEUED, enqueue, heartbeatIntervalMs, isPermanentFailure, mapPermission, shouldWarn, tooSoon, type QueuedSample } from "./presence";

const sample = (i: number): QueuedSample => ({ source: "native_bg", permission: "always", capturedAt: new Date(2026, 10, 12, 9, i).toISOString() });

describe("heartbeatIntervalMs", () => {
  it("fits several heartbeats inside the gap", () => {
    expect(heartbeatIntervalMs(75)).toBe(5 * 60_000);
    expect(heartbeatIntervalMs(20)).toBe(5 * 60_000);
    expect(heartbeatIntervalMs(10)).toBe(150_000);
  });
  it("never goes below a minute and falls back on a bad gap", () => {
    expect(heartbeatIntervalMs(1)).toBe(60_000);
    expect(heartbeatIntervalMs(NaN)).toBe(5 * 60_000);
  });
});

describe("mapPermission", () => {
  const base = { foregroundGranted: true, foregroundCanAskAgain: true, backgroundGranted: true, servicesEnabled: true };
  it("reports location switched off before anything else", () => {
    expect(mapPermission({ ...base, servicesEnabled: false })).toBe("off");
  });
  it("tells never-asked from refused", () => {
    expect(mapPermission({ ...base, foregroundGranted: false })).toBe("unknown");
    expect(mapPermission({ ...base, foregroundGranted: false, foregroundCanAskAgain: false })).toBe("denied");
  });
  it("tells all-the-time from while-using", () => {
    expect(mapPermission(base)).toBe("always");
    expect(mapPermission({ ...base, backgroundGranted: false })).toBe("foreground");
  });
});

describe("enqueue", () => {
  it("keeps the newest samples, oldest first", () => {
    let queue: QueuedSample[] = [];
    for (let i = 0; i < MAX_QUEUED + 5; i++) queue = enqueue(queue, sample(i % 60));
    expect(queue).toHaveLength(MAX_QUEUED);
    expect(BATCH_SIZE).toBeGreaterThanOrEqual(MAX_QUEUED);
  });
});

describe("tooSoon / shouldWarn / isPermanentFailure", () => {
  it("skips a sample right after another", () => {
    expect(tooSoon(null, 1000)).toBe(false);
    expect(tooSoon(1000, 20_000)).toBe(true);
    expect(tooSoon(1000, 60_000)).toBe(false);
  });
  it("warns at most every half hour", () => {
    expect(shouldWarn(null, 0)).toBe(true);
    expect(shouldWarn(0, 10 * 60_000)).toBe(false);
    expect(shouldWarn(0, 31 * 60_000)).toBe(true);
  });
  it("drops a refused sample but keeps one that only met a bad connection", () => {
    expect(isPermanentFailure(422)).toBe(true);
    expect(isPermanentFailure(401)).toBe(false);
    expect(isPermanentFailure(429)).toBe(false);
    expect(isPermanentFailure(503)).toBe(false);
    expect(isPermanentFailure(undefined)).toBe(false);
  });
});
