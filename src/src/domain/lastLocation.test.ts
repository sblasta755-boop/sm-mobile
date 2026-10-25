import {
  buildPath,
  freshLocation,
  isDraftFresh,
  isRememberable,
  MAX_AGE_MS,
  worthRestoring,
  type SavedLocation,
} from "./lastLocation";

const saved = (over: Partial<SavedLocation> = {}): SavedLocation => ({
  userId: "u1",
  path: "/tasks/t1/evidence?item=c2",
  scrollY: 120,
  savedAt: 1_000_000,
  ...over,
});

describe("what is worth remembering", () => {
  it("never returns to sign-in, lock or onboarding screens", () => {
    for (const path of [
      "/",
      "/login",
      "/lock",
      "/welcome",
      "/set-password",
      "/onboard-scan",
    ]) {
      expect(isRememberable(path)).toBe(false);
    }
    expect(isRememberable("/tasks/t1/evidence")).toBe(true);
    expect(isRememberable("/home")).toBe(true);
  });
  it("keeps query params but not dynamic path segments", () => {
    expect(buildPath("/tasks/t1/evidence", { taskId: "t1", item: "c2" })).toBe(
      "/tasks/t1/evidence?item=c2",
    );
    expect(buildPath("/home", {})).toBe("/home");
    expect(buildPath("/incidents/new", { locationId: "", taskId: "t9" })).toBe(
      "/incidents/new?taskId=t9",
    );
  });
});

describe("when a saved place is used", () => {
  const now = 1_000_000 + 60_000;
  it("is used for the same person within the time limit", () => {
    expect(freshLocation(saved(), "u1", now)).not.toBeNull();
  });
  it("is dropped for another person, when too old, or when from the future", () => {
    expect(freshLocation(saved(), "u2", now)).toBeNull();
    expect(freshLocation(saved(), "u1", 1_000_000 + MAX_AGE_MS + 1)).toBeNull();
    expect(
      freshLocation(saved({ savedAt: now + 10 * 60_000 }), "u1", now),
    ).toBeNull();
    expect(freshLocation(null, "u1", now)).toBeNull();
    expect(freshLocation(saved(), undefined, now)).toBeNull();
  });
  it("is not worth going to when it is just the person's home screen", () => {
    expect(worthRestoring(saved({ path: "/home" }), "/home")).toBe(false);
    expect(worthRestoring(saved(), "/home")).toBe(true);
    expect(worthRestoring(null, "/home")).toBe(false);
  });
  it("keeps drafts for a day", () => {
    expect(isDraftFresh(1_000_000, 1_000_000 + 23 * 3600_000)).toBe(true);
    expect(isDraftFresh(1_000_000, 1_000_000 + 25 * 3600_000)).toBe(false);
  });
});
