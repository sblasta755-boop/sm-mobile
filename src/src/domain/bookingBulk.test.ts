import { actionFor, buttonLabel, changePatch, hoursChosen, splitChosen, summaryLine ,
} from "./bookingBulk";

const none = { custom: false, shiftIds: [], startTime: "", endTime: "" };

describe("splitChosen", () => {
  const existing = [
    { userId: "a", date: "d1" },
    { userId: "a", date: "d2" },
    { userId: "b", date: "d1" },
  ];
  it("separates new bookings from ones that exist, per person and per day", () => {
    const r = splitChosen(["a", "b", "c"], ["d1", "d2"], existing);
    expect(r.toChange).toBe(3);
    expect(r.toBook).toBe(3); // b on d2, c on both
    expect(r.bookedPeople.sort()).toEqual(["a", "b"]);
    expect(r.newPeople.sort()).toEqual(["b", "c"]);
  });
  it("is all new when nobody is booked, all changes when everybody is", () => {
    expect(splitChosen(["x"], ["d1"], []).toChange).toBe(0);
    expect(splitChosen(["a"], ["d1", "d2"], existing)).toMatchObject({ toBook: 0, toChange: 2 });
  });
});

describe("what a change sends", () => {
  const payload = { shiftIds: ["s1"], startTime: null, endTime: null };
  it("sends only what was set, so a note never wipes the hours", () => {
    expect(changePatch(none, "", payload)).toEqual({});
    expect(changePatch(none, "  Bring a torch ", payload)).toEqual({
      instructions: "Bring a torch",
    });
    expect(changePatch({ ...none, shiftIds: ["s1"] }, "", payload)).toEqual({
      shiftIds: ["s1"],
      startTime: null,
      endTime: null,
    });
    expect(changePatch({ ...none, shiftIds: ["s1"] }, "Note", payload)).toEqual({
      shiftIds: ["s1"],
      startTime: null,
      endTime: null,
      instructions: "Note",
    });
  });
  it("knows when hours were chosen", () => {
    expect(hoursChosen(none)).toBe(false);
    expect(hoursChosen({ ...none, shiftIds: ["s"] })).toBe(true);
    expect(hoursChosen({ custom: true, shiftIds: [], startTime: "09:00", endTime: "" })).toBe(true);
    expect(hoursChosen({ custom: true, shiftIds: [], startTime: "", endTime: "" })).toBe(false);
  });
});

describe("the action and its words", () => {
  it("books, changes or does both depending on who was chosen", () => {
    expect(actionFor({ toBook: 2, toChange: 0 }, true)).toBe("book");
    expect(actionFor({ toBook: 0, toChange: 2 }, true)).toBe("change");
    expect(actionFor({ toBook: 1, toChange: 1 }, true)).toBe("both");
    // Changing needs something to change; without it the booked ones are left alone.
    expect(actionFor({ toBook: 1, toChange: 1 }, false)).toBe("book");
    expect(actionFor({ toBook: 0, toChange: 2 }, false)).toBe("none");
    expect(actionFor({ toBook: 0, toChange: 0 }, true)).toBe("none");
    expect(buttonLabel("both")).toBe("Book and update");
    expect(buttonLabel("change")).toBe("Update bookings");
    expect(buttonLabel("book")).toBe("Book and notify");
  });
  it("sums it up in a line", () => {
    expect(summaryLine(3, 2, { toBook: 4, toChange: 2 }, true)).toBe(
      "3 people × 2 days · 4 to book · 2 already booked (will be updated)",
    );
    expect(summaryLine(1, 1, { toBook: 0, toChange: 1 }, false)).toBe(
      "1 person × 1 day · 1 already booked",
    );
    expect(summaryLine(0, 2, { toBook: 0, toChange: 0 }, true)).toBe("0 people × 2 days");
  });
});
