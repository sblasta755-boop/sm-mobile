import { buildConfig, classify, dayKey, freshState, reconcile, shiftEndAt, step, type Fix, type GeofenceConfig, type MachineState } from "./geofenceClock";

const config: GeofenceConfig = {
  userId: "u1",
  siteId: "s1",
  latitude: -26.2,
  longitude: 28.0,
  radiusMeters: 150,
  graceMinutes: 10,
  overtimeCheck: true,
  shiftEnd: "16:00",
};
// 0.0003 deg of latitude is about 33 m; 0.01 is about 1.1 km.
const INSIDE = { latitude: -26.2 + 0.0003, longitude: 28.0 };
const OUTSIDE = { latitude: -26.2 + 0.01, longitude: 28.0 };
const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m, 0);
const fix = (p: { latitude: number; longitude: number }, t: Date, accuracy = 10): Fix => ({ ...p, accuracy, at: t.toISOString() });
const start = (clockedIn = true): MachineState => freshState(at(8), clockedIn);

describe("classify", () => {
  it("ignores fixes that are too imprecise", () => {
    expect(classify(fix(OUTSIDE, at(9), 400), config)).toBe("unusable");
  });
  it("treats the edge of the radius as unsure, not outside", () => {
    const edge = { latitude: -26.2 + 0.00145, longitude: 28.0 }; // about 161 m
    expect(classify(fix(edge, at(9), 5), config)).toBe("unsure");
    expect(classify(fix(OUTSIDE, at(9)), config)).toBe("outside");
  });
});

describe("leaving", () => {
  it("does not clock out the moment someone steps outside", () => {
    const out = step({ state: start(), config, fix: fix(OUTSIDE, at(12, 0)), now: at(12, 0) });
    expect(out.actions).toEqual([]);
    expect(out.state.outsideSince).toBe(at(12, 0).toISOString());
  });

  it("clocks out after the grace period, at the time they left, not when the grace ended", () => {
    let s = step({ state: start(), config, fix: fix(OUTSIDE, at(12, 0)), now: at(12, 0) }).state;
    const result = step({ state: s, config, fix: fix(OUTSIDE, at(12, 11)), now: at(12, 11) });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ type: "clock_out", at: at(12, 0).toISOString(), reason: "left_site" });
    expect(result.state.clockedIn).toBe(false);
    expect(result.state.autoOutAt).toBe(at(12, 0).toISOString());
  });

  it("a quick walk to the car park that comes back in time does not clock out", () => {
    let s = step({ state: start(), config, fix: fix(OUTSIDE, at(12, 0)), now: at(12, 0) }).state;
    s = step({ state: s, config, fix: fix(INSIDE, at(12, 6)), now: at(12, 6) }).state;
    expect(s.outsideSince).toBeNull();
    const later = step({ state: s, config, fix: fix(INSIDE, at(12, 30)), now: at(12, 30) });
    expect(later.actions).toEqual([]);
  });

  it("jitter at the edge neither starts nor resets the timer", () => {
    const edge = { latitude: -26.2 + 0.00145, longitude: 28.0 };
    const r = step({ state: start(), config, fix: fix(edge, at(12, 0), 5), now: at(12, 0) });
    expect(r.state.outsideSince).toBeNull();
  });

  it("when nothing was seen for a while, clocks out at the last time they were provably inside", () => {
    let s = step({ state: start(), config, fix: fix(INSIDE, at(12, 0)), now: at(12, 0) }).state;
    // the page or phone was asleep until a fix outside an hour later
    const r = step({ state: s, config, fix: fix(OUTSIDE, at(13, 0)), now: at(13, 0) });
    expect(r.actions[0]).toMatchObject({ type: "clock_out", at: at(12, 0).toISOString() });
  });

  it("with frequent fixes the first fix outside is the time left", () => {
    let s = step({ state: start(), config, fix: fix(INSIDE, at(12, 0)), now: at(12, 0) }).state;
    s = step({ state: s, config, fix: fix(OUTSIDE, at(12, 3)), now: at(12, 3) }).state;
    expect(s.outsideSince).toBe(at(12, 3).toISOString());
  });

  it("with no grace period it clocks out on the first fix outside", () => {
    const r = step({ state: start(), config: { ...config, graceMinutes: 0 }, fix: fix(OUTSIDE, at(12, 0)), now: at(12, 0) });
    expect(r.actions[0]).toMatchObject({ type: "clock_out" });
  });
});

describe("returning", () => {
  const out = (): MachineState => ({ ...start(false), autoOutAt: at(12, 0).toISOString() });

  it("clocks back in after a short dwell inside, at the time they returned", () => {
    let s = step({ state: out(), config, fix: fix(INSIDE, at(13, 0)), now: at(13, 0) }).state;
    expect(s.insideSince).toBe(at(13, 0).toISOString());
    const r = step({ state: s, config, fix: fix(INSIDE, at(13, 3)), now: at(13, 3) });
    expect(r.actions[0]).toMatchObject({ type: "clock_in", at: at(13, 0).toISOString(), reason: "returned" });
    expect(r.state.clockedIn).toBe(true);
  });

  it("does not clock in someone who clocked out by hand", () => {
    const manual = start(false);
    const r = step({ state: manual, config, fix: fix(INSIDE, at(13, 0)), now: at(13, 0) });
    expect(r.actions).toEqual([]);
    const later = step({ state: r.state, config, fix: fix(INSIDE, at(13, 30)), now: at(13, 30) });
    expect(later.actions).toEqual([]);
  });

  it("does not clock back in after the shift has ended", () => {
    const r = step({ state: out(), config, fix: fix(INSIDE, at(16, 30)), now: at(16, 30) });
    expect(r.actions).toEqual([]);
    expect(r.state.autoOutAt).toBeNull();
  });
});

describe("overtime", () => {
  it("asks once, after shift end, while still on site", () => {
    const early = step({ state: start(), config, fix: fix(INSIDE, at(16, 5)), now: at(16, 5) });
    expect(early.actions).toEqual([]);
    const ask = step({ state: early.state, config, fix: fix(INSIDE, at(16, 12)), now: at(16, 12) });
    expect(ask.actions).toEqual([{ type: "ask_overtime", day: dayKey(at(16, 12)) }]);
    const again = step({ state: ask.state, config, fix: fix(INSIDE, at(17, 0)), now: at(17, 0) });
    expect(again.actions).toEqual([]);
  });

  it("does not ask when the organisation has the check off, or the site has no shift end", () => {
    expect(step({ state: start(), config: { ...config, overtimeCheck: false }, fix: fix(INSIDE, at(17)), now: at(17) }).actions).toEqual([]);
    expect(step({ state: start(), config: { ...config, shiftEnd: null }, fix: fix(INSIDE, at(17)), now: at(17) }).actions).toEqual([]);
  });

  it("does not ask someone who is not clocked in", () => {
    expect(step({ state: start(false), config, fix: fix(INSIDE, at(17)), now: at(17) }).actions).toEqual([]);
  });
});

describe("reconcile and shift end", () => {
  it("a manual clock-out ends automatic tracking", () => {
    const s: MachineState = { ...start(true), outsideSince: at(12).toISOString() };
    const r = reconcile(s, false, at(12, 5));
    expect(r).toMatchObject({ clockedIn: false, outsideSince: null, autoOutAt: null });
  });
  it("a new day starts clean", () => {
    const s: MachineState = { ...start(false), autoOutAt: at(12).toISOString() };
    const next = reconcile(s, false, new Date(2026, 9, 16, 7, 0));
    expect(next.autoOutAt).toBeNull();
    expect(next.day).toBe("2026-10-16");
  });
  it("reads the shift end as a local time", () => {
    expect(shiftEndAt(at(9), "16:00")?.getHours()).toBe(16);
    expect(shiftEndAt(at(9), null)).toBeNull();
  });
});

describe("buildConfig", () => {
  const site = { id: "s1", latitude: -26.2, longitude: 28.0, radiusMeters: 150, workingHours: { end: "16:00" } };
  const org = { enabled: true, graceMinutes: 7, overtimeCheck: false };
  it("follows the organisation, and the site's own setting wins", () => {
    expect(buildConfig({ userId: "u", site, autoClock: org })).toMatchObject({ graceMinutes: 7, overtimeCheck: false, shiftEnd: "16:00" });
    expect(buildConfig({ userId: "u", site: { ...site, autoClock: false }, autoClock: org })).toBeNull();
    expect(buildConfig({ userId: "u", site: { ...site, autoClock: true }, autoClock: { ...org, enabled: false } })).not.toBeNull();
  });
  it("is off without a location on the site or without a policy", () => {
    expect(buildConfig({ userId: "u", site: { id: "s1" }, autoClock: org })).toBeNull();
    expect(buildConfig({ userId: "u", site, autoClock: undefined })).toBeNull();
  });
});
