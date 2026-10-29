import { brandOverrides, contrast, resolveBrandTheme } from "./brandTheme";

describe("resolveBrandTheme", () => {
  it("uses legacy primaryColor unless it is an untouched default", () => {
    expect(resolveBrandTheme(undefined, "#e11d48").primary).toBe("#e11d48");
    expect(resolveBrandTheme(undefined, "#006a94").primary).toBeUndefined();
    expect(resolveBrandTheme(undefined, "#2563eb").primary).toBeUndefined();
  });
  it("drops malformed slots and expands shorthand", () => {
    expect(resolveBrandTheme({ accent: "nope", sidebar: "#ABC" })).toEqual({ sidebar: "#aabbcc" });
  });
});

describe("brandOverrides", () => {
  it("is empty for an empty palette", () => {
    expect(brandOverrides({}, true)).toEqual({});
    expect(brandOverrides({}, false)).toEqual({});
  });

  it.each([
    { primary: "#ffeb3b" },
    { primary: "#0b1d3a" },
    { primary: "#e11d48", accent: "#22c55e" },
    { background: "#101820", surface: "#1c2733" },
    { background: "#fff7e6", surface: "#ffffff", primary: "#7c3aed" },
  ])("keeps text readable in both modes (%o)", (palette) => {
    for (const isLight of [true, false]) {
      const o = brandOverrides(palette, isLight);
      if (o.primary && o.primaryForeground) {
        expect(contrast(o.primary, o.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      }
      if (o.background && o.foreground) {
        expect(contrast(o.background, o.foreground)).toBeGreaterThanOrEqual(4.5);
      }
      if (o.card && o.cardForeground) {
        expect(contrast(o.card, o.cardForeground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("lifts a dark primary on the dark theme", () => {
    expect(contrast(brandOverrides({ primary: "#0b1d3a" }, false).primary!, "#0e151c")).toBeGreaterThan(3);
  });

  it("makes a dark page from a light background in dark mode", () => {
    expect(contrast(brandOverrides({ background: "#fff7e6" }, false).background!, "#ffffff")).toBeGreaterThan(10);
  });
});
