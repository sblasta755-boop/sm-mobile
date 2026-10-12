import { dateWindows } from "./dateWindows";

const spanDays = (w: { start: string; end: string }) =>
  (new Date(w.end).getTime() - new Date(w.start).getTime()) / 86_400_000;

describe("dateWindows", () => {
  it("splits 90 days into windows the server accepts, with no gap or overlap", () => {
    const windows = dateWindows(new Date(2026, 9, 12), 90, 45);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((w) => spanDays(w) <= 45)).toBe(true);
    expect(windows[0].start).toBe("2026-07-14");
    expect(windows[windows.length - 1].end).toBe("2026-10-12");
    for (let i = 1; i < windows.length; i++) {
      const gap = (new Date(windows[i].start).getTime() - new Date(windows[i - 1].end).getTime()) / 86_400_000;
      expect(gap).toBe(1);
    }
  });

  it("uses a single window when the range already fits", () => {
    expect(dateWindows(new Date(2026, 9, 12), 30, 60)).toEqual([{ start: "2026-09-12", end: "2026-10-12" }]);
  });
});
