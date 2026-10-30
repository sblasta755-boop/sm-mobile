import {
  addMutation,
  applyAttendance,
  applyCorrectiveUpdates,
  applyInspectionDecisions,
  applyMutations,
  applyStockCount,
  clockBodyFromMutation,
  pendingStockUse,
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

describe("offline stock counts", () => {
  const count = { id: "c1", status: "open", lines: [{ id: "l1", counted: null, status: "pending" }, { id: "l2", counted: null, status: "pending" }] };
  const enter = (over: Partial<OutboxMutation>) =>
    mut({ kind: "stock.count.enter", taskId: undefined, payload: { countId: "c1", lineId: "l1", counted: 5 }, ...over });

  it("counting the same line again replaces the earlier figure, other lines are kept", () => {
    let queue = addMutation([], enter({ id: "a" }));
    queue = addMutation(queue, enter({ id: "b", payload: { countId: "c1", lineId: "l2", counted: 7 } }));
    queue = addMutation(queue, enter({ id: "c", payload: { countId: "c1", lineId: "l1", counted: 9 } }));
    expect(queue.map((m) => m.id).sort()).toEqual(["b", "c"]);
  });

  it("shows offline figures on the count and whether a submission is waiting", () => {
    const entered = enter({ id: "a", payload: { countId: "c1", lineId: "l1", counted: 5 } });
    const submit = mut({ id: "s", kind: "stock.count.submit", taskId: undefined, payload: { countId: "c1" } });
    const { session, submitPending } = applyStockCount(count, [entered, submit], "u1");
    expect(session.lines[0]).toMatchObject({ counted: 5, status: "counted" });
    expect(session.lines[1].counted).toBeNull();
    expect(submitPending).toBe(true);
    expect(applyStockCount(count, [entered], "u2").session).toBe(count); // someone else's work
  });

  it("ignores refused figures and counts the server has already moved on", () => {
    const refused = enter({ status: "rejected" });
    expect(applyStockCount(count, [refused], "u1").session).toBe(count);
    const submitted = { ...count, status: "submitted" };
    expect(applyStockCount(submitted, [enter({})], "u1").session).toBe(submitted);
  });
});

describe("offline stock issues and waste", () => {
  const issue = (id: string, qty: number, kind: OutboxMutation["kind"] = "stock.issue") =>
    mut({ id, kind, taskId: undefined, payload: { itemId: "i1", locationId: "l1", qty, clientRef: id } });

  it("keeps every issue as its own change", () => {
    const queue = addMutation(addMutation([], issue("a", 2)), issue("b", 3));
    expect(queue.map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("totals what is waiting, per item and place, and skips refused ones", () => {
    const used = pendingStockUse([issue("a", 2), issue("b", 3, "stock.waste"), { ...issue("c", 9), status: "rejected" }], "u1");
    expect(used.get("i1|l1")).toBe(5);
    expect(pendingStockUse([issue("a", 2)], "u2").size).toBe(0);
  });
});

describe("clockBodyFromMutation", () => {
  it("keeps the method, reason and crossing time of an automatic clock", () => {
    const body = clockBodyFromMutation(
      mut({
        kind: "attendance.clock",
        payload: { siteId: "s1", direction: "out", method: "geofence_auto", reason: "left_site", at: "2026-10-15T12:03:00.000Z", latitude: 1, longitude: 2 },
      }),
    );
    expect(body).toMatchObject({ siteId: "s1", method: "geofence_auto", reason: "left_site", occurredAt: "2026-10-15T12:03:00.000Z", offlineRecorded: true });
  });

  it("leaves the method off for an ordinary queued scan, as before", () => {
    const body = clockBodyFromMutation(mut({ kind: "attendance.clock", payload: { siteId: "s1", qrValue: "SITE-1", direction: "in" } }));
    expect(body.method).toBeUndefined();
    expect(body.qrValue).toBe("SITE-1");
    expect(body.occurredAt).toBe("2026-10-15T10:00:00.000Z");
  });
});
