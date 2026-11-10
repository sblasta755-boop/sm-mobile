import { currentShift } from "./workingHours";

describe("currentShift", () => {
  const day = { name: "Day", startTime: "09:00", endTime: "18:30" };
  const night = { name: "Night", startTime: "18:30", endTime: "04:00" };
  const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m);
  it("shows Day by day and Night by night, across midnight", () => {
    expect(currentShift([day, night], at(12))?.name).toBe("Day");
    expect(currentShift([day, night], at(18, 30))?.name).toBe("Night");
    expect(currentShift([day, night], at(23))?.name).toBe("Night");
    expect(currentShift([day, night], at(2))?.name).toBe("Night");
  });
  it("shows the next shift in a gap, and nothing without shifts", () => {
    expect(currentShift([day, night], at(5))?.name).toBe("Day");
    expect(currentShift([], at(12))).toBeNull();
    expect(currentShift(undefined, at(12))).toBeNull();
  });
});
