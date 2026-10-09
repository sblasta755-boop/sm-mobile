import { evidenceForSlot, evidenceSlots, itemPhotoProgress, slotKeyForItem, slotProgress } from "./evidenceSlots";
import { taskSubmissionBlocked } from "./status";

const photoItem = (id: string, photoCount: number, label = id) => ({ id, label, type: "photo_required", photoCount });

describe("evidenceSlots", () => {
  it("keeps Before / After / Issue for a classic before-and-after task", () => {
    const slots = evidenceSlots({ requiresBeforeAfter: true, checklist: [], evidence: [] }, "working");
    expect(slots.map((s) => s.key)).toEqual(["before", "after", "issue"]);
    expect(slots.find((s) => s.key === "after")?.unlocked).toBe(false);
  });

  it("gives each photo item its own slot with the number of photos it asks for", () => {
    const task = {
      requiresBeforeAfter: false,
      checklist: [photoItem("sink", 1, "Sink"), photoItem("floor", 2, "Floor")],
      evidence: [{ kind: "evidence", checklistItemId: "floor" }],
    };
    const slots = evidenceSlots(task, "working");
    expect(slots.map((s) => s.key)).toEqual(["item:sink", "item:floor", "issue"]);
    const floor = slots[1];
    expect([floor.required, floor.taken, slotProgress(floor)]).toEqual([2, 1, "1 of 2 photos"]);
    expect(evidenceForSlot(task.evidence, floor)).toHaveLength(1);
    expect(evidenceForSlot(task.evidence, slots[0])).toHaveLength(0);
  });

  it("offers a single Evidence slot, and no Before, when there are no photo items", () => {
    const slots = evidenceSlots({ requiresBeforeAfter: false, checklist: [], evidence: [] }, "working");
    expect(slots.map((s) => [s.key, s.label])).toEqual([
      ["evidence", "Evidence"],
      ["issue", "Issue"],
    ]);
  });

  it("gives each photo item its own Before and After in a before-and-after task, with no task-level pair", () => {
    const task = {
      requiresBeforeAfter: true,
      checklist: [photoItem("sink", 1, "Sink"), photoItem("floor", 2, "Floor")],
      evidence: [{ kind: "before", checklistItemId: "sink" }],
    };
    const slots = evidenceSlots(task, "working");
    expect(slots.map((s) => s.key)).toEqual([
      "item:sink:before",
      "item:sink:after",
      "item:floor:before",
      "item:floor:after",
      "issue",
    ]);
    // After unlocks only once that item's Before is in - and only that item's.
    expect(slots.find((s) => s.key === "item:sink:after")?.unlocked).toBe(true);
    expect(slots.find((s) => s.key === "item:floor:after")?.unlocked).toBe(false);
    expect(slots.find((s) => s.key === "item:floor:before")?.required).toBe(2);
  });

  it("opens an item's Take photo on its next unfinished slot", () => {
    const task = {
      requiresBeforeAfter: true,
      checklist: [photoItem("sink", 1, "Sink")],
      evidence: [] as { kind: string; checklistItemId?: string }[],
    };
    expect(slotKeyForItem(evidenceSlots(task, "working"), "sink")).toBe("item:sink:before");
    task.evidence.push({ kind: "before", checklistItemId: "sink" });
    expect(slotKeyForItem(evidenceSlots(task, "working"), "sink")).toBe("item:sink:after");
  });

  it("counts a before-and-after item's Before and After together", () => {
    const item = { id: "sink", photoCount: 1 };
    const task = { requiresBeforeAfter: true, evidence: [{ kind: "before", checklistItemId: "sink" }] };
    expect(itemPhotoProgress(task, item)).toMatchObject({ taken: 1, required: 2 });
    expect(itemPhotoProgress({ requiresBeforeAfter: false, evidence: [] }, item).required).toBe(1);
  });

  it("locks everything until the task is started", () => {
    const slots = evidenceSlots({ requiresBeforeAfter: false, checklist: [photoItem("a", 1)], evidence: [] }, "scan");
    expect(slots.find((s) => s.key === "item:a")?.unlocked).toBe(false);
  });
});

describe("single-evidence submission", () => {
  const base = { status: "in_progress", qrVerified: true, requiresBeforeAfter: false, checklist: [], evidence: [] };

  it("needs one photo only when the organisation requires it", () => {
    expect(taskSubmissionBlocked(base, true, false).missingEvidence).toBe(false);
    expect(taskSubmissionBlocked(base, true, true).missingEvidence).toBe(true);
    expect(taskSubmissionBlocked({ ...base, evidence: [{ kind: "evidence" }] }, true, true).missingEvidence).toBe(false);
  });

  it("leaves photo items to their own completion rather than a task-level photo", () => {
    const task = { ...base, checklist: [{ type: "photo_required", done: false, photoCount: 1 }] };
    const result = taskSubmissionBlocked(task, true, true);
    expect(result.missingEvidence).toBe(false);
    expect(result.missingChecks).toBe(true);
  });
});
