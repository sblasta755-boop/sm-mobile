import { matchesInspectionFilters } from "./inspectionFilters";

const at = (h: number) => new Date(2026, 9, 12, h, 0).toISOString();
const task = { assigneeId: "c1", submittedAt: at(14) };

describe("matchesInspectionFilters", () => {
  it("passes everything when no filter is set", () => {
    expect(matchesInspectionFilters(task, null, null)).toBe(true);
  });
  it("filters by cleaner", () => {
    expect(matchesInspectionFilters(task, "c1", null)).toBe(true);
    expect(matchesInspectionFilters(task, "c2", null)).toBe(false);
  });
  it("filters by the day submitted, and falls back to the due time before submission", () => {
    expect(matchesInspectionFilters(task, null, new Date(2026, 9, 12))).toBe(true);
    expect(matchesInspectionFilters(task, null, new Date(2026, 9, 13))).toBe(false);
    expect(matchesInspectionFilters({ assigneeId: "c1", dueAt: at(9) }, null, new Date(2026, 9, 12))).toBe(true);
    expect(matchesInspectionFilters({ assigneeId: "c1" }, null, new Date(2026, 9, 12))).toBe(false);
  });
  it("needs both to match when both are set", () => {
    expect(matchesInspectionFilters(task, "c2", new Date(2026, 9, 12))).toBe(false);
  });
});
