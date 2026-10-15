// Changes a person made on the phone that the server has not seen yet (a task
// started, a checklist item ticked, a note, a submission, an incident report).
// The queue and its replay live in features/outbox.ts and
// features/evidenceUploader.ts; this file is the pure part: how a pending
// change looks on a task, and how a new change replaces an older one.

export type OutboxKind =
  | "task.start"
  | "task.checklist"
  | "task.note"
  | "task.submit"
  | "task.scan"
  | "attendance.clock"
  | "inspection.decide"
  | "corrective.update"
  | "incident.create";

export interface OutboxMutation {
  /** Also the idempotency handle: replaying the same change is harmless. */
  id: string;
  userId: string;
  kind: OutboxKind;
  taskId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
  /** pending: waiting. sending: in flight. rejected: the server refused it. */
  status: "pending" | "sending" | "rejected";
  attempts: number;
  error?: string;
}

interface ChecklistLike {
  id: string;
  type: string;
  done?: boolean;
  value?: string | null;
  note?: string;
}
interface TaskLike {
  id: string;
  status: string;
  checklist: ChecklistLike[];
  startedAt?: string;
  submittedAt?: string;
  startMethod?: string | null;
  note?: string | null;
  qrVerified?: boolean;
}

/**
 * Shows pending changes on top of the tasks the server last sent. Rejected
 * changes are left out: they did not happen, and the person is told so.
 */
export function applyMutations<T extends TaskLike>(tasks: T[], mutations: OutboxMutation[]): T[] {
  const live = mutations
    .filter((m) => m.taskId && m.status !== "rejected")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (live.length === 0) return tasks;
  const byTask = new Map<string, OutboxMutation[]>();
  for (const m of live) byTask.set(m.taskId!, [...(byTask.get(m.taskId!) ?? []), m]);

  return tasks.map((task) => {
    const list = byTask.get(task.id);
    if (!list) return task;
    let next: T = { ...task };
    for (const m of list) {
      if (m.kind === "task.start") {
        const scanned = typeof m.payload.qrValue === "string";
        next = {
          ...next,
          status: "in_progress",
          startedAt: next.startedAt ?? String(m.payload.startedAt ?? m.createdAt),
          startMethod: scanned ? "qr" : "manual",
          ...(scanned ? { qrVerified: true } : {}),
        };
      } else if (m.kind === "task.scan") {
        // The room code was scanned: the task is verified and under way.
        next = { ...next, qrVerified: true, startMethod: "qr" };
      } else if (m.kind === "task.checklist") {
        const { itemId, done, value, note } = m.payload as {
          itemId: string;
          done?: boolean;
          value?: string;
          note?: string;
        };
        next = {
          ...next,
          checklist: next.checklist.map((item) => {
            if (item.id !== itemId) return item;
            const nextValue = typeof value === "string" ? value : item.value;
            const withNote = typeof note === "string" ? { ...item, note: note.trim() || undefined } : item;
            return {
              ...withNote,
              value: nextValue,
              // "steps_required" is done exactly when it has text, like the server.
              done: item.type === "steps_required" ? Boolean(nextValue?.trim()) : typeof done === "boolean" ? done : item.done,
            };
          }),
        };
      } else if (m.kind === "task.note") {
        const note = String(m.payload.note ?? "").trim();
        next = { ...next, note: note || null };
      } else if (m.kind === "inspection.decide") {
        // A decision shows on the task straight away: passed, or sent back to redo.
        next = { ...next, status: m.payload.decision === "approve" ? "approved" : "rework_required" };
      } else if (m.kind === "task.submit") {
        next = { ...next, status: "submitted", submittedAt: String(m.payload.submittedAt ?? m.createdAt) };
      }
    }
    return next;
  });
}

/** Whether `incoming` supersedes `existing` (the same field, so only the latest matters). */
export function supersedes(incoming: OutboxMutation, existing: OutboxMutation): boolean {
  if (existing.status === "sending" || incoming.kind !== existing.kind || incoming.taskId !== existing.taskId) return false;
  if (incoming.kind === "task.checklist") return incoming.payload.itemId === existing.payload.itemId;
  // Clock events are a sequence (in, then out), a corrective action moves
  // through steps, and each incident is its own report: none replaces another.
  if (
    incoming.kind === "attendance.clock" ||
    incoming.kind === "incident.create" ||
    incoming.kind === "corrective.update"
  ) {
    return false;
  }
  // Deciding the same inspection again replaces the earlier choice.
  if (incoming.kind === "inspection.decide") return incoming.payload.inspectionId === existing.payload.inspectionId;
  return true;
}

/** The queue after adding `incoming`, dropping any change it makes redundant. */
export function addMutation(queue: OutboxMutation[], incoming: OutboxMutation): OutboxMutation[] {
  let merged = incoming;
  // A tick and a note on the same item are separate edits to one record: the
  // later one must not erase the earlier. Merge them into one change.
  if (incoming.kind === "task.checklist") {
    const older = queue.find((existing) => supersedes(incoming, existing));
    if (older) merged = { ...incoming, payload: { ...older.payload, ...incoming.payload } };
  }
  return [merged, ...queue.filter((existing) => !supersedes(incoming, existing))];
}

export function pendingCount(queue: OutboxMutation[]): number {
  return queue.filter((m) => m.status !== "rejected").length;
}

export interface AttendanceLike {
  clockedInAt?: string;
  siteId?: string;
}

/**
 * Shows clock-ins and clock-outs made offline on top of the attendance the
 * server last sent: the last pending event for the person decides whether they
 * appear clocked in.
 */
export function applyAttendance<T extends Record<string, AttendanceLike>>(
  attendance: T,
  mutations: OutboxMutation[],
  userId: string,
): T {
  const clocks = mutations
    .filter((m) => m.kind === "attendance.clock" && m.userId === userId && m.status !== "rejected")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (clocks.length === 0) return attendance;
  const last = clocks[clocks.length - 1];
  const next: Record<string, AttendanceLike> = { ...attendance };
  if (last.payload.direction === "in") {
    next[userId] = { clockedInAt: String(last.payload.at ?? last.createdAt), siteId: String(last.payload.siteId ?? "") };
  } else {
    delete next[userId];
  }
  return next as T;
}

interface InspectionLike {
  id: string;
  status: string;
  score?: number;
}

/** Shows inspection decisions made offline: passed, or failed (sent back). */
export function applyInspectionDecisions<T extends InspectionLike>(inspections: T[], mutations: OutboxMutation[]): T[] {
  const decided = new Map<string, OutboxMutation>();
  for (const m of mutations) {
    if (m.kind === "inspection.decide" && m.status !== "rejected") decided.set(String(m.payload.inspectionId), m);
  }
  if (decided.size === 0) return inspections;
  return inspections.map((inspection) => {
    const m = decided.get(inspection.id);
    if (!m) return inspection;
    return {
      ...inspection,
      status: m.payload.decision === "approve" ? "passed" : "failed",
      score: typeof m.payload.score === "number" ? m.payload.score : inspection.score,
    };
  });
}

interface CorrectiveLike {
  id: string;
  status: string;
}

/** Shows corrective-action steps taken offline (the last one for each action wins). */
export function applyCorrectiveUpdates<T extends CorrectiveLike>(actions: T[], mutations: OutboxMutation[]): T[] {
  const last = new Map<string, OutboxMutation>();
  for (const m of [...mutations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (m.kind === "corrective.update" && m.status !== "rejected") last.set(String(m.payload.actionId), m);
  }
  if (last.size === 0) return actions;
  return actions.map((action) => {
    const m = last.get(action.id);
    return m ? { ...action, status: String(m.payload.status) } : action;
  });
}
