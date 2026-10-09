import { firstIncompleteKey, groupChecklist, isSectioned } from "./checklistSections";

describe("groupChecklist", () => {
  const flat = [
    { id: "a", type: "checkbox", done: true },
    { id: "b", type: "checkbox", done: false },
  ];

  it("leaves an old unsectioned checklist as one ungrouped group", () => {
    const groups = groupChecklist(flat);
    expect(isSectioned(flat)).toBe(false);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "", name: null, done: 1, total: 2, complete: false });
  });

  it("groups by section, ordered by sectionOrder, with per-section progress", () => {
    const items = [
      { id: "1", type: "checkbox", done: true, sectionId: "s2", sectionName: "Sinks", sectionOrder: 2 },
      { id: "2", type: "checkbox", done: true, sectionId: "s1", sectionName: "Prep", sectionOrder: 1 },
      { id: "3", type: "checkbox", done: false, sectionId: "s2", sectionName: "Sinks", sectionOrder: 2 },
      { id: "4", type: "checkbox", done: true, sectionId: "s1", sectionName: "Prep", sectionOrder: 1 },
    ];
    const groups = groupChecklist(items);
    expect(groups.map((g) => g.name)).toEqual(["Prep", "Sinks"]);
    expect(groups.map((g) => [g.done, g.total, g.complete])).toEqual([
      [2, 2, true],
      [1, 2, false],
    ]);
    expect(firstIncompleteKey(groups)).toBe("s2");
  });

  it("puts ungrouped items last, as General, next to sections", () => {
    const items = [
      { id: "1", type: "checkbox", done: false },
      { id: "2", type: "checkbox", done: false, sectionName: "Custom", sectionOrder: 1000 },
    ];
    const groups = groupChecklist(items);
    expect(groups.map((g) => g.name)).toEqual(["Custom", null]);
    expect(groups[0].key).toBe("custom:Custom");
  });

  it("does not let note items block a section from completing", () => {
    const groups = groupChecklist([
      { id: "1", type: "checkbox", done: true, sectionName: "Floors" },
      { id: "2", type: "note", done: false, sectionName: "Floors" },
    ]);
    expect(groups[0]).toMatchObject({ done: 1, total: 1, complete: true });
    expect(firstIncompleteKey(groups)).toBeNull();
  });
});

import { taskSubmissionBlocked } from "./status";

describe("submission across sections", () => {
  const task = (floorsDone: boolean) => ({
    status: "in_progress",
    qrVerified: true,
    requiresBeforeAfter: false,
    evidence: [],
    checklist: [
      { type: "checkbox", done: true, sectionName: "Sinks" },
      { type: "checkbox", done: floorsDone, sectionName: "Floors" },
    ],
  });

  it("stays blocked until every required item in every section is done", () => {
    expect(taskSubmissionBlocked(task(false)).missingChecks).toBe(true);
    expect(taskSubmissionBlocked(task(false)).blocked).toBe(true);
    expect(taskSubmissionBlocked(task(true)).blocked).toBe(false);
  });
});
