/**
 * The "Finish your current task first" rule, in one place. It mirrors the
 * backend's is_task_active / _assert_no_other_task_in_progress: another of the
 * person's tasks counts only if it is from today, is in progress (or has its
 * room scanned and is not yet started), and its hourly window has not closed.
 * A task with a queued submit already reads as submitted here, so a person
 * working offline is never held up by work they have finished.
 */
interface GateTask {
  id: string;
  title: string;
  status: string;
  assigneeId?: string | null;
  scheduledAt: string;
  qrVerified?: boolean;
  hourlyComplianceLocked?: boolean;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function otherActiveTask<T extends GateTask>(
  tasks: T[],
  task: Pick<GateTask, "id" | "status" | "qrVerified">,
  userId: string | undefined,
): T | undefined {
  if (!userId || task.status === "in_progress" || task.qrVerified) return undefined;
  return tasks.find(
    (t) =>
      t.id !== task.id &&
      t.assigneeId === userId &&
      isToday(t.scheduledAt) &&
      !t.hourlyComplianceLocked &&
      (t.status === "in_progress" || (t.qrVerified && ["assigned", "not_started"].includes(t.status))),
  );
}
