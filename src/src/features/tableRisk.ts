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
