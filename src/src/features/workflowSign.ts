import { ApiError, signWorkflowItem } from "@/api/client";
import { enqueueMutation } from "@/features/outbox";
import { drainQueue } from "@/features/evidenceUploader";
import type { Task, WorkflowSignPayload } from "@/types/smartclean";

// Signing off a workflow item. With a connection the server is asked first, so a refusal (a name that does
// not match, an item that was just replaced) is shown at once and nothing is left half-done. With no
// connection, or when the request cannot reach the server, the sign-off is kept on the phone, shows as signed,
// and is sent when the connection returns (see domain/outbox.ts and features/evidenceUploader.ts).

/** The server answered and said no. Anything else (no signal, a busy server, a session being renewed) is not
 * a refusal of the sign-off itself, so it is kept to try again. */
export function isRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status === undefined) return false;
  if (error.status === 401) return false;
  return !(error.status >= 500 || error.status === 408 || error.status === 425 || error.status === 429);
}

export type SignOutcome = { queued: false; task: Task } | { queued: true };

export async function signItemOrQueue(args: {
  token: string;
  userId: string;
  userName: string;
  taskId: string;
  itemId: string;
  body: WorkflowSignPayload;
  online: boolean;
}): Promise<SignOutcome> {
  const { token, userId, userName, taskId, itemId, body, online } = args;
  if (online) {
    try {
      return { queued: false, task: await signWorkflowItem(token, taskId, itemId, body) };
    } catch (error) {
      if (isRefusal(error)) throw error;
    }
  }
  await enqueueMutation({
    userId,
    kind: "workflow.sign",
    taskId,
    payload: { itemId, body, signedByName: userName, signedAt: new Date().toISOString() },
  });
  void drainQueue();
  return { queued: true };
}
