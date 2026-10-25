import {
  ALL,
  filterBySection,
  initialSection,
  sectionOptions,
  TASK_PHOTOS,
} from "./evidenceSections";

const slot = (
  checklistItemId: string | undefined,
  sectionName: string | undefined,
  kind = "evidence",
) => ({ kind, checklistItemId, sectionName }) as never;

const slots = [
  slot("c1", "Kitchen"),
  slot("c2", "Kitchen"),
  slot("c3", "Bathroom"),
  slot(undefined, undefined, "before"),
  slot(undefined, undefined, "issue"),
];

describe("filtering evidence by section", () => {
  it("lists sections in order, plus task photos, and only when there is a choice", () => {
    expect(sectionOptions(slots).map((o) => o.key)).toEqual([
      "Kitchen",
      "Bathroom",
      TASK_PHOTOS,
    ]);
    expect(
      sectionOptions([slot("c1", "Kitchen"), slot("c2", "Kitchen")]),
    ).toEqual([]);
    expect(sectionOptions([slot("c1", undefined)])).toEqual([]);
  });
  it("shows only the chosen section, but always keeps the issue slot", () => {
    const kitchen = filterBySection(slots, "Kitchen");
    expect(
      kitchen.map(
        (s: { checklistItemId?: string; kind: string }) =>
          s.checklistItemId ?? s.kind,
      ),
    ).toEqual(["c1", "c2", "issue"]);
    expect(filterBySection(slots, TASK_PHOTOS)).toHaveLength(2);
  });
  it("shows everything for all, or for a section that no longer exists", () => {
    expect(filterBySection(slots, ALL)).toHaveLength(5);
    expect(filterBySection(slots, "Garage")).toHaveLength(5);
  });
  it("starts on the opened item's section only when the standing preference is focus", () => {
    expect(initialSection("focus", "c3", slots)).toBe("Bathroom");
    expect(initialSection("all", "c3", slots)).toBe(ALL);
    expect(initialSection("focus", null, slots)).toBe(ALL);
    expect(initialSection("focus", "missing", slots)).toBe(ALL);
  });
});
