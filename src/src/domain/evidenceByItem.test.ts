import { evidenceByItem } from "./evidenceByItem";

const photo = (id: string, kind: string, itemId: string | null, at: string) => ({
  id,
  kind,
  checklistItemId: itemId,
  capturedAt: at,
});

describe("evidenceByItem", () => {
  const checklist = [{ id: "a" }, { id: "b" }];
  it("files photos under their item, before then after", () => {
    const { byItem, loose } = evidenceByItem(checklist, [
      photo("p3", "after", "a", "2026-10-15T10:05:00Z"),
      photo("p1", "before", "a", "2026-10-15T10:09:00Z"),
      photo("p2", "evidence", "b", "2026-10-15T10:01:00Z"),
    ]);
    expect(byItem.a.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(byItem.b.map((p) => p.id)).toEqual(["p2"]);
    expect(loose).toEqual([]);
  });
  it("keeps whole-task and orphaned photos together, in the order taken", () => {
    const { loose } = evidenceByItem(checklist, [
      photo("late", "evidence", null, "2026-10-15T11:00:00Z"),
      photo("gone", "evidence", "removed", "2026-10-15T09:00:00Z"),
    ]);
    expect(loose.map((p) => p.id)).toEqual(["gone", "late"]);
  });
});
