import { EMPTY_SUMMARY, STALE_AFTER_MS, agoText, applyAnswer, blockStatus, blocksNeeded, isStale, operationsAvailable, parseSummaryState } from "./homeSummary";

describe("which blocks the visible cards need", () => {
  test("asks only for what is on screen, once each", () => {
    expect(blocksNeeded(["summary", "overdue_tasks"])).toEqual([]);
    expect(blocksNeeded(["attendance_now", "approvals", "maintenance", "stock_alerts"])).toEqual(["schedule", "approvals", "maintenance", "stock"]);
    expect(blocksNeeded(["approvals", "approvals"])).toEqual(["approvals"]);
    expect(blocksNeeded(["site_pulse"])).toEqual([]); // drawn from bootstrap alone
  });
});

describe("telling loading from left out", () => {
  test("loading until asked; ready when sent; left out (hide the card) when asked and not sent", () => {
    expect(blockStatus(EMPTY_SUMMARY, "stock")).toBe("loading");
    const state = applyAnswer(EMPTY_SUMMARY, ["stock", "maintenance"], { stock: { outOfStock: 1, atReorder: 2, restockOpen: 0 } }, 1000);
    expect(blockStatus(state, "stock")).toBe("ready");
    expect(blockStatus(state, "maintenance")).toBe("omitted");
    expect(blockStatus(state, "approvals")).toBe("loading");
  });
  test("a later answer that drops a block removes it; other blocks are kept", () => {
    let state = applyAnswer(EMPTY_SUMMARY, ["stock", "maintenance"], { stock: { outOfStock: 1, atReorder: 0, restockOpen: 0 }, maintenance: { open: 3, critical: 0, needQuote: 0, awaitingApproval: 0, verify: 0, onHold: 0, scheduled: 0 } }, 1000);
    state = applyAnswer(state, ["stock"], {}, 2000);
    expect(blockStatus(state, "stock")).toBe("omitted");
    expect(blockStatus(state, "maintenance")).toBe("ready");
    expect(state.fetchedAt).toBe(2000);
  });
});

describe("staleness", () => {
  test("stale before the first answer and after a few minutes, fresh in between", () => {
    expect(isStale(EMPTY_SUMMARY, 5000)).toBe(true);
    const fresh = applyAnswer(EMPTY_SUMMARY, ["stock"], {}, 10_000);
    expect(isStale(fresh, 10_000 + STALE_AFTER_MS - 1)).toBe(false);
    expect(isStale(fresh, 10_000 + STALE_AFTER_MS + 1)).toBe(true);
  });
  test("says how long ago in words", () => {
    expect(agoText(null, 0)).toBe("");
    expect(agoText(0, 30_000)).toBe("just now");
    expect(agoText(0, 5 * 60_000)).toBe("5m ago");
    expect(agoText(0, 3 * 3_600_000)).toBe("3h ago");
    expect(agoText(0, 2 * 86_400_000)).toBe("2d ago");
  });
});

test("damaged storage counts as nothing kept", () => {
  for (const bad of [null, "", "not json", "{}", '{"data":1,"asked":[],"fetchedAt":null}', '{"data":{},"asked":"x","fetchedAt":null}']) {
    expect(parseSummaryState(bad)).toBeNull();
  }
  const ok = applyAnswer(EMPTY_SUMMARY, ["stock"], { stock: { outOfStock: 2, atReorder: 1, restockOpen: 0 } }, 1234);
  expect(parseSummaryState(JSON.stringify(ok))?.fetchedAt).toBe(1234);
});

describe("whether a card is drawn at all", () => {
  const status = (omitted: boolean) => () => (omitted ? ("omitted" as const) : ("ready" as const));
  test("hides a card whose data the server left out, so there is no empty gap", () => {
    for (const id of ["stock_alerts", "maintenance", "approvals"]) expect(operationsAvailable(id, status(true), true)).toBe(false);
  });
  test("draws a card with data, and Site pulse always; Who is in only with attendance on", () => {
    expect(operationsAvailable("stock_alerts", status(false), true)).toBe(true);
    expect(operationsAvailable("site_pulse", status(true), false)).toBe(true);
    expect(operationsAvailable("attendance_now", status(false), false)).toBe(false);
    expect(operationsAvailable("attendance_now", status(false), true)).toBe(true);
  });
  test("is not for a card it does not know", () => {
    expect(operationsAvailable("completion", status(false), true)).toBe(false);
  });
});

describe("the later cards map to their own blocks", () => {
  test("each is hidden when the server left its data out", () => {
    const left = () => "omitted" as const;
    for (const id of ["leave_today", "compliance_reviews", "noticeboard", "device_battery"]) expect(operationsAvailable(id, left, true)).toBe(false);
    expect(blocksNeeded(["leave_today", "compliance_reviews", "noticeboard", "device_battery"])).toEqual(["leave", "compliance", "noticeboard", "devices"]);
  });
});
