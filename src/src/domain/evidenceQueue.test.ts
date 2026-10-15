import { mergeQueuedEvidence, waitingCount, type QueuedPhoto } from "./evidenceQueue";

const photo = (over: Partial<QueuedPhoto>): QueuedPhoto => ({
  id: "p1",
  userId: "u1",
  taskId: "t1",
  kind: "evidence",
  label: "Evidence",
  localUri: "file:///p1.jpg",
  capturedAt: "2026-10-15T10:00:00.000Z",
  offlineOriginated: true,
  status: "queued",
  attempts: 0,
  ...over,
});

describe("mergeQueuedEvidence", () => {
  const task = { id: "t1", evidence: [{ id: "s1", kind: "before" }] };

  it("counts queued photos as taken, newest first", () => {
    const merged = mergeQueuedEvidence(task, [photo({ id: "a" }), photo({ id: "b", capturedAt: "2026-10-15T11:00:00.000Z" })]);
    expect(merged.evidence.map((e) => (e as unknown as { id: string }).id)).toEqual(["b", "a", "s1"]);
    expect((merged.evidence[0] as unknown as { uri: string }).uri).toBe("file:///p1.jpg");
  });
  it("ignores other tasks, rejected photos and ones the server already has", () => {
    const merged = mergeQueuedEvidence(task, [
      photo({ id: "x", taskId: "t2" }),
      photo({ id: "r", status: "rejected" }),
      photo({ id: "s1" }),
    ]);
    expect(merged).toBe(task);
  });
  it("counts what is still waiting for one task", () => {
    expect(waitingCount([photo({ id: "a" }), photo({ id: "b", status: "rejected" }), photo({ id: "c", taskId: "t2" })], "t1")).toBe(1);
  });
});
