import { ordinal, rankLabel } from "./gamification";

describe("gamification wording", () => {
  it("writes ordinals, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
        "23rd",
        "101st",
        "111th",
      ],
    );
  });
  it("shows a position without names, or says the person is not ranked", () => {
    expect(rankLabel(3, 12)).toBe("3rd of 12");
    expect(rankLabel(null, 12)).toMatch(/Not ranked yet/);
  });
});
