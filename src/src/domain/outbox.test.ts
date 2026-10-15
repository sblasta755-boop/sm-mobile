import {
  addMutation,
  applyAttendance,
  applyCorrectiveUpdates,
  applyInspectionDecisions,
  applyMutations,
  type OutboxMutation,
} from "./outbox";

const mut = (over: Partial<OutboxMutation>): OutboxMutation => ({
  id: "m1",
  userId: "u1",
  kind: "task.checklist",
  taskId: "t1",
  createdAt: "2026-10-15T10:00:00.000Z",
  payload: {},
  status: "pending",
  attempts: 0,
  ...over,
});

const task: { id: string; status: string; startedAt?: string; qrVerified?: boolean; checklist: { id: string; type: string; done?: boolean; value?: string }[] } = {
  id: "t1",
  status: "assigned",
  checklist: [
    { id: "a", type: "checkbox", done: false },
    { id: "s", type: "steps_required", done: false, value: "" },
  ],
};

describe("applyMutations", () => {
  it("shows ticks, typed steps, a start and a submission on the task", () => {
    const [out] = applyMutations([task], [
      mut({ id: "1", kind: "task.start", payload: { startedAt: "2026-10-15T09:00:00.000Z" }, createdAt: "2026-10-15T09:00:00.000Z" }),
      mut({ id: "2", payload: { itemId: "a", done: true }, createdAt: "2026-10-15T09:10:00.000Z" }),
      mut({ id: "3", payload: { itemId: "s", value: "Mop then dry" }, createdAt: "2026-10-15T09:11:00.000Z" }),
      mut({ id: "4", kind: "task.submit", payload: { submittedAt: "2026-10-15T09:20:00.000Z" }, createdAt: "2026-10-15T09:20:00.000Z" }),
    ]);
    expect(out.status).toBe("submitted");
    expect(out.checklist.map((c) => c.done)).toEqual([true, true]);
    expect(out.startedAt).toBe("2026-10-15T09:00:00.000Z");
  });
  it("leaves a task alone when nothing is pending, and skips rejected changes", () => {
    const tasks = [task];
    expect(applyMutations(tasks, [])).toBe(tasks);
    expect(applyMutations(tasks, [mut({ status: "rejected", payload: { itemId: "a", done: true } })])).toBe(tasks);
  });
});

describe("addMutation", () => {
  it("replaces an older change to the same checklist item or note, keeps different ones", () => {
    const first = mut({ id: "1", payload: { itemId: "a", done: true } });
    const other = mut({ id: "2", payload: { itemId: "b", done: true } });
    const again = mut({ id: "3", payload: { itemId: "a", done: false } });
    expect(addMutation([other, first], again).map((m) => m.id)).toEqual(["3", "2"]);
    const note1 = mut({ id: "n1", kind: "task.note", payload: { note: "a" } });
    const note2 = mut({ id: "n2", kind: "task.note", payload: { note: "b" } });
    expect(addMutation([note1], note2).map((m) => m.id)).toEqual(["n2"]);
  });
  it("never replaces a change already being sent", () => {
    const sending = mut({ id: "1", status: "sending", payload: { itemId: "a", done: true } });
    const again = mut({ id: "2", payload: { itemId: "a", done: false } });
    expect(addMutation([sending], again).map((m) => m.id)).toEqual(["2", "1"]);
  });
});

describe("offline scans and clocking", () => {
  it("shows a scanned room as verified and a scanned site start as under way", () => {
    const [scanned] = applyMutations([task], [mut({ kind: "task.scan", payload: { value: "ROOM-1" } })]);
    expect(scanned.qrVerified).toBe(true);
    const [started] = applyMutations([task], [
      mut({ kind: "task.start", payload: { qrValue: "SITE-1", startedAt: "2026-10-15T09:00:00.000Z" } }),
    ]);
    expect(started.status).toBe("in_progress");
    expect(started.qrVerified).toBe(true);
  });
  it("shows the last pending clock event for the person", () => {
    const clockIn = mut({ id: "c1", kind: "attendance.clock", taskId: undefined, payload: { direction: "in", siteId: "s1", at: "2026-10-15T07:00:00.000Z" }, createdAt: "2026-10-15T07:00:00.000Z" });
    const clockOut = mut({ id: "c2", kind: "attendance.clock", taskId: undefined, payload: { direction: "out", siteId: "s1" }, createdAt: "2026-10-15T15:00:00.000Z" });
    expect(applyAttendance<Record<string, { clockedInAt?: string }>>({}, [clockIn], "u1").u1.clockedInAt).toBe("2026-10-15T07:00:00.000Z");
    expect(applyAttendance({ u1: { clockedInAt: "x" } }, [clockIn, clockOut], "u1").u1).toBeUndefined();
    expect(applyAttendance({ u1: { clockedInAt: "x" } }, [], "u1").u1.clockedInAt).toBe("x");
  });
  it("keeps both clock events instead of replacing one with the other", () => {
    const a = mut({ id: "a", kind: "attendance.clock", taskId: undefined, payload: { direction: "in" } });
    const b = mut({ id: "b", kind: "attendance.clock", taskId: undefined, payload: { direction: "out" } });
    expect(addMutation([a], b).map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("supervisor actions made offline", () => {
  it("shows an inspection decision on the inspection and its task", () => {
    const approve = mut({ kind: "inspection.decide", payload: { inspectionId: "i1", decision: "approve", score: 90 } });
    const [insp] = applyInspectionDecisions([{ id: "i1", status: "pending" as string, score: undefined as number | undefined }], [approve]);
    expect(insp.status).toBe("passed");
    expect(insp.score).toBe(90);
    expect(applyMutations([task], [approve])[0].status).toBe("approved");
    const reject = mut({ kind: "inspection.decide", payload: { inspectionId: "i1", decision: "reject", score: 40 } });
    expect(applyMutations([task], [reject])[0].status).toBe("rework_required");
  });
  it("deciding the same inspection again replaces the first choice", () => {
    const first = mut({ id: "d1", kind: "inspection.decide", payload: { inspectionId: "i1", decision: "approve" } });
    const second = mut({ id: "d2", kind: "inspection.decide", payload: { inspectionId: "i1", decision: "reject" } });
    expect(addMutation([first], second).map((m) => m.id)).toEqual(["d2"]);
  });
  it("shows the latest corrective-action step and keeps every step queued", () => {
    const a = mut({ id: "a", kind: "corrective.update", taskId: undefined, payload: { actionId: "c1", status: "in_progress" }, createdAt: "2026-10-15T09:00:00.000Z" });
    const b = mut({ id: "b", kind: "corrective.update", taskId: undefined, payload: { actionId: "c1", status: "awaiting_reinspection" }, createdAt: "2026-10-15T10:00:00.000Z" });
    expect(applyCorrectiveUpdates([{ id: "c1", status: "open" }], [a, b])[0].status).toBe("awaiting_reinspection");
    expect(addMutation([a], b).map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("item notes", () => {
  it("merges a note into an earlier tick of the same item instead of replacing it", () => {
    const tick = mut({ id: "t", payload: { itemId: "a", done: true } });
    const note = mut({ id: "n", payload: { itemId: "a", note: "Sticky floor" } });
    const queue = addMutation([tick], note);
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({ itemId: "a", done: true, note: "Sticky floor" });
    const [out] = applyMutations([task], queue);
    expect(out.checklist[0]).toMatchObject({ done: true, note: "Sticky floor" });
  });
});
