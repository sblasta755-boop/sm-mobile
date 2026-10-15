import { filterTasks, filtersActive, NO_FILTERS, sortTasks, tagsOf } from "./taskBoard";


describe("tag filter", () => {
  const task = (id: string, tags?: string[]) => ({ id, title: id, status: "assigned", tags });
  it("keeps tasks carrying any chosen tag, ignoring case, and everything when none is chosen", () => {
    const list = [task("a", ["Opening"]), task("b", ["Closing", "Deep clean"]), task("c")];
    expect(filterTasks(list, { ...NO_FILTERS, tags: ["opening"] }).map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(list, { ...NO_FILTERS, tags: ["Opening", "deep clean"] }).map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTasks(list, NO_FILTERS)).toHaveLength(3);
  });
  it("counts a tag as an active filter and lists tags once each", () => {
    expect(filtersActive({ ...NO_FILTERS, tags: ["x"] })).toBe(true);
    expect(tagsOf([task("a", ["Opening"]), task("b", ["opening", "Closing"])])).toEqual(["Closing", "Opening"]);
  });
});

describe("sortTasks", () => {
  const t = (id: string, over: Partial<import("./taskBoard").BoardTask> = {}) => ({ id, title: id, status: "assigned", ...over });
  const ids = (list: { id: string }[]) => list.map((x) => x.id);

  it("keeps the order for the default sort", () => {
    const list = [t("b"), t("a")];
    expect(sortTasks(list, "default")).toBe(list);
  });
  it("orders by due time with missing times last either way", () => {
    const list = [t("none"), t("late", { dueAt: "2026-10-16T10:00:00Z" }), t("soon", { dueAt: "2026-10-15T10:00:00Z" })];
    expect(ids(sortTasks(list, "due_asc"))).toEqual(["soon", "late", "none"]);
    expect(ids(sortTasks(list, "due_desc"))).toEqual(["late", "soon", "none"]);
  });
  it("orders by created time, title and priority", () => {
    const list = [
      t("b", { createdAt: "2026-10-01T00:00:00Z", priority: "low" }),
      t("a", { createdAt: "2026-10-03T00:00:00Z", priority: "high" }),
      t("C", { createdAt: "2026-10-02T00:00:00Z", priority: "medium" }),
    ];
    expect(ids(sortTasks(list, "created_desc"))).toEqual(["a", "C", "b"]);
    expect(ids(sortTasks(list, "created_asc"))).toEqual(["b", "C", "a"]);
    expect(ids(sortTasks(list, "title_asc"))).toEqual(["a", "b", "C"]);
    expect(ids(sortTasks(list, "title_desc"))).toEqual(["C", "b", "a"]);
    expect(ids(sortTasks(list, "priority"))).toEqual(["a", "C", "b"]);
  });
});
