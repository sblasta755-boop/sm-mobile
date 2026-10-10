import { colors, type Palette } from "./colors";

export type StatusTone = "success" | "info" | "warning" | "destructive" | "neutral" | "muted";
type ToneStyle = { bg: string; fg: string; border: string };

const build = (c: Palette, borders: Record<"success" | "info" | "warning" | "destructive" | "neutral", string>) =>
  ({
    success: { bg: c.successSoft, fg: c.success, border: borders.success },
    info: { bg: c.infoSoft, fg: c.info, border: borders.info },
    warning: { bg: c.warningSoft, fg: c.warningForeground, border: borders.warning },
    destructive: { bg: c.destructiveSoft, fg: c.destructive, border: borders.destructive },
    neutral: { bg: borders.neutral, fg: c.neutralForeground, border: c.neutral },
    muted: { bg: c.muted, fg: c.mutedForeground, border: c.border },
  }) satisfies Record<StatusTone, ToneStyle>;

export const LIGHT_TONE_BORDERS = {
  success: "#a8ddc5",
  info: "#abcbed",
  warning: "#efd384",
  destructive: "#f4aaa4",
  neutral: "#eef1f3",
};
export const DARK_TONE_BORDERS = {
  success: "#1f5a45",
  info: "#25476b",
  warning: "#5c4a1a",
  destructive: "#6a2f2b",
  neutral: "#232f3a",
};

/** Rewritten in place when the theme changes, like `colors`. */
export const status: Record<StatusTone, ToneStyle> = build(colors, LIGHT_TONE_BORDERS);

export function refreshStatus(borders: typeof LIGHT_TONE_BORDERS) {
  Object.assign(status, build(colors, borders));
}
