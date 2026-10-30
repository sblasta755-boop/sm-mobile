import { canSeeAllSites, canSeeStockOverview, donutSlices, rand, randShort, share } from "./stockOverview";

describe("stock overview helpers", () => {
  it("writes rand like the web screen", () => {
    expect(rand(654208.99)).toBe("R654 208,99");
    expect(rand(1200)).toBe("R1 200");
    expect(randShort(383332)).toBe("R383k");
    expect(randShort(1500)).toBe("R1,5k");
    expect(randShort(2_400_000)).toBe("R2,4m");
  });

  it("shares", () => {
    expect(share(25, 200)).toBe(13);
    expect(share(1, 0)).toBe(0);
  });

  it("only managers see insights, and only the top two roles see every site", () => {
    expect(canSeeStockOverview("site_manager")).toBe(true);
    expect(canSeeStockOverview("supervisor")).toBe(false);
    expect(canSeeStockOverview("cleaner")).toBe(false);
    expect(canSeeAllSites("operations_manager")).toBe(true);
    expect(canSeeAllSites("site_manager")).toBe(false);
  });

  it("cuts a donut into slices that add up to the circle", () => {
    const slices = donutSlices([{ name: "A", value: 75 }, { name: "B", value: 25 }, { name: "C", value: 0 }], 100, 0);
    expect(slices.map((s) => [s.name, s.length, s.offset])).toEqual([["A", 75, 0], ["B", 25, 75]]);
    const gapped = donutSlices([{ name: "A", value: 50 }, { name: "B", value: 50 }], 100, 4);
    expect(gapped.map((s) => s.length)).toEqual([46, 46]);
    expect(donutSlices([{ name: "A", value: 10 }], 100, 4)[0].length).toBe(100);
  });
});
