import { colors } from "@/theme";
import type { ReminderPriority, ReminderStatus } from "@/api/client";

/** The colour of a reminder's priority: grey, teal, amber, red. A function so it follows the theme. */
export function priorityColor(priority: ReminderPriority): string {
  return priority === "urgent"
    ? colors.destructive
    : priority === "high"
      ? colors.warning
      : priority === "normal"
        ? colors.primary
        : colors.mutedForeground;
}

/** The colour of a reminder's status chip. */
export function statusColor(status: ReminderStatus): string {
  return status === "ignored" ? colors.destructive : status === "acknowledged" ? colors.success : status === "pending" ? colors.warning : colors.mutedForeground;
}
