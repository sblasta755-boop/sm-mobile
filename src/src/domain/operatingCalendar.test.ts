import { closedReason, closureProblem, operatingDaysLabel, siteOperationsPayload, toggleDate, typedDay } from "./operatingCalendar";

describe("operating calendar", () => {
  it("labels the days", () => {
    expect(operatingDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(operatingDaysLabel([0, 1, 2, 3, 4])).toBe("Mon to Fri");
    expect(operatingDaysLabel([4, 5])).toBe("Fri, Sat");
  });

  it("treats a site with nothing set as open every day", () => {
    expect(closedReason({}, "2026-11-29")).toBeNull();
  });

  it("closes the weekdays not chosen", () => {
    const site = { operatingDays: [0, 1, 2, 3, 4] };
    expect(closedReason(site, "2026-11-27")).toBeNull(); // Friday
    expect(closedReason(site, "2026-11-28")).toBe("Closed on Saturdays");
  });

  it("closes the dates of a closure, inclusive, and public holidays only when asked", () => {
    const site = { closures: [{ startDate: "2026-12-01", endDate: "2026-12-03", reason: "New floors", kind: "renovation" as const }] };
    expect(closedReason(site, "2026-12-03")).toBe("Closed: New floors");
    expect(closedReason(site, "2026-12-04")).toBeNull();
    expect(closedReason({}, "2026-12-16", new Set(["2026-12-16"]))).toBeNull();
    expect(closedReason({ closedOnPublicHolidays: true }, "2026-12-16", new Set(["2026-12-16"]))).toBe("Closed: public holiday");
  });

  it("checks typed dates", () => {
    expect(typedDay("20261224")).toBe("2026-12-24");
    expect(closureProblem({ startDate: "2026-12-03", endDate: "2026-12-01" })).not.toBeNull();
    expect(closureProblem({ startDate: "2026-02-30", endDate: "2026-03-01" })).not.toBeNull();
    expect(closureProblem({ startDate: "2026-12-01", endDate: "2026-12-01" })).toBeNull();
  });

  it("lets a date opened by hand beat the rules", () => {
    const site = { operatingDays: [0, 1, 2, 3, 4], openDates: ["2026-11-29"] };
    expect(closedReason(site, "2026-11-29")).toBeNull(); // a Sunday
    expect(closedReason(site, "2026-11-28")).not.toBeNull();
  });

  it("flips a date: open to a one-day closure, shut to opened by hand, and back", () => {
    const base = { operatingDays: [0, 1, 2, 3, 4] };
    const shutSat = toggleDate(base, "2026-11-28");
    expect(shutSat.openDates).toEqual(["2026-11-28"]); // Saturday was shut, so tapping opens it
    const closeMon = toggleDate(base, "2026-11-23");
    expect(closeMon.closures).toHaveLength(1); // Monday was open, so tapping closes it
    expect(toggleDate({ ...base, ...closeMon }, "2026-11-23").closures).toHaveLength(0);
    expect(toggleDate({ ...base, ...shutSat }, "2026-11-28").openDates).toHaveLength(0);
    const inside = { closures: [{ startDate: "2026-12-01", endDate: "2026-12-05", reason: "", kind: "other" as const }] };
    expect(toggleDate(inside, "2026-12-03").openDates).toEqual(["2026-12-03"]);
  });

  it("does not open a day by hand when asked not to (organisation level)", () => {
    const org = { operatingDays: [0, 1, 2, 3, 4] };
    expect(toggleDate(org, "2026-11-28", new Set(), false).openDates).toEqual([]);
    expect(toggleDate(org, "2026-11-23", new Set(), false).closures).toHaveLength(1);
  });

  it("sends a site's other fields back unchanged when one section saves", () => {
    const site = {
      calendarOverride: { workingHours: false, operatingDays: true, closedOnPublicHolidays: false },
      workingHours: { start: "07:00", end: "16:00" }, // the organisation's, so it must not be sent as the site's own
      operatingDays: [1, 2],
      closedOnPublicHolidays: true,
      ownClosures: [],
      openDates: ["2026-11-29"],
    };
    expect(siteOperationsPayload(site)).toEqual({
      workingHours: null,
      operatingDays: [1, 2],
      closedOnPublicHolidays: null,
      closures: [],
      openDates: ["2026-11-29"],
    });
    expect(siteOperationsPayload(site, { operatingDays: null }).operatingDays).toBeNull();
  });
});
