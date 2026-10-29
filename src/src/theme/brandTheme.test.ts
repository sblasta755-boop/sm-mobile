import {
  brandOverrides,
  contrast,
  mergeBrandThemes,
  resolveBrandTheme,
} from "./brandTheme";
import { darkPalette, lightPalette } from "./colors";

describe("resolveBrandTheme", () => {
  it("drops malformed colours, expands shorthand and ignores unknown fonts", () => {
    const t = resolveBrandTheme({
      light: { accent: "nope", border: "#ABC" },
      fonts: { heading: "comic_sans", body: "inter" },
    });
    expect(t.light).toEqual({ border: "#aabbcc" });
    expect(t.fonts).toEqual({ body: "inter" });
  });

  it("turns a legacy primaryColor into light + lifted dark primary, unless it's an untouched default", () => {
    const t = resolveBrandTheme(undefined, "#0b1d3a");
    expect(t.light.primary).toBe("#0b1d3a");
    expect(contrast(t.dark.primary!, darkPalette.background)).toBeGreaterThan(
      3,
    );
    for (const unset of ["#006a94", "#2563eb"]) {
      expect(resolveBrandTheme(undefined, unset).light).toEqual({});
    }
  });

  it("explicit theme primary beats the legacy colour", () => {
    expect(
      resolveBrandTheme({ light: { primary: "#e11d48" } }, "#22c55e").light
        .primary,
    ).toBe("#e11d48");
  });
});

describe("brandOverrides", () => {
  it("is empty when nothing is set", () => {
    expect(brandOverrides({})).toEqual({});
  });

  it("maps editor colours onto palette entries exactly as chosen", () => {
    const o = brandOverrides({
      background: "#101820",
      text: "#eeeeee",
      primary: "#e11d48",
      primaryText: "#ffffff",
      secondary: "#222222",
      secondaryText: "#dddddd",
      accent: "#333333",
      accentText: "#cccccc",
      muted: "#444444",
      mutedText: "#bbbbbb",
      border: "#555555",
      card: "#202830",
      navBackground: "#000000",
      navText: "#ff0000",
    });
    expect(o).toMatchObject({
      background: "#101820",
      foreground: "#eeeeee",
      cardForeground: "#eeeeee",
      card: "#202830",
      primary: "#e11d48",
      primaryForeground: "#ffffff",
      secondary: "#222222",
      secondaryForeground: "#dddddd",
      accent: "#333333",
      accentForeground: "#cccccc",
      muted: "#444444",
      mutedForeground: "#bbbbbb",
      border: "#555555",
      input: "#555555",
      navBackground: "#000000",
      navForeground: "#ff0000",
    });
  });

  it("only touches colours that were set", () => {
    const o = brandOverrides({ primary: "#e11d48" });
    expect(Object.keys(o).sort()).toEqual(["primary", "primaryForeground"]);
  });

  it("picks readable text for a colour set without its text colour", () => {
    const o = brandOverrides({ primary: "#ffeb3b", accent: "#0b1d3a" });
    expect(contrast("#ffeb3b", o.primaryForeground!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast("#0b1d3a", o.accentForeground!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("makes the tab bar follow a themed background unless navigation is styled", () => {
    expect(brandOverrides({ background: "#fff7e6" }).navBackground).toBe(
      "#fff7e6",
    );
    expect(
      brandOverrides({ background: "#fff7e6", navBackground: "#111111" })
        .navBackground,
    ).toBe("#111111");
    expect(brandOverrides({ mutedText: "#777777" }).navForeground).toBe(
      "#777777",
    );
  });

  it("leaves semantic colours alone", () => {
    const o = brandOverrides({ primary: "#e11d48", background: "#000000" });
    for (const key of ["success", "warning", "destructive", "info"] as const) {
      expect(o[key]).toBeUndefined();
    }
    expect(lightPalette.success).toBeDefined();
  });
});

describe("shift card", () => {
  it("is themed on its own", () => {
    expect(
      brandOverrides({ shiftBackground: "#0a3d62", shiftText: "#f1c40f" }),
    ).toEqual({
      shiftBackground: "#0a3d62",
      shiftForeground: "#f1c40f",
    });
  });
  it("gets readable text when only the fill is set, and is untouched by page colours", () => {
    const o = brandOverrides({
      shiftBackground: "#fde68a",
      background: "#101820",
    });
    expect(contrast("#fde68a", o.shiftForeground!)).toBeGreaterThanOrEqual(4.5);
    expect(o.shiftBackground).toBe("#fde68a");
    expect(
      brandOverrides({ background: "#101820" }).shiftBackground,
    ).toBeUndefined();
  });
});

describe("mergeBrandThemes", () => {
  it("lets a site override single colours and inherit the rest", () => {
    expect(
      mergeBrandThemes(
        { light: { navBackground: "#112233" } },
        {
          light: { primary: "#e11d48", navBackground: "#000000" },
          fonts: { body: "inter" },
        },
      ),
    ).toEqual({
      light: { primary: "#e11d48", navBackground: "#112233" },
      dark: {},
      fonts: { body: "inter" },
    });
  });
});
