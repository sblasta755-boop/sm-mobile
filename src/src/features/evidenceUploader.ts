import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSmartClean } from "@/features/store";
import {
  addTaskEvidence,
  ApiError,
  freshestAccessToken,
  clockIn,
  requestOvertime,
  clockOut,
  createIncident,
  decideInspection,
  enterStockCount,
  issueStock,
  logStockWaste,
  submitStockCount,
  resolveQr,
  updateCorrectiveAction,
  saveTaskNote,
  startTask,
  submitTask,
  updateChecklistItem,
  uploadImage,
} from "@/api/client";
import { clockBodyFromMutation, type OutboxMutation } from "@/domain/outbox";
import { markSynced } from "@/features/lastSynced";
import { getOutbox, loadOutbox, removeMutation, subscribeOutbox, updateMutation } from "@/features/outbox";
import type { Task } from "@/types/smartclean";
import { getQueue, loadQueue, removePhoto, subscribeQueue, updatePhoto } from "@/features/evidenceQueue";

// Sends queued photos to the server, one at a time and in the order they were
// taken, whenever there is a connection. A photo leaves the phone only after
// the server has recorded it; a failed attempt because of the network leaves it
// queued to try again, while a photo the server refuses stays visible as
// rejected so the person can retake it.

interface Context {
  token: string;
  userId: string;
  online: () => boolean;
  onTask: (taskId: string, task: Task) => void;
  /** Something was refused or already done: refetch so the screen matches the server. */
  onStale: () => void;
}

let context: Context | null = null;
let running: Promise<void> | null = null;

// A 401 that survived the refresh-and-retry is about the session, not the
// photo or change: leave it queued to go once the session is good again.
const isAuthFailure = (error: unknown) => error instanceof ApiError && error.status === 401;
const isServerAnswer = (error: unknown) => error instanceof ApiError && !isAuthFailure(error);

// A reply that means "this was already done" (a retry after a response was
// lost): the change is in, so it counts as sent.
const ALREADY_DONE = /already|current status|cannot be (started|submitted)|has already been/i;

async function sendMutation(ctx: Context, m: OutboxMutation): Promise<Task | null> {
  const p = m.payload as Record<string, never>;
  switch (m.kind) {
    case "task.start": {
      const qrValue = typeof m.payload.qrValue === "string" ? m.payload.qrValue : null;
      return startTask(
        ctx.token,
        m.taskId!,
        qrValue
          ? { qrValue, latitude: m.payload.latitude as number | undefined, longitude: m.payload.longitude as number | undefined }
          : undefined,
        String(m.payload.startedAt ?? m.createdAt),
      );
    }
    case "task.scan": {
      // A room scanned with no signal: the server verifies it exactly as a live
      // scan (code, location, boundary), using the position captured then.
      const resolved = await resolveQr(
        ctx.token,
        String(m.payload.value),
        m.payload.latitude as number | undefined,
        m.payload.longitude as number | undefined,
      );
      if (resolved.valid === false) throw new ApiError(String(resolved.reason ?? "The scan was not accepted."));
      return null;
    }
    case "inspection.decide": {
      await decideInspection(ctx.token, String(m.payload.inspectionId), {
        decision: m.payload.decision as "approve" | "reject",
        score: Number(m.payload.score),
        scores: m.payload.scores as Record<string, number> | undefined,
        comments: m.payload.comments as string | undefined,
        reason: m.payload.reason as string | undefined,
      });
      // The server also creates a corrective action on a send-back, etc.
      ctx.onStale();
      return null;
    }
    case "corrective.update": {
      await updateCorrectiveAction(ctx.token, String(m.payload.actionId), {
        status: m.payload.status as "in_progress" | "awaiting_reinspection" | "closed",
        note: m.payload.note as string | undefined,
      });
      ctx.onStale();
      return null;
    }
    case "stock.issue":
      await issueStock(ctx.token, {
        itemId: String(m.payload.itemId),
        locationId: String(m.payload.locationId),
        qty: Number(m.payload.qty),
        referenceType: m.payload.referenceType as "task" | "round" | "location",
        referenceId: String(m.payload.referenceId),
        clientRef: String(m.payload.clientRef),
        occurredAt: String(m.payload.occurredAt ?? m.createdAt),
      });
      ctx.onStale();
      return null;
    case "stock.waste":
      await logStockWaste(ctx.token, {
        itemId: String(m.payload.itemId),
        locationId: String(m.payload.locationId),
        qty: Number(m.payload.qty),
        reasonCode: String(m.payload.reasonCode),
        clientRef: String(m.payload.clientRef),
        occurredAt: String(m.payload.occurredAt ?? m.createdAt),
      });
      ctx.onStale();
      return null;
    case "stock.count.enter":
      await enterStockCount(ctx.token, String(m.payload.countId), String(m.payload.lineId), Number(m.payload.counted));
      return null;
    case "stock.count.submit":
      await submitStockCount(ctx.token, String(m.payload.countId));
      ctx.onStale();
      return null;
    case "attendance.clock": {
      const body = clockBodyFromMutation(m);
      if (m.payload.direction === "out") await clockOut(ctx.token, body);
      else await clockIn(ctx.token, body);
      return null;
    }
    case "overtime.request":
      await requestOvertime(ctx.token, String(m.payload.reason ?? ""), String(m.payload.at ?? m.createdAt));
      return null;
    case "task.checklist":
      return updateChecklistItem(ctx.token, m.taskId!, String(p.itemId), {
        done: typeof m.payload.done === "boolean" ? m.payload.done : undefined,
        value: typeof m.payload.value === "string" ? m.payload.value : undefined,
        note: typeof m.payload.note === "string" ? m.payload.note : undefined,
      }) as Promise<Task>;
    case "task.note":
      return saveTaskNote(ctx.token, m.taskId!, String(m.payload.note ?? ""));
    case "task.submit":
      return submitTask(ctx.token, m.taskId!, String(m.payload.submittedAt ?? m.createdAt), {
        signerName: m.payload.signerName as string | undefined,
        signature: m.payload.signature as { strokes: number[][][]; width: number; height: number } | undefined,
        // Queued, so it may be replayed after the sign-off rule changed.
        offlineRecorded: true,
      });
    case "incident.create": {
      // Photos for the report were kept on the phone; they go up first.
      const local = (m.payload.localPhotos as string[] | undefined) ?? [];
      const filePaths: string[] = [...((m.payload.filePaths as string[] | undefined) ?? [])];
      for (const uri of local) filePaths.push(await uploadImage(ctx.token, uri, `incident-${Date.now()}.jpg`));
      const { localPhotos: _local, filePaths: _paths, ...rest } = m.payload;
      await createIncident(ctx.token, { ...rest, filePaths } as Parameters<typeof createIncident>[1]);
      return null;
    }
  }
}

type Step = { at: string; run: () => Promise<boolean> };

async function drainOnce(): Promise<void> {
  await Promise.all([loadQueue(), loadOutbox()]);
  const ctx = context;
  if (!ctx) return;

  // Photos and changes go out together in the order they happened, so a
  // checklist tick never overtakes the photo it depends on, and a submission
  // always follows the photos for that task.
  const steps: Step[] = [];

  for (const photo of getQueue().filter((p) => p.userId === ctx.userId && p.status !== "rejected")) {
    steps.push({
      at: photo.capturedAt,
      run: async () => {
        await updatePhoto(photo.id, { status: "uploading" });
        try {
          const filePath = await uploadImage(ctx.token, photo.localUri, `${photo.kind}-${photo.id}.jpg`);
          const task = await addTaskEvidence(ctx.token, photo.taskId, {
            id: photo.id,
            kind: photo.kind,
            checklistItemId: photo.checklistItemId,
            label: photo.label,
            filePath,
            liveCapture: true,
            offlineOriginated: photo.offlineOriginated,
            capturedAt: photo.capturedAt,
          });
          ctx.onTask(photo.taskId, task);
          await removePhoto(photo.id);
          return true;
        } catch (error) {
          if (isServerAnswer(error)) {
            await updatePhoto(photo.id, {
              status: "rejected",
              attempts: photo.attempts + 1,
              error: error instanceof Error ? error.message : "The server did not accept this photo.",
            });
            return true;
          }
          await updatePhoto(photo.id, { status: "queued", attempts: photo.attempts + 1 });
          return false; // no signal: stop here, try again later
        }
      },
    });
  }

  for (const m of getOutbox().filter((x) => x.userId === ctx.userId && x.status !== "rejected")) {
    steps.push({
      at: m.createdAt,
      run: async () => {
        await updateMutation(m.id, { status: "sending" });
        try {
          const task = await sendMutation(ctx, m);
          if (task && m.taskId) ctx.onTask(m.taskId, task);
          await removeMutation(m.id);
          return true;
        } catch (error) {
          if (isServerAnswer(error)) {
            const message = error instanceof Error ? error.message : "The server did not accept this change.";
            if (ALREADY_DONE.test(message) && m.kind !== "task.checklist") {
              await removeMutation(m.id);
              ctx.onStale();
              return true;
            }
            await updateMutation(m.id, { status: "rejected", attempts: m.attempts + 1, error: message });
            ctx.onStale();
            return true;
          }
          await updateMutation(m.id, { status: "pending", attempts: m.attempts + 1 });
          return false;
        }
      },
    });
  }

  steps.sort((a, b) => a.at.localeCompare(b.at));
  for (const step of steps) {
    if (!ctx.online()) return;
    if (!(await step.run())) return;
  }
}

/** Starts an upload pass, or joins the one already running. */
export function drainQueue(): Promise<void> {
  if (!running) {
    running = drainOnce()
      .then(() => {
        // A pass that left nothing waiting for this person is a successful sync.
        const ctx = context;
        if (!ctx || !ctx.online()) return;
        const left =
          getQueue().filter((p) => p.userId === ctx.userId && p.status !== "rejected").length +
          getOutbox().filter((m) => m.userId === ctx.userId && m.status !== "rejected").length;
        if (left === 0) markSynced();
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}

/**
 * Tries to upload everything for one task and says how many photos are still
 * waiting. Used before submitting, which needs the server to have the photos.
 */
export async function flushTask(taskId: string): Promise<number> {
  await drainQueue();
  // A pass that started before the last photo was queued may have missed it.
  await drainQueue();
  return (
    getQueue().filter((p) => p.taskId === taskId && p.status !== "rejected").length +
    getOutbox().filter((m) => m.taskId === taskId && m.status !== "rejected").length
  );
}

/** Mount once at the root: keeps the queue draining in the background. */
export function useEvidenceUploader() {
  const { state, currentUser, dispatch, refreshBackendData } = useSmartClean();
  const refreshRef = useRef(refreshBackendData);
  refreshRef.current = refreshBackendData;
  const token = state.accessToken;
  const userId = currentUser?.id;
  const online = state.connectivity !== "offline";

  useEffect(() => {
    if (!token || !userId) {
      context = null;
      return;
    }
    context = {
      // Read at use time: a refresh mid-pass rotates the token before React re-renders.
      get token() {
        return freshestAccessToken(token);
      },
      userId,
      online: () => context !== null && onlineRef.current,
      onTask: (taskId, task) => dispatch({ type: "UPDATE_TASK", taskId, patch: task }),
      onStale: () => void refreshRef.current(),
    };
    void drainQueue();
  }, [token, userId, dispatch]);

  onlineRef.current = online;

  // When the connection returns, the app comes to the front, a photo is
  // queued, or a retry is due.
  useEffect(() => {
    if (online) void drainQueue();
  }, [online]);

  useEffect(() => {
    const unsubscribe = subscribeQueue(() => {
      if (onlineRef.current) void drainQueue();
    });
    const unsubscribeOutbox = subscribeOutbox(() => {
      if (onlineRef.current) void drainQueue();
    });
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void drainQueue();
    });
    const timer = setInterval(() => {
      if (onlineRef.current && (getQueue().some((p) => p.status === "queued") || getOutbox().some((m) => m.status === "pending")))
        void drainQueue();
    }, 30_000);
    return () => {
      unsubscribe();
      unsubscribeOutbox();
      sub.remove();
      clearInterval(timer);
    };
  }, []);
}

const onlineRef = { current: true };
