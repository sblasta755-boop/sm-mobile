import { assignableManagementRoles, canManageRole } from "./managerRanks";

describe("managerRanks", () => {
  it("lets an administrator manage everyone", () => {
    for (const role of ["org_admin", "operations_manager", "site_manager", "supervisor", "cleaner"]) {
      expect(canManageRole("org_admin", role)).toBe(true);
    }
  });

  it("lets an operations manager manage their level and below, not an administrator", () => {
    expect(canManageRole("operations_manager", "operations_manager")).toBe(true);
    expect(canManageRole("operations_manager", "site_manager")).toBe(true);
    expect(canManageRole("operations_manager", "org_admin")).toBe(false);
  });

  it("keeps a site manager off operations managers and administrators", () => {
    expect(canManageRole("site_manager", "site_manager")).toBe(true);
    expect(canManageRole("site_manager", "supervisor")).toBe(true);
    expect(canManageRole("site_manager", "cleaner")).toBe(true);
    expect(canManageRole("site_manager", "operations_manager")).toBe(false);
    expect(canManageRole("site_manager", "org_admin")).toBe(false);
  });

  it("gives everyone else no rights", () => {
    expect(canManageRole("supervisor", "cleaner")).toBe(false);
    expect(canManageRole(undefined, "cleaner")).toBe(false);
  });

  it("offers each manager only roles at or below their own", () => {
    const keys = (role: string) => assignableManagementRoles(role).map((r) => r.key);
    expect(keys("site_manager")).toEqual(["supervisor", "site_manager", "client_auditor"]);
    expect(keys("operations_manager")).toEqual(["supervisor", "site_manager", "operations_manager", "client_auditor"]);
    expect(keys("org_admin")).toContain("org_admin");
  });
});
