import {
  bucketLabel,
  channelLabel,
  statusLabel,
  categoryLabel,
  changeLabel,
  guardChanged,
  guardErrors,
  heatLevel,
  matchOrganisations,
  pct,
  roleLabel,
  severityRank,
} from "./notificationInsights";

const bounds = [
  { key: "dedupeWindowMinutes", default: 2, min: 1, max: 60, label: "Window" },
  { key: "pushPerRecipientPerHour", default: 12, min: 3, max: 120, label: "Pushes" },
];

describe("notificationInsights", () => {
  it("formats rates and changes", () => {
    expect(pct(0.1234)).toBe("12%");
    expect(pct(null)).toBe("-");
    expect(changeLabel(0.5, 10)).toBe("+50%");
    expect(changeLabel(-0.05, 10)).toBe("-5%");
    expect(changeLabel(null, 10)).toBe("new");
    expect(changeLabel(null, 0)).toBe("-");
  });

  it("labels roles and categories for people", () => {
    expect(roleLabel("site_manager")).toBe("Site manager");
    expect(categoryLabel("table service")).toBe("Table service");
    expect(roleLabel("")).toBe("");
  });

  it("labels chart buckets", () => {
    expect(bucketLabel("2026-11-25T14:00:00", "hour")).toBe("25/11 14:00");
    expect(bucketLabel("2026-11-25T00:00:00", "day")).toMatch(/25/);
  });

  it("ranks severities and heat", () => {
    expect(
      ["info", "critical", "warning"].sort((a, b) => severityRank(a) - severityRank(b)),
    ).toEqual(["critical", "warning", "info"]);
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(4, 10)).toBe(2);
    expect(heatLevel(6, 10)).toBe(3);
    expect(heatLevel(10, 10)).toBe(4);
    expect(heatLevel(5, 0)).toBe(0);
  });

  it("checks the guard form against the server's bounds", () => {
    expect(
      guardErrors({ dedupeWindowMinutes: "2", pushPerRecipientPerHour: "12" }, bounds),
    ).toEqual({});
    const bad = guardErrors({ dedupeWindowMinutes: "0", pushPerRecipientPerHour: "abc" }, bounds);
    expect(Object.keys(bad)).toEqual(["dedupeWindowMinutes", "pushPerRecipientPerHour"]);
    expect(
      guardErrors({ dedupeWindowMinutes: "1.5", pushPerRecipientPerHour: "" }, bounds),
    ).toHaveProperty("pushPerRecipientPerHour");
  });

  it("knows when the form differs from what is saved", () => {
    const saved = { enabled: true, dedupeWindowMinutes: 2, pushPerRecipientPerHour: 12 };
    expect(
      guardChanged(
        { enabled: true, dedupeWindowMinutes: "2", pushPerRecipientPerHour: "12" },
        saved,
      ),
    ).toBe(false);
    expect(
      guardChanged(
        { enabled: false, dedupeWindowMinutes: "2", pushPerRecipientPerHour: "12" },
        saved,
      ),
    ).toBe(true);
    expect(
      guardChanged(
        { enabled: true, dedupeWindowMinutes: "2", pushPerRecipientPerHour: "20" },
        saved,
      ),
    ).toBe(true);
  });

  it("searches organisations by name", () => {
    const orgs = [{ name: "La Cosa Nostra" }, { name: "Drama Club" }];
    expect(matchOrganisations(orgs, "  cosa ")).toEqual([{ name: "La Cosa Nostra" }]);
    expect(matchOrganisations(orgs, "")).toHaveLength(2);
  });

  it("words log channels and results", () => {
    expect(channelLabel("web_push")).toBe("Browser push");
    expect(statusLabel("sent")).toBe("Sent");
    expect(statusLabel("suppressed", "burst")).toBe("Held back: burst");
    expect(statusLabel("failed", "refused")).toBe("Failed: refused");
  });
});
