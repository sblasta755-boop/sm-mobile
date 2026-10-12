import { mapWithProgress } from "./reportPhotos";

describe("mapWithProgress", () => {
  it("reports progress up to the total and keeps results in order", async () => {
    const seen: string[] = [];
    const out = await mapWithProgress([1, 2, 3, 4, 5], 2, async (n) => n * 10, (d, t) => seen.push(`${d}/${t}`));
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(seen[0]).toBe("0/5");
    expect(seen[seen.length - 1]).toBe("5/5");
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithProgress(Array.from({ length: 8 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    }, () => {});
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("treats a failed item as finished with no result instead of stopping", async () => {
    const out = await mapWithProgress([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }, () => {});
    expect(out).toEqual([1, null, 3]);
  });

  it("handles an empty list", async () => {
    const calls: number[] = [];
    expect(await mapWithProgress([], 4, async () => 1, (d) => calls.push(d))).toEqual([]);
    expect(calls).toEqual([0]);
  });
});
