import {
  draftKey,
  describeEntry,
  entriesOf,
  stageIn,
  summariseAll,
  updateEntry,
  hoursLabel,
  keepSkipped,
  sameAsBooking,
  stage,
  summarise,
  summaryText,
  toBatchEntries,
  type Draft,
  type DraftEntry,
} from "./rosterDraft";

const hours = { shiftIds: ["sh1"], startTime: null, endTime: null };
const add = (userId: string, date: string, instructions = ""): DraftEntry => ({
  kind: "add",
  userId,
  userName: userId.toUpperCase(),
  date,
  hours,
  instructions,
  label: "Day",
});

describe("rosterDraft", () => {
  it("marking a cell twice replaces the first mark, and null clears it", () => {
    let d: Draft = stage({}, "a", "2026-11-26", add("a", "2026-11-26"));
    d = stage(d, "a", "2026-11-26", add("a", "2026-11-26", "Side gate"));
    expect(Object.keys(d)).toEqual([draftKey("a", "2026-11-26")]);
    expect(stage(d, "a", "2026-11-26", null)).toEqual({});
  });

  it("counts adds, changes, removals and people", () => {
    let d: Draft = {};
    d = stage(d, "a", "2026-11-26", add("a", "2026-11-26"));
    d = stage(d, "a", "2026-11-27", add("a", "2026-11-27"));
    d = stage(d, "b", "2026-11-26", {
      kind: "cancel",
      bookingId: "bk1",
      userId: "b",
      userName: "B",
      date: "2026-11-26",
      label: "Day",
    });
    d = stage(d, "c", "2026-11-26", {
      kind: "update",
      bookingId: "bk2",
      userId: "c",
      userName: "C",
      date: "2026-11-26",
      hours,
      instructions: "",
      label: "Day",
    });
    const s = summarise(d);
    expect(s).toMatchObject({ added: 2, changed: 1, removed: 1, people: 3, total: 4 });
    expect(summaryText(s)).toBe("2 added, 1 changed, 1 removed");
    expect(summaryText(summarise({}))).toBe("");
  });

  it("builds request entries in day order, with bookingIds only for changes", () => {
    let d: Draft = stage({}, "a", "2026-11-27", add("a", "2026-11-27"));
    d = stage(d, "b", "2026-11-26", {
      kind: "cancel",
      bookingId: "bk1",
      userId: "b",
      userName: "B",
      date: "2026-11-26",
      label: "Day",
    });
    const out = toBatchEntries(d);
    expect(out.map((e) => e.action)).toEqual(["cancel", "add"]);
    expect(out[0]).toMatchObject({ bookingId: "bk1" });
    expect(out[1].bookingId).toBeUndefined();
    expect(out[1].date).toBe("2026-11-27");
  });

  it("recognises hours and instructions that change nothing", () => {
    const booking = { shiftIds: ["sh1"], startTime: null, endTime: null, instructions: "Gate" };
    expect(sameAsBooking(booking, hours, " Gate ")).toBe(true);
    expect(sameAsBooking(booking, { ...hours, shiftIds: ["sh2"] }, "Gate")).toBe(false);
    expect(sameAsBooking(booking, hours, "Other")).toBe(false);
    expect(
      sameAsBooking(
        { ...booking, shiftIds: [], startTime: "07:00", endTime: "15:00" },
        { shiftIds: [], startTime: "07:00", endTime: "15:00" },
        "Gate",
      ),
    ).toBe(true);
  });

  it("names hours by shift, then times, then all day", () => {
    expect(
      hoursLabel(
        { shiftIds: ["a", "b"], startTime: null, endTime: null },
        { a: "Day", b: "Night" },
      ),
    ).toBe("Day + Night");
    expect(hoursLabel({ shiftIds: [], startTime: "07:00", endTime: "15:00" }, {})).toBe(
      "07:00-15:00",
    );
    expect(hoursLabel({ shiftIds: [], startTime: "07:00", endTime: null }, {})).toBe("from 07:00");
    expect(hoursLabel({ shiftIds: [], startTime: null, endTime: null }, {})).toBe("All day");
  });

  it("keeps only what the server skipped after a send", () => {
    let d: Draft = stage({}, "a", "2026-11-26", add("a", "2026-11-26"));
    d = stage(d, "b", "2026-11-26", add("b", "2026-11-26"));
    expect(Object.keys(keepSkipped(d, [{ userId: "b", date: "2026-11-26" }]))).toEqual([
      draftKey("b", "2026-11-26"),
    ]);
    expect(keepSkipped(d, [])).toEqual({});
  });

  it("keeps a draft per site and counts across them", () => {
    let d = stageIn({}, "s1", "a", "2026-11-26", add("a", "2026-11-26"));
    d = stageIn(d, "s2", "a", "2026-11-27", add("a", "2026-11-27"));
    expect(Object.keys(d)).toEqual(["s1", "s2"]);
    expect(summariseAll(d)).toMatchObject({ added: 2, total: 2, people: 2 });
    expect(entriesOf(d).map((e) => e.siteId)).toEqual(["s1", "s2"]);
    d = stageIn(d, "s1", "a", "2026-11-26", null);
    expect(Object.keys(d)).toEqual(["s2"]); // an emptied site disappears
    expect(describeEntry(add("a", "2026-11-26"))).toBe("A, 2026-11-26: Day (new)");
  });

  it("stages a change that keeps what the patch leaves out, and nothing when nothing differs", () => {
    const b = {
      id: "bk1",
      shiftIds: ["sh1"],
      startTime: null,
      endTime: null,
      instructions: "Gate",
      userId: "a",
      userName: "A",
      date: "2026-11-26",
    };
    expect(updateEntry(b, { instructions: "Gate" }, "Day")).toBeNull();
    const changed = updateEntry(b, { instructions: "Back door" }, "Day");
    expect(changed).toMatchObject({
      kind: "update",
      bookingId: "bk1",
      instructions: "Back door",
      hours: { shiftIds: ["sh1"] },
    });
    const moved = updateEntry(
      b,
      { hours: { shiftIds: [], startTime: "07:00", endTime: "15:00" } },
      "07:00-15:00",
    );
    expect(moved).toMatchObject({ instructions: "Gate", hours: { startTime: "07:00" } });
  });
});
