// Photos taken on the phone that have not reached the server yet. The queue
// itself (storage, uploading) lives in features/evidenceQueue.ts; this file is
// the pure part: what a queued photo is, and how it shows up on a task.

export interface QueuedPhoto {
  /** Also the evidence id on the server, which makes a retry harmless. */
  id: string;
  userId: string;
  taskId: string;
  kind: "before" | "after" | "evidence" | "issue";
  checklistItemId?: string;
  label: string;
  /** A copy kept in the app's own storage until it is uploaded. */
  localUri: string;
  capturedAt: string;
  offlineOriginated: boolean;
  /** queued: waiting. uploading: in flight. rejected: the server refused it. */
  status: "queued" | "uploading" | "rejected";
  attempts: number;
  error?: string;
}

interface TaskLike {
  id: string;
  evidence: unknown[];
}

/**
 * The task as the person sees it: photos still on the phone count as taken, so
 * the tiles, the counts and the Submit button behave the same offline as
 * online. Rejected photos are not counted, so the slot asks for a retake.
 * Queued photos go first because evidence is listed newest first.
 */
export function mergeQueuedEvidence<T extends TaskLike>(task: T, queue: QueuedPhoto[]): T {
  const mine = queue.filter((p) => p.taskId === task.id && p.status !== "rejected");
  if (mine.length === 0) return task;
  const known = new Set((task.evidence as { id?: string }[]).map((e) => e.id));
  const queued = mine
    .filter((p) => !known.has(p.id))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .map((p) => ({
      id: p.id,
      taskId: p.taskId,
      kind: p.kind,
      checklistItemId: p.checklistItemId ?? null,
      label: p.label,
      capturedAt: p.capturedAt,
      device: "This phone",
      offlineOriginated: p.offlineOriginated,
      imgSeed: 0,
      uri: p.localUri,
      queued: true,
    }));
  if (queued.length === 0) return task;
  return { ...task, evidence: [...queued, ...task.evidence] };
}

/** How many photos for this task are still waiting to upload. */
export function waitingCount(queue: QueuedPhoto[], taskId: string): number {
  return queue.filter((p) => p.taskId === taskId && p.status !== "rejected").length;
}
