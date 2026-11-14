import {
  allSigned,
  asVerificationStep,
  bookingHours,
  buildSignPayload,
  canReviewTask,
  contentSummary,
  designItem,
  isMyTask,
  isSupervisorOrAbove,
  isWorkflowTask,
  itemProblems,
  itemRule,
  needsConnection,
  progressPercent,
  replacementsOf,
  ruleProblems,
  signedCount,
  signoffPayload,
  tookPart,
  workflowItems,
  workflowSnapshot,
} from "./taskWorkflows";
import type { Task, TaskWorkflowItem, TaskWorkflowSettings, WorkflowItemState } from "@/types/smartclean";

const settings: TaskWorkflowSettings = { itemSignoffMode: "tick", supervisorSignoffMode: "tick", requireNameMatch: true };
const tick = { mode: "tick" as const, requireNameMatch: true };
const stroke = (n = 12) => ({ points: Array.from({ length: n }, (_, i) => [i * 4, i * 2] as [number, number]) });

const state = (over: Partial<WorkflowItemState> = {}): WorkflowItemState => ({
  id: "i1",
  label: "Bins emptied",
  type: "workflow_item",
  itemType: "check",
  helpText: "",
  required: true,
  config: {},
  assigneeRole: null,
  done: false,
  assigneeId: "u_a",
  assigneeName: "Ada",
  plannedAssigneeId: "u_a",
  content: null,
  signoff: null,
  signedAt: null,
  signedBy: null,
  signedByName: null,
  returned: false,
  returnNote: null,
  ...over,
});

const design = (id: string, over: Partial<TaskWorkflowItem> = {}): TaskWorkflowItem => ({
  id,
  type: "check",
  label: id,
  helpText: "",
  required: true,
  config: {},
  assigneeRole: null,
  signoff: null,
  ...over,
});

const task = (over: Record<string, unknown> = {}) =>
  ({
    id: "t1",
    supervisorId: "u_sup",
    checklist: [state({ id: "i1", signedAt: "2026-11-13T08:00:00Z", signedBy: "u_a" }), state({ id: "i2", assigneeId: "u_b" })],
    metadata: {
      kind: "workflow",
      workflow: {
        id: "twf_1",
        name: "Deep clean",
        version: 2,
        items: [design("i1", { signoff: { mode: "signature", requireNameMatch: false } }), design("i2")],
        settings,
      },
    },
    ...over,
  }) as unknown as Task;

describe("a task made from a workflow", () => {
  it("recognises one, and an ordinary task is not one", () => {
    expect(isWorkflowTask(task())).toBe(true);
    expect(isWorkflowTask({ metadata: {} } as Task)).toBe(false);
    expect(isWorkflowTask({} as Task)).toBe(false);
    expect(workflowSnapshot({ metadata: {} } as Task)).toBeNull();
    expect(workflowSnapshot(task())?.version).toBe(2);
  });

  it("reads the items and the design behind each", () => {
    const t = task();
    expect(workflowItems(t).map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(designItem(t, "i1")?.signoff?.mode).toBe("signature");
    expect(designItem(t, "ghost")).toBeUndefined();
    expect(replacementsOf(t)).toEqual([]);
  });

  it("ignores checklist entries that are not workflow items", () => {
    expect(workflowItems({ checklist: [{ id: "x", label: "Old", type: "checkbox" }] } as unknown as Task)).toEqual([]);
  });

  it("counts progress", () => {
    const items = workflowItems(task());
    expect(signedCount(items)).toBe(1);
    expect(progressPercent(items)).toBe(50);
    expect(allSigned(items)).toBe(false);
    expect(allSigned(items.map((i) => ({ ...i, signedAt: "x" })))).toBe(true);
    expect(progressPercent([])).toBe(0);
    expect(allSigned([])).toBe(false);
  });

  it("knows who took part, so they cannot sign the whole task off", () => {
    const items = workflowItems(task());
    expect(tookPart("u_a", items)).toBe(true);
    expect(tookPart("u_b", items)).toBe(true);
    expect(tookPart("u_boss", items)).toBe(false);
    expect(tookPart("u_gone", [state({ assigneeId: "u_b", signedBy: "u_gone" })])).toBe(true);
  });
});

describe("who may do what", () => {
  it("treats a supervisor and anyone above as senior enough to swap people", () => {
    for (const role of ["supervisor", "site_manager", "operations_manager", "org_admin"]) expect(isSupervisorOrAbove(role)).toBe(true);
    for (const role of ["cleaner", "waiter", "client_auditor", undefined, null]) expect(isSupervisorOrAbove(role)).toBe(false);
  });

  it("lets only the named supervisor, or a manager, review", () => {
    const t = task();
    expect(canReviewTask({ id: "u_sup", role: "supervisor" }, t)).toBe(true);
    expect(canReviewTask({ id: "u_sup2", role: "supervisor" }, t)).toBe(false);
    expect(canReviewTask({ id: "u_mgr", role: "site_manager" }, t)).toBe(true);
    expect(canReviewTask({ id: "u_a", role: "cleaner" }, t)).toBe(false);
    expect(canReviewTask(undefined, t)).toBe(false);
  });
});

describe("sign-off rules", () => {
  it("uses the workflow's rule unless the item has its own", () => {
    const named = { ...settings, itemSignoffMode: "name" as const };
    expect(itemRule(design("a"), named)).toEqual({ mode: "name", requireNameMatch: true });
    expect(itemRule(design("b", { signoff: { mode: "signature", requireNameMatch: false } }), named)).toEqual({
      mode: "signature",
      requireNameMatch: false,
    });
    expect(itemRule(undefined, settings)).toEqual({ mode: "tick", requireNameMatch: true });
  });

  it("asks nothing extra for a tick", () => {
    expect(ruleProblems(tick, undefined, "Ada")).toEqual([]);
    expect(signoffPayload(tick, undefined)).toBeUndefined();
  });

  it("asks for a matching name and a drawn signature as the rule says", () => {
    const rule = { mode: "name_and_signature" as const, requireNameMatch: true };
    expect(ruleProblems(rule, undefined, "Ada Lovelace")).toEqual(["Type your name", "Draw your signature"]);
    const wrong = { signoff: { name: "Someone", strokes: [stroke()], width: 200, height: 80 } };
    expect(ruleProblems(rule, wrong, "Ada Lovelace")).toEqual(["The name must match your account name"]);
    const right = { signoff: { name: "ada  lovelace", strokes: [stroke()], width: 200, height: 80 } };
    expect(ruleProblems(rule, right, "Ada Lovelace")).toEqual([]);
    expect(ruleProblems({ ...rule, requireNameMatch: false }, wrong, "Ada Lovelace")).toEqual([]);
  });

  it("builds the sign-off to send, keeping only what the mode asks for", () => {
    const draft = { signoff: { name: " Ada ", strokes: [stroke()], width: 200, height: 80 } };
    const both = signoffPayload({ mode: "name_and_signature", requireNameMatch: true }, draft);
    expect(both).toMatchObject({ name: "Ada", signature: { width: 200, height: 80 } });
    const sig = signoffPayload({ mode: "signature", requireNameMatch: true }, draft);
    expect(sig).toEqual({ signature: { strokes: expect.any(Array), width: 200, height: 80 } });
    expect(sig).not.toHaveProperty("name");
  });
});

describe("signing an item", () => {
  it("needs nothing for a plain check ticked", () => {
    expect(itemProblems(state(), undefined, tick, "Ada")).toEqual([]);
  });

  it("needs photos, a reading, a scan, a confirmation or text as the item says", () => {
    const photo = state({ itemType: "photo", config: { min: 2, max: 3 } });
    expect(itemProblems(photo, { filePaths: ["images/a.jpg"] }, tick, "")).toEqual(["Add at least 2 photos"]);
    expect(itemProblems(photo, { filePaths: ["images/a.jpg", "images/b.jpg"] }, tick, "")).toEqual([]);

    const reading = state({ itemType: "measurement", config: { unit: "ppm", min: 1, max: 3 } });
    expect(itemProblems(reading, undefined, tick, "")).toEqual(["Enter a value"]);
    expect(itemProblems(reading, { value: "lots" }, tick, "")).toEqual(["Enter a number"]);
    expect(itemProblems(reading, { value: "0.5" }, tick, "")).toEqual(["It must be at least 1"]);
    expect(itemProblems(reading, { value: "9" }, tick, "")).toEqual(["It must be at most 3"]);
    expect(itemProblems(reading, { value: "2.5" }, tick, "")).toEqual([]);

    expect(itemProblems(state({ itemType: "scan" }), undefined, tick, "")).toEqual(["Scan the code"]);
    expect(itemProblems(state({ itemType: "confirm" }), { value: false }, tick, "")).toEqual(["Switch on to confirm"]);
    expect(itemProblems(state({ itemType: "text" }), { value: "  " }, tick, "")).toEqual(["This is required"]);
    expect(itemProblems(state({ itemType: "note", required: false }), undefined, tick, "")).toEqual([]);
  });

  it("adds the sign-off problems after the content ones", () => {
    const photo = state({ itemType: "photo", config: { min: 1, max: 1 } });
    expect(itemProblems(photo, undefined, { mode: "signature", requireNameMatch: true }, "Ada")).toEqual([
      "Add a photo",
      "Draw your signature",
    ]);
  });

  it("builds what the server expects", () => {
    expect(buildSignPayload(state(), undefined, tick)).toEqual({});
    expect(buildSignPayload(state({ itemType: "photo" }), { filePaths: ["images/a.jpg"] }, tick)).toEqual({ filePaths: ["images/a.jpg"] });
    expect(buildSignPayload(state({ itemType: "measurement" }), { value: " 2.5 " }, tick)).toEqual({ value: "2.5" });
    expect(buildSignPayload(state({ itemType: "confirm" }), { value: true }, tick)).toEqual({ value: true });
    expect(buildSignPayload(state({ itemType: "confirm" }), undefined, tick)).toEqual({ value: false });
    expect(buildSignPayload(state({ itemType: "scan" }), { scan: { value: "QR1", name: "Ada" } }, tick)).toEqual({
      scan: { value: "QR1", name: "Ada" },
    });
  });

  it("shows only the item types the verification inputs can render", () => {
    expect(asVerificationStep(state({ itemType: "photo" }))?.type).toBe("photo");
    expect(asVerificationStep(state({ itemType: "check" }))).toBeNull();
    expect(asVerificationStep(state({ itemType: "measurement" }))).toBeNull();
  });

  it("needs a connection only for photos, which have to upload first", () => {
    expect(needsConnection("photo")).toBe(true);
    for (const type of ["check", "text", "note", "confirm", "scan", "measurement"] as const) expect(needsConnection(type)).toBe(false);
  });
});

describe("showing it", () => {
  it("words a booking's hours", () => {
    expect(bookingHours("07:00", "15:00")).toBe("07:00 to 15:00");
    expect(bookingHours("07:00", null)).toBe("from 07:00");
    expect(bookingHours(null, null)).toBe("All day");
  });

  it("summarises what was captured", () => {
    expect(contentSummary(state())).toBe("");
    expect(contentSummary(state({ content: { filePaths: ["a", "b"] } }))).toBe("2 photos");
    expect(contentSummary(state({ content: { filePaths: ["a"] } }))).toBe("1 photo");
    expect(contentSummary(state({ content: { scan: { value: "QR1", name: "Ada" } } }))).toBe("Ada");
    expect(contentSummary(state({ content: { value: true } }))).toBe("Confirmed");
    expect(contentSummary(state({ itemType: "measurement", config: { unit: "ppm" }, content: { value: 2.5 } }))).toBe("2.5 ppm");
    expect(contentSummary(state({ itemType: "text", content: { value: "All good" } }))).toBe("All good");
  });
});

describe("whose task it is", () => {
  const t = (assigneeId: string, ids?: string[]) =>
    ({ assigneeId, metadata: ids ? { kind: "workflow", workflowAssigneeIds: ids } : {} }) as unknown as Task;

  it("is the person it is assigned to", () => {
    expect(isMyTask(t("u_a"), "u_a")).toBe(true);
    expect(isMyTask(t("u_a"), "u_b")).toBe(false);
  });

  it("is also anyone holding an item on a workflow task, though they are not its assignee", () => {
    expect(isMyTask(t("u_a", ["u_a", "u_b"]), "u_b")).toBe(true);
    expect(isMyTask(t("u_a", ["u_a", "u_b"]), "u_c")).toBe(false);
  });

  it("is nobody's when nobody is signed in", () => {
    expect(isMyTask(t("u_a"), undefined)).toBe(false);
    expect(isMyTask(t("u_a"), null)).toBe(false);
  });
});
