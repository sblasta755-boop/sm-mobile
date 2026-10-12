export interface InspectionFilterTask {
  assigneeId: string;
  submittedAt?: string;
  dueAt?: string;
}

const sameLocalDay = (iso: string, day: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
};

/**
 * The date and cleaner filters of the Inspections screen. The date is the day
 * the work was submitted; a task not yet submitted is placed by its due time.
 * `cleanerId` of null means every cleaner, `day` of null means any date.
 */
export function matchesInspectionFilters(
  task: InspectionFilterTask,
  cleanerId: string | null,
  day: Date | null,
): boolean {
  if (cleanerId && task.assigneeId !== cleanerId) return false;
  if (!day) return true;
  const when = task.submittedAt ?? task.dueAt;
  return !!when && sameLocalDay(when, day);
}
