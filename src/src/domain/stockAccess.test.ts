import { NO_STOCK_TABS, canCountLine, canManageCounts, canOpenStock, normaliseStockAccess } from "./stockAccess";

const withTabs = (tabs: Partial<typeof NO_STOCK_TABS>) =>
  normaliseStockAccess({ tabs: { ...NO_STOCK_TABS, ...tabs } });

describe("stock access", () => {
  it("nobody has any tab until the server says so", () => {
    expect(canOpenStock(normaliseStockAccess(null))).toBe(false);
    expect(canOpenStock(normaliseStockAccess({}))).toBe(false);
  });

  it("any one tab is enough to open stock", () => {
    expect(canOpenStock(withTabs({ count: true }))).toBe(true);
  });

  it("fills in grants an older server did not send", () => {
    const access = normaliseStockAccess({ tabs: { count: true } as never });
    expect(Object.keys(access.tabs).sort()).toEqual(Object.keys(NO_STOCK_TABS).sort());
  });

  it("managing a count needs Count and a supervisor-level role", () => {
    expect(canManageCounts(withTabs({ count: true }), "supervisor")).toBe(true);
    expect(canManageCounts(withTabs({ count: true }), "cleaner")).toBe(false);
    expect(canManageCounts(withTabs({}), "site_manager")).toBe(false);
  });

  it("a line given to someone else is theirs; unassigned lines are open", () => {
    expect(canCountLine({ assigneeId: null }, "me", false)).toBe(true);
    expect(canCountLine({ assigneeId: "me" }, "me", false)).toBe(true);
    expect(canCountLine({ assigneeId: "other" }, "me", false)).toBe(false);
    expect(canCountLine({ assigneeId: "other" }, "me", true)).toBe(true);
  });
});
