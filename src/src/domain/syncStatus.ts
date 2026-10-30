// What the Sync screen and the Profile row say about work saved on this phone. Pure: the queues
// themselves live in features/outbox.ts and features/evidenceQueue.ts.

import type { OutboxMutation } from "./outbox";
import type { QueuedPhoto } from "./evidenceQueue";

export const KIND_LABEL: Record<string, string> = {
  "task.start": "starting a task",
  "task.scan": "a room scan",
  "task.checklist": "a checklist tick",
  "task.note": "a note",
  "task.submit": "a submission",
  "attendance.clock": "a clock in/out",
  "overtime.request": "an overtime request",
  "inspection.decide": "an inspection decision",
  "corrective.update": "a corrective-action update",
  "incident.create": "an incident report",
  "stock.issue": "stock issued to a job",
  "stock.waste": "logged waste",
  "stock.count.enter": "a stock count entry",
  "stock.count.submit": "a stock count",
};

export interface SyncItem {
  id: string;
  /** "change" is an outbox mutation, "photo" a queued evidence photo. */
  type: "change" | "photo";
  /** What it is, e.g. "a checklist tick" or "a photo". */
  label: string;
  taskId?: string;
  savedAt: string;
  attempts: number;
  error?: string;
}

export type SyncState = "synced" | "waiting" | "offline" | "offlineWaiting" | "refused";

export interface SyncSummary {
  state: SyncState;
  waiting: SyncItem[];
  refused: SyncItem[];
}

/** The signed-in person's waiting and refused work. Refused work wins the headline, because it needs
 * the person to do something. Other people's items on a shared phone are ignored. */
export function syncSummary(input: {
  outbox: OutboxMutation[];
  photos: QueuedPhoto[];
  userId: string | undefined;
  offline: boolean;
}): SyncSummary {
  const items: (SyncItem & { rejected: boolean })[] = [
    ...input.outbox
      .filter((m) => m.userId === input.userId)
      .map((m) => ({
        id: m.id,
        type: "change" as const,
        label: KIND_LABEL[m.kind] ?? m.kind,
        taskId: m.taskId,
        savedAt: m.createdAt,
        attempts: m.attempts,
        error: m.error,
        rejected: m.status === "rejected",
      })),
    ...input.photos
      .filter((p) => p.userId === input.userId)
      .map((p) => ({
        id: p.id,
        type: "photo" as const,
        label: "a photo",
        taskId: p.taskId,
        savedAt: p.capturedAt,
        attempts: p.attempts,
        error: p.error,
        rejected: p.status === "rejected",
      })),
  ].sort((a, b) => a.savedAt.localeCompare(b.savedAt));

  const strip = ({ rejected: _rejected, ...item }: SyncItem & { rejected: boolean }): SyncItem => item;
  const waiting = items.filter((i) => !i.rejected).map(strip);
  const refused = items.filter((i) => i.rejected).map(strip);
  const state: SyncState =
    refused.length > 0
      ? "refused"
      : input.offline
        ? waiting.length > 0
          ? "offlineWaiting"
          : "offline"
        : waiting.length > 0
          ? "waiting"
          : "synced";
  return { state, waiting, refused };
}

/** One line for the Profile row and the top of the Sync screen. */
export function syncHeadline(summary: SyncSummary): string {
  const w = summary.waiting.length;
  const r = summary.refused.length;
  switch (summary.state) {
    case "refused":
      return `${r} not accepted${w > 0 ? `, ${w} waiting` : ""}`;
    case "offlineWaiting":
      return `Offline - ${w} saved on this phone`;
    case "offline":
      return "Offline";
    case "waiting":
      return `${w} waiting to send`;
    default:
      return "All changes saved";
  }
}

/** "just now", "3 min ago", "2 h ago", "4 days ago". */
export function ago(iso: string | number | null | undefined, now: number = Date.now()): string {
  if (iso == null) return "not yet";
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(then)) return "not yet";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
