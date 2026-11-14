import { answerLine, ordersRange } from "./verificationOrders";

describe("ordersRange", () => {
  const thursday = new Date(2026, 10, 12);
  it("covers today, the last 7 days and the last 30 days, ending today", () => {
    expect(ordersRange("today", thursday)).toEqual(["2026-11-12", "2026-11-12"]);
    expect(ordersRange("week", thursday)).toEqual(["2026-11-06", "2026-11-12"]);
    expect(ordersRange("month", thursday)).toEqual(["2026-10-14", "2026-11-12"]);
  });
  it("crosses a year boundary", () => {
    expect(ordersRange("week", new Date(2027, 0, 3))).toEqual(["2026-12-28", "2027-01-03"]);
  });
});

describe("answerLine", () => {
  const base = { stepId: "a", type: "note" as const, label: "x" };
  it("describes each kind of answer on one line", () => {
    expect(answerLine({ ...base, type: "photo", filePaths: ["a"] })).toBe("1 photo");
    expect(answerLine({ ...base, type: "photo", filePaths: ["a", "b"] })).toBe("2 photos");
    expect(answerLine({ ...base, type: "scan", scan: { value: "X", name: "Sipho" } })).toBe("Sipho");
    expect(answerLine({ ...base, type: "scan", scan: { value: "RAW" } })).toBe("RAW");
    expect(answerLine({ ...base, type: "confirm", value: true })).toBe("Yes");
    expect(answerLine({ ...base, value: "late" })).toBe("late");
  });
});
