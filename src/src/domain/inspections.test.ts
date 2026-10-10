import {
  canInspectRole,
  canReviewSupervisorTask,
  openInspectionFor,
  latestInspectionFor,
  overallScore,
  PASS_SCORE,
 taskDestination } from "./inspections";
import type { Inspection } from "@/types/smartclean";


const insp = (over: Partial<Inspection>): Inspection => ({
  id: "i",
  taskId: "t1",
  status: "pending",
  createdAt: "2026-10-01T08:00:00Z",
  ...over,
});

describe("inspection helpers", () => {
  it("finds the newest inspection still waiting for a decision", () => {
    const list = [
      insp({ id: "old", status: "failed", createdAt: "2026-09-01T00:00:00Z" }),
      insp({ id: "a", createdAt: "2026-10-01T08:00:00Z" }),
      insp({ id: "b", createdAt: "2026-10-02T08:00:00Z", status: "reinspection_required" }),
      insp({ id: "other", taskId: "t2" }),
    ];
    expect(openInspectionFor(list, "t1")?.id).toBe("b");
    expect(openInspectionFor(list, "none")).toBeUndefined();
    expect(latestInspectionFor(list, "t1")?.id).toBe("b");
  });

  it("does not offer an inspection that was already decided", () => {
    expect(openInspectionFor([insp({ status: "passed" })], "t1")).toBeUndefined();
  });

  it("averages the category scores and rounds", () => {
    expect(overallScore({ A: 90, B: 85, C: 80 })).toBe(85);
    expect(overallScore({ A: 80, B: 81 })).toBe(81);
    expect(overallScore({})).toBe(0);
    expect(PASS_SCORE).toBe(80);
  });

  it("limits who inspects, and who may review a supervisor's own task", () => {
    expect(canInspectRole("supervisor")).toBe(true);
    expect(canInspectRole("cleaner")).toBe(false);
    expect(canInspectRole("client_auditor")).toBe(false);
    expect(canReviewSupervisorTask("site_manager")).toBe(true);
    expect(canReviewSupervisorTask("supervisor")).toBe(false);
  });
});

describe("taskDestination", () => {
  const submitted = { id: "t1", status: "submitted", assigneeId: "cleaner" };
  const inspections = [insp({ id: "insp1" })];

  it("sends a reviewer to the inspection of someone else's submitted task", () => {
    expect(taskDestination(submitted, { id: "sup", role: "supervisor" }, inspections)).toBe("/inspections/insp1");
    expect(taskDestination(submitted, { id: "mgr", role: "site_manager" }, inspections)).toBe("/inspections/insp1");
  });

  it("opens the task for everyone else, and for work that is not awaiting review", () => {
    expect(taskDestination(submitted, { id: "cleaner", role: "cleaner" }, inspections)).toBe("/tasks/t1");
    expect(taskDestination(submitted, { id: "sup", role: "supervisor" }, [])).toBe("/tasks/t1");
    expect(taskDestination({ ...submitted, status: "in_progress" }, { id: "sup", role: "supervisor" }, inspections)).toBe(
      "/tasks/t1",
    );
  });

  it("never sends a person to inspect their own task", () => {
    expect(taskDestination({ ...submitted, assigneeId: "sup" }, { id: "sup", role: "supervisor" }, inspections)).toBe(
      "/tasks/t1",
    );
  });
});
