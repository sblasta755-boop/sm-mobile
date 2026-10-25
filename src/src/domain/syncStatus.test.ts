import type { OutboxMutation } from "./outbox";
import type { QueuedPhoto } from "./evidenceQueue";
import { ago, syncHeadline, syncSummary } from "./syncStatus";

const change = (over: Partial<OutboxMutation>): OutboxMutation => ({
  id: "m1", userId: "u1", kind: "task.checklist", taskId: "t1", createdAt: "2026-10-26T08:00:00Z",
  payload: {}, status: "pending", attempts: 0, ...over,
});
const photo = (over: Partial<QueuedPhoto>): QueuedPhoto => ({
  id: "p1", userId: "u1", taskId: "t1", kind: "evidence", label: "x", localUri: "file://x",
  capturedAt: "2026-10-26T08:05:00Z", offlineOriginated: false, status: "queued", attempts: 0, ...over,
});
const sum = (outbox: OutboxMutation[], photos: QueuedPhoto[], offline = false) =>
  syncSummary({ outbox, photos, userId: "u1", offline });

test("nothing waiting while online is synced", () => {
  const s = sum([], []);
  expect(s.state).toBe("synced");
  expect(syncHeadline(s)).toBe("All changes saved");
});

test("waiting work online says how many, counting photos too, oldest first", () => {
  const s = sum([change({})], [photo({})]);
  expect(s.state).toBe("waiting");
  expect(s.waiting.map((i) => i.type)).toEqual(["change", "photo"]);
  expect(syncHeadline(s)).toBe("2 waiting to send");
  expect(s.waiting[0].label).toBe("a checklist tick");
});

test("offline with nothing waiting, and offline with work saved", () => {
  expect(sum([], [], true).state).toBe("offline");
  const s = sum([change({})], [], true);
  expect(s.state).toBe("offlineWaiting");
  expect(syncHeadline(s)).toBe("Offline - 1 saved on this phone");
});

test("refused work wins the headline and keeps the server's reason", () => {
  const s = sum([change({ status: "rejected", error: "Task already submitted" }), change({ id: "m2" })], [], true);
  expect(s.state).toBe("refused");
  expect(s.refused[0].error).toBe("Task already submitted");
  expect(s.waiting).toHaveLength(1);
  expect(syncHeadline(s)).toBe("1 not accepted, 1 waiting");
});

test("another person's items on a shared phone are ignored", () => {
  expect(sum([change({ userId: "u2" })], [photo({ userId: "u2" })]).state).toBe("synced");
});

test("an unknown kind falls back to its key", () => {
  expect(sum([change({ kind: "something.new" as never })], []).waiting[0].label).toBe("something.new");
});

test("ago reads naturally", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  expect(ago(now - 20_000, now)).toBe("just now");
  expect(ago(now - 3 * 60_000, now)).toBe("3 min ago");
  expect(ago(now - 2 * 3_600_000, now)).toBe("2 h ago");
  expect(ago(now - 3 * 86_400_000, now)).toBe("3 days ago");
  expect(ago(null, now)).toBe("not yet");
});
