import { formatTimeSpent, timeSpentLabel, timeSpentMinutes } from "./timeSpent";

const at = (hhmm: string) => `2026-10-22T${hhmm}:00.000Z`;

describe("time spent on a task", () => {
  it("is submit minus start", () => {
    expect(
      timeSpentMinutes({ startedAt: at("10:44"), submittedAt: at("10:45") }),
    ).toBe(1);
    expect(
      timeSpentLabel({ startedAt: at("08:00"), submittedAt: at("09:05") }),
    ).toBe("1 h 05 min");
  });
  it("shows nothing until started and submitted, or when the times are reversed", () => {
    expect(timeSpentLabel({ startedAt: at("10:00") })).toBeUndefined();
    expect(
      timeSpentLabel({ startedAt: at("11:00"), submittedAt: at("10:00") }),
    ).toBeUndefined();
  });
  it("formats short and exact-hour spans", () => {
    expect(formatTimeSpent(0)).toBe("under 1 min");
    expect(formatTimeSpent(120)).toBe("2 h");
  });
});
