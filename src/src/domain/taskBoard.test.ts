import { filterTasks, filtersActive, NO_FILTERS, tagsOf } from "./taskBoard";


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
