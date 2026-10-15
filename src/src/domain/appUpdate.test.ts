import { parseRelease, shouldPrompt, updateState, type AppRelease } from "./appUpdate";

const release = (over: Partial<AppRelease> = {}): AppRelease => ({
  versionCode: 20,
  versionName: "v1.2",
  downloadUrl: "https://cdn.example.com/a.apk",
  notes: "",
  minSupportedCode: 0,
  ...over,
});

describe("updateState", () => {
  it("is current when up to date or ahead", () => {
    expect(updateState(20, release())).toBe("current");
    expect(updateState(25, release())).toBe("current");
  });
  it("is available when behind the newest build", () => {
    expect(updateState(19, release())).toBe("available");
  });
  it("is required below the floor", () => {
    expect(updateState(10, release({ minSupportedCode: 15 }))).toBe("required");
    expect(updateState(15, release({ minSupportedCode: 15 }))).toBe("available");
  });
  it("never nags or locks out on missing data", () => {
    expect(updateState(null, release({ minSupportedCode: 99 }))).toBe("current");
    expect(updateState(10, null)).toBe("current");
    expect(updateState(NaN, release())).toBe("current");
  });
});

describe("shouldPrompt", () => {
  const now = 1_000_000;
  it("prompts when never postponed", () => expect(shouldPrompt(release(), null, now)).toBe(true));
  it("stays quiet while postponed", () => {
    expect(shouldPrompt(release(), { code: 20, until: now + 1 }, now)).toBe(false);
  });
  it("prompts again after the snooze or for a newer build", () => {
    expect(shouldPrompt(release(), { code: 20, until: now }, now)).toBe(true);
    expect(shouldPrompt(release({ versionCode: 21 }), { code: 20, until: now + 999 }, now)).toBe(true);
  });
});

describe("parseRelease", () => {
  it("accepts a well-formed answer", () => {
    expect(parseRelease({ versionCode: 3, versionName: "v3", downloadUrl: "https://x/y.apk" })?.versionCode).toBe(3);
  });
  it("rejects junk and non-https links", () => {
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ versionCode: "3", downloadUrl: "https://x" })).toBeNull();
    expect(parseRelease({ versionCode: 3, downloadUrl: "http://x/y.apk" })).toBeNull();
  });
});
