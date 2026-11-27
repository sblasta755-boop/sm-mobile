import { ALL_ROLES_SCOPE, bookableRoleOptions, hasExtraRoles, levelOf, sameScope, scopeFor, withLevel } from "./roleScope";

const limited = { mode: "roles" as const, roles: ["cleaner"], extraRoles: ["waiter"] };

describe("roleScope", () => {
  it("treats a missing entry as every role", () => {
    expect(scopeFor(undefined, "s1")).toEqual(ALL_ROLES_SCOPE);
    expect(scopeFor({ s2: limited }, "s1")).toEqual(ALL_ROLES_SCOPE);
    expect(scopeFor({ s1: limited }, "s1")).toEqual(limited);
  });

  it("moves a role between levels without duplicating it", () => {
    const moved = withLevel(limited, "waiter", "primary");
    expect(moved).toEqual({ mode: "roles", roles: ["cleaner", "waiter"], extraRoles: [] });
    expect(levelOf(moved, "waiter")).toBe("primary");
    expect(levelOf(withLevel(moved, "waiter", "none"), "waiter")).toBe("none");
  });

  it("starts a limit from all roles once a role is chosen", () => {
    expect(withLevel(ALL_ROLES_SCOPE, "cleaner", "primary")).toEqual({ mode: "roles", roles: ["cleaner"], extraRoles: [] });
  });

  it("knows when the list can be widened", () => {
    expect(hasExtraRoles({ s1: limited }, "s1")).toBe(true);
    expect(hasExtraRoles({ s1: { ...limited, extraRoles: [] } }, "s1")).toBe(false);
    expect(hasExtraRoles(undefined, "s1")).toBe(false);
  });

  it("compares scopes and always offers supervisors", () => {
    expect(sameScope(limited, { ...limited })).toBe(true);
    expect(sameScope(limited, ALL_ROLES_SCOPE)).toBe(false);
    expect(bookableRoleOptions([{ key: "cleaner", label: "Cleaner" }]).map((r) => r.key)).toEqual(["cleaner", "supervisor"]);
  });
});
