export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  warningForeground: string;
  destructive: string;
  destructiveSoft: string;
  info: string;
  infoSoft: string;
  neutral: string;
  neutralForeground: string;
  // Bottom tab bar. Defaults match the page, so only a themed org sees a difference.
  navBackground: string;
  navForeground: string;
  // "Today's shift" card on the home screens - themed on its own.
  shiftBackground: string;
  shiftForeground: string;
  overlay: string;
  white: string;
  black: string;
};

export const lightPalette: Palette = {
  background: "#f8fbfc",
  foreground: "#182531",
  card: "#ffffff",
  cardForeground: "#182531",
  primary: "#21779b",
  primaryForeground: "#ffffff",
  secondary: "#eef4f7",
  secondaryForeground: "#182531",
  muted: "#eef3f5",
  mutedForeground: "#6f7b87",
  accent: "#dff2f7",
  accentForeground: "#182531",
  border: "#dfe8ec",
  input: "#d9e3e8",
  success: "#209c68",
  successSoft: "#e4f6ee",
  warning: "#f0b42a",
  warningSoft: "#fff4d8",
  warningForeground: "#4b3400",
  destructive: "#d3382c",
  destructiveSoft: "#fde8e6",
  info: "#2d74c4",
  infoSoft: "#e5f0fb",
  neutral: "#d5dade",
  neutralForeground: "#56616d",
  navBackground: "#f8fbfc",
  navForeground: "#6f7b87",
  shiftBackground: "#182531",
  shiftForeground: "#ffffff",
  overlay: "rgba(0,0,0,0.56)",
  white: "#ffffff",
  black: "#000000",
};

// Not an inverted light palette: surfaces step up in lightness (background <
// card < secondary) so cards still read as raised, accents are lifted so they
// keep their contrast on a dark surface, and the "soft" tints are deep, muted
// versions of their colour rather than pastels.
export const darkPalette: Palette = {
  background: "#0e151c",
  foreground: "#e8eef3",
  card: "#17212b",
  cardForeground: "#e8eef3",
  primary: "#3a9bc1",
  primaryForeground: "#04141c",
  secondary: "#1e2a35",
  secondaryForeground: "#e8eef3",
  muted: "#1b2631",
  mutedForeground: "#93a1ae",
  accent: "#163847",
  accentForeground: "#e8eef3",
  border: "#2a3744",
  input: "#344352",
  success: "#3fbf8a",
  successSoft: "#12332a",
  warning: "#f2c24b",
  warningSoft: "#3a2f10",
  warningForeground: "#f6d98a",
  destructive: "#f06a5f",
  destructiveSoft: "#3b1a18",
  info: "#5aa2e6",
  infoSoft: "#14283d",
  neutral: "#3a4651",
  neutralForeground: "#b9c4cd",
  navBackground: "#0e151c",
  navForeground: "#93a1ae",
  shiftBackground: "#182531",
  shiftForeground: "#ffffff",
  overlay: "rgba(0,0,0,0.7)",
  white: "#ffffff",
  black: "#000000",
};

/**
 * The live palette. Every screen reads `colors.x` at render time, so applying
 * a theme just rewrites these values in place (see theme/themeStore.ts) - the
 * object identity never changes, which is what lets 80-odd files keep the same
 * import.
 */
export const colors: Palette = { ...lightPalette };
