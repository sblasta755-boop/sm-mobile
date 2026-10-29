import {
  dayKey,
  heatColor,
  hexAlpha,
  mixHex,
  monthDays,
  parseDayKey,
  weekdayInitials,
} from "./calendarGrid";

describe("monthDays", () => {
  it("returns whole weeks starting on the chosen weekday", () => {
    const monday = monthDays(new Date(2026, 11, 1), 1);
    expect(monday).toHaveLength(35);
    expect(monday[0]).toBe("2026-11-30");
    expect(monday[34]).toBe("2027-01-03");
    expect(monthDays(new Date(2026, 11, 1), 0)[0]).toBe("2026-11-29");
  });
  it("uses six weeks when the month needs them", () => {
    expect(monthDays(new Date(2025, 2, 1), 1)).toHaveLength(42);
  });
});

describe("day keys", () => {
  it("round-trips in local time", () => {
    expect(dayKey(parseDayKey("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("weekdayInitials", () => {
  it("rotates to the week start", () => {
    expect(weekdayInitials(1)[0]).toBe("MON");
    expect(weekdayInitials(0)[0]).toBe("SUN");
  });
});

describe("colour blending", () => {
  it("mixes linearly", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("heat grows with intensity and is clamped", () => {
    expect(heatColor("#ffffff", "#000000", 0)).not.toBe(
      heatColor("#ffffff", "#000000", 1),
    );
    expect(heatColor("#ffffff", "#000000", 5)).toBe(
      heatColor("#ffffff", "#000000", 1),
    );
  });
});

describe("hexAlpha", () => {
  it("converts to rgba", () => {
    expect(hexAlpha("#182531", 0.5)).toBe("rgba(24,37,49,0.5)");
  });
});
