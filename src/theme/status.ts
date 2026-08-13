import { colors } from "./colors";

export type StatusTone = "success" | "info" | "warning" | "destructive" | "neutral" | "muted";

export const status = {
  success: { bg: colors.successSoft, fg: colors.success, border: "#a8ddc5" },
  info: { bg: colors.infoSoft, fg: colors.info, border: "#abcbed" },
  warning: { bg: colors.warningSoft, fg: colors.warningForeground, border: "#efd384" },
  destructive: { bg: colors.destructiveSoft, fg: colors.destructive, border: "#f4aaa4" },
  neutral: { bg: "#eef1f3", fg: colors.neutralForeground, border: colors.neutral },
  muted: { bg: colors.muted, fg: colors.mutedForeground, border: colors.border },
} satisfies Record<StatusTone, { bg: string; fg: string; border: string }>;
