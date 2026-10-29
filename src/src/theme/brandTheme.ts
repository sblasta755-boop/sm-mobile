// Turns an organisation's / site's brand palette into overrides for the
// light and dark Palettes. Same algorithm as the web app's
// smart-property-operations/src/src/lib/smartclean/theme.ts - keep the two
// in step. Orgs only pick a few light-mode colours; readable foregrounds and
// dark variants are derived so a palette can never produce unreadable text.
// Semantic colours (success/warning/destructive/info) are never overridden.
// There is no sidebar on mobile, so that slot is ignored here.

import type { Palette } from "./colors";

export type BrandTheme = {
  primary?: string;
  accent?: string;
  sidebar?: string;
  background?: string;
  surface?: string;
};

type Rgb = [number, number, number];
type Hsl = [number, number, number];

// Values the clients saved for orgs that never chose a colour (web and
// mobile defaults) - they mean "unset", not a chosen primary.
const UNSET_PRIMARIES = new Set(["#006a94", "#2563eb"]);

const SLOTS = ["primary", "accent", "sidebar", "background", "surface"] as const;
const INK = "#0b1220";
const PAPER = "#ffffff";

export function normaliseHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
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

function mix(a: string, b: string, t: number): string {
  const ra = toRgb(a);
  const rb = toRgb(b);
  return toHex(ra.map((c, i) => c + (rb[i] - c) * t) as Rgb);
}

function withLightness(hex: string, lightness: number, maxSaturation = 0.4): string {
  const [h, s] = toHsl(hex);
  return fromHsl([h, Math.min(s, maxSaturation), lightness]);
}

function liftForDark(hex: string, floor = 0.62): string {
  const [h, s, l] = toHsl(hex);
  return l >= floor ? hex : fromHsl([h, s, floor]);
}

/** Sanitises stored branding into valid hex slots; unset/malformed slots are absent. */
export function resolveBrandTheme(
  theme: BrandTheme | undefined,
  legacyPrimary?: string,
): BrandTheme {
  const out: BrandTheme = {};
  for (const slot of SLOTS) {
    const hex = normaliseHex(theme?.[slot]);
    if (hex) out[slot] = hex;
  }
  if (!out.primary) {
    const legacy = normaliseHex(legacyPrimary);
    if (legacy && !UNSET_PRIMARIES.has(legacy)) out.primary = legacy;
  }
  return out;
}

/** Palette overrides for one mode. {} when the org hasn't customised anything. */
export function brandOverrides(theme: BrandTheme, isLight: boolean): Partial<Palette> {
  const o: Partial<Palette> = {};

  if (theme.primary) {
    const primary = isLight ? theme.primary : liftForDark(theme.primary);
    o.primary = primary;
    o.primaryForeground = readableOn(primary);
  }

  if (theme.accent) {
    const tint = isLight
      ? mix(theme.accent, PAPER, 0.82)
      : mix(withLightness(theme.accent, 0.5), INK, 0.7);
    o.accent = tint;
  }

  const page = theme.background
    ? isLight
      ? theme.background
      : withLightness(theme.background, 0.07)
    : null;
  const card = theme.surface
    ? isLight
      ? theme.surface
      : withLightness(theme.surface, 0.14)
    : null;

  if (page) {
    o.background = page;
    o.foreground = isLight ? readableOn(page) : "#e8eef3";
  }
  if (card) {
    const fg = isLight ? readableOn(card) : "#e8eef3";
    o.card = card;
    o.cardForeground = fg;
    o.muted = mix(card, fg, isLight ? 0.07 : 0.1);
    o.secondary = mix(card, fg, isLight ? 0.05 : 0.14);
    o.mutedForeground = mix(fg, card, 0.38);
  }
  if (isLight && (page || card)) {
    const base = card ?? page ?? PAPER;
    const edge = mix(base, readableOn(base), 0.14);
    o.border = edge;
    o.input = edge;
  }
  return o;
}
