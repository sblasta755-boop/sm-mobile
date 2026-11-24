import type { TournamentFormat, TournamentMatch, TournamentStatus } from "@/api/client";

// Mirrors the web client's lib/smartclean/tournament.ts; keep both in step.

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  single_elim: "Knockout",
  round_robin: "Round robin",
};

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Not open yet",
  registration: "Registration open",
  closed: "Registration closed",
  running: "In play",
  completed: "Finished",
  cancelled: "Cancelled",
};

export type StatusTone = "success" | "info" | "warning" | "destructive" | "neutral" | "muted";

export const STATUS_TONE: Record<TournamentStatus, StatusTone> = {
  draft: "muted",
  registration: "info",
  closed: "warning",
  running: "success",
  completed: "neutral",
  cancelled: "muted",
};

/** Name of a round in a knockout, counted back from the final. */
export function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-finals";
  if (fromEnd === 2) return "Quarter-finals";
  return `Round ${round}`;
}

/** Matches grouped by round, in position order. */
export function matchesByRound(matches: TournamentMatch[]): TournamentMatch[][] {
  const out: TournamentMatch[][] = [];
  for (const m of [...matches].sort((a, b) => a.round - b.round || a.position - b.position)) {
    (out[m.round - 1] ??= []).push(m);
  }
  return out.filter(Boolean);
}

/** Whether a match can have its winner picked: both players known, not a bye. */
export function canPick(m: TournamentMatch): boolean {
  return Boolean(m.a && m.b) && m.status !== "bye";
}

/** The start times offered when creating a tournament on a phone, as hours from now. */
export const START_CHOICES: { label: string; hours: number }[] = [
  { label: "Now", hours: 0 },
  { label: "In 1 hour", hours: 1 },
  { label: "In 2 hours", hours: 2 },
  { label: "In 4 hours", hours: 4 },
  { label: "Tomorrow", hours: 24 },
];

export function startsLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
