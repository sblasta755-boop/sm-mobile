import { tagColorName } from "./tagColors";
import { MAINTENANCE_TAG, hasMaintenanceTag } from "./taskTags";

describe("the built-in Maintenance tag", () => {
  it("is recognised whatever the spelling", () => {
    expect(hasMaintenanceTag(["Opening", "maintenance"])).toBe(true);
    expect(hasMaintenanceTag(["Opening"])).toBe(false);
    expect(hasMaintenanceTag(undefined)).toBe(false);
  });
  it("has a fixed colour an organisation cannot change", () => {
    expect(tagColorName(MAINTENANCE_TAG, { maintenance: "teal" })).toBe(
      "orange",
    );
  });
});
