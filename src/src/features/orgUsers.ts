import type { StatusTone } from "@/theme";

/** Shared by the platform operator's Users and User screens. */

export function roleLabel(role: string): string {
  const text = role.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type UserState = "active" | "pending" | "archived";

export function userState(status: string): UserState {
  if (status === "Pending Activation") return "pending";
  if (status === "Inactive") return "archived";
  return "active";
}

export const STATE_INFO: Record<UserState, { label: string; tone: StatusTone }> = {
  active: { label: "Active", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  archived: { label: "Archived", tone: "muted" },
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatWhen(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return withTime
    ? d.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}
