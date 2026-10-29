// Turns an organisation's / site's theme (separate light and dark palettes
// plus fonts) into overrides for the app Palettes. Same token names and rules
// as the web app's smart-property-operations/src/src/lib/smartclean/theme.ts -
// keep the two in step. Every colour is exactly what the admin chose; unset
// colours keep the app default. The one convenience: a colour set without the
// text that sits on it gets readable text. Semantic colours
// (success/warning/destructive/info) are never overridden.

import type { Palette } from "./colors";

export type ThemeColors = {
  background?: string;
  text?: string;
  card?: string;
  primary?: string;
  primaryText?: string;
  secondary?: string;
  secondaryText?: string;
  accent?: string;
  accentText?: string;
  muted?: string;
  mutedText?: string;
  border?: string;
  navBackground?: string;
  navText?: string;
  shiftBackground?: string;
  shiftText?: string;
};

export type ThemeFonts = { heading?: string; body?: string };

export type BrandTheme = {
  light?: ThemeColors;
  dark?: ThemeColors;
  fonts?: ThemeFonts;
};

/** Resolved form used everywhere after sanitising: every part present. */
export type ResolvedBrandTheme = {
  light: ThemeColors;
  dark: ThemeColors;
  fonts: ThemeFonts;
};

export const EMPTY_BRAND_THEME: ResolvedBrandTheme = {
  light: {},
  dark: {},
  fonts: {},
};

const COLOR_KEYS = [
  "background",
  "text",
  "card",
  "primary",
  "primaryText",
  "secondary",
  "secondaryText",
  "accent",
  "accentText",
  "muted",
  "mutedText",
  "border",
  "navBackground",
  "navText",
  "shiftBackground",
  "shiftText",
] as const;

// Keep in step with backend BRANDING_FONT_IDS and the web FONT_OPTIONS.
export const FONT_IDS = [
  "inter",
  "poppins",
  "roboto",
  "open_sans",
  "montserrat",
  "playfair_display",
  "lora",
  "merriweather",
] as const;

// Values the clients saved for orgs that never chose a colour (web and
// mobile defaults) - they mean "unset", not a chosen primary.
const UNSET_PRIMARIES = new Set(["#006a94", "#2563eb"]);

const INK = "#0b1220";
const PAPER = "#ffffff";

type Rgb = [number, number, number];
type Hsl = [number, number, number];

export function normaliseHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const h = v.startsWith("#") ? v : `#${v}`;
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{3}$/.test(h))
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return null;
}

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function toHsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: Hsl): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function readableOn(hex: string): string {
  return contrast(hex, PAPER) >= contrast(hex, INK) ? PAPER : INK;
}

/** Brand colours need to stay visible on dark surfaces: lift lightness to a floor. */
export function liftForDark(hex: string, floor = 0.62): string {
  const [h, s, l] = toHsl(hex);
  return l >= floor ? hex : fromHsl([h, s, floor]);
}

function cleanColors(colors: ThemeColors | undefined): ThemeColors {
  const out: ThemeColors = {};
  for (const key of COLOR_KEYS) {
    const hex = normaliseHex(colors?.[key]);
    if (hex) out[key] = hex;
  }
  return out;
}

/** Sanitises stored branding (plus the legacy primaryColor) into valid
 * values; anything unset or malformed is simply absent. */
export function resolveBrandTheme(
  theme: BrandTheme | undefined,
  legacyPrimary?: string,
): ResolvedBrandTheme {
  const light = cleanColors(theme?.light);
  const dark = cleanColors(theme?.dark);
  const legacy = normaliseHex(legacyPrimary);
  if (legacy && !UNSET_PRIMARIES.has(legacy)) {
    if (!light.primary) light.primary = legacy;
    if (!dark.primary) dark.primary = liftForDark(legacy);
  }
  const fonts: ThemeFonts = {};
  const known = (id: string | undefined) =>
    (FONT_IDS as readonly string[]).includes(id ?? "");
  if (theme?.fonts?.heading && known(theme.fonts.heading))
    fonts.heading = theme.fonts.heading;
  if (theme?.fonts?.body && known(theme.fonts.body))
    fonts.body = theme.fonts.body;
  return { light, dark, fonts };
}

/** Site over organisation, colour by colour and font by font. */
export function mergeBrandThemes(
  site: BrandTheme | undefined,
  tenant: BrandTheme | undefined,
): BrandTheme {
  return {
    light: { ...tenant?.light, ...site?.light },
    dark: { ...tenant?.dark, ...site?.dark },
    fonts: { ...tenant?.fonts, ...site?.fonts },
  };
}

export function isEmptyBrandTheme(theme: ResolvedBrandTheme): boolean {
  return (
    Object.keys(theme.light).length === 0 &&
    Object.keys(theme.dark).length === 0 &&
    !theme.fonts.heading &&
    !theme.fonts.body
  );
}

/** Fills each unset "*Text" colour with a readable one when the colour it sits on was set. */
function withTextFallbacks(c: ThemeColors): ThemeColors {
  const out = { ...c };
  const pairs: [keyof ThemeColors, keyof ThemeColors][] = [
    ["primaryText", "primary"],
    ["secondaryText", "secondary"],
    ["accentText", "accent"],
    ["mutedText", "muted"],
    ["navText", "navBackground"],
    ["shiftText", "shiftBackground"],
    ["text", "background"],
  ];
  for (const [text, on] of pairs) {
    const bg = out[on];
    if (!out[text] && bg) out[text] = readableOn(bg);
  }
  return out;
}

/** Palette overrides for one mode. {} when the org hasn't customised that mode. */
export function brandOverrides(
  colors: ThemeColors,
  _isLight?: boolean,
): Partial<Palette> {
  const c = withTextFallbacks(colors);
  const o: Partial<Palette> = {};
  if (c.background) o.background = c.background;
  if (c.text) {
    o.foreground = c.text;
    o.cardForeground = c.text;
  }
  if (c.card) {
    o.card = c.card;
    if (!c.text) o.cardForeground = readableOn(c.card);
  }
  if (c.primary) o.primary = c.primary;
  if (c.primaryText) o.primaryForeground = c.primaryText;
  if (c.secondary) o.secondary = c.secondary;
  if (c.secondaryText) o.secondaryForeground = c.secondaryText;
  if (c.accent) o.accent = c.accent;
  if (c.accentText) o.accentForeground = c.accentText;
  if (c.muted) o.muted = c.muted;
  if (c.mutedText) o.mutedForeground = c.mutedText;
  if (c.border) {
    o.border = c.border;
    o.input = c.border;
  }
  // The tab bar follows the page unless the admin styled navigation itself,
  // so a themed background doesn't leave a default-coloured bar behind.
  const navBg = c.navBackground ?? c.background;
  if (navBg) o.navBackground = navBg;
  const navFg = c.navText ?? c.mutedText;
  if (navFg) o.navForeground = navFg;
  if (c.shiftBackground) o.shiftBackground = c.shiftBackground;
  if (c.shiftText) o.shiftForeground = c.shiftText;
  return o;
}
