import type { TableSession } from "@/types/smartclean";

export type RiskLevel = NonNullable<TableSession["riskLevel"]>;

const ORDER: Record<RiskLevel, number> = { at_risk: 0, watch: 1, ok: 2 };

/** Open tables most in need of attention first, otherwise oldest first. */
export function sortByRisk<T extends Pick<TableSession, "riskLevel" | "startedAt">>(sessions: T[]): T[] {
  return [...sessions].sort(
    (a, b) =>
      ORDER[a.riskLevel ?? "ok"] - ORDER[b.riskLevel ?? "ok"] ||
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
}

export function riskLabel(level: RiskLevel | undefined): string | null {
  if (level === "at_risk") return "May be leaving";
  if (level === "watch") return "Check on this table";
  return null;
}

/** "45 min", "2h 05m", "3 days" - how long since `iso`. */
export function elapsedLabel(iso: string, now = Date.now()): string {
  const total = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (total < 60) return `${total} min`;
  if (total < 24 * 60) return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
  const days = Math.floor(total / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** "16:07" for today, "Mon 16:07" for anything older. */
export function startedLabel(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}
