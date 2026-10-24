// How long a task took: from when it was started to when it was submitted. Mirrored in the
// web app at smart-property-operations/src/src/lib/smartclean/timeSpent.ts - keep both in sync.
// Nothing until both have happened (a task still under way shows no figure), and nothing when
// the times are the wrong way round (a clock error).

export function timeSpentMinutes(task: {
  startedAt?: string | null;
  submittedAt?: string | null;
}): number | null {
  if (!task.startedAt || !task.submittedAt) return null;
  const ms =
    new Date(task.submittedAt).getTime() - new Date(task.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60_000);
}

/** "under 1 min", "45 min", "1 h 05 min", "2 h". */
export function formatTimeSpent(minutes: number | null): string | undefined {
  if (minutes === null) return undefined;
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, "0")} min`;
}

export const timeSpentLabel = (task: {
  startedAt?: string | null;
  submittedAt?: string | null;
}) => formatTimeSpent(timeSpentMinutes(task));
