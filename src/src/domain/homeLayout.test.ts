import {
  PHONE_CARDS,
  canCustomiseHome,
  defaultCards,
  isDefaultLayout,
  moveCard,
  parseCached,
  reconcile,
  resolveLayout,
  setVisible,
  toStored,
  type CachedLayout,
} from "./homeLayout";

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);
const stored = (cards: unknown[]) => ({ version: 1, classic: { cards } });
const cached = (over: Partial<CachedLayout> = {}): CachedLayout => ({
  layout: stored([{ id: "summary", visible: true }]) as CachedLayout["layout"],
  rev: 2,
  locked: false,
  pending: false,
  ...over,
});
const server = (rev: number, locked = false) => ({ layout: stored([{ id: "sites", visible: true }]), rev, locked });

const OPERATIONS = ["attendance_now", "approvals", "site_pulse", "maintenance", "stock_alerts", "leave_today", "compliance_reviews", "noticeboard", "device_battery"];

test("today's screen is today's eight cards in today's order, with the operations cards waiting after them", () => {
  expect(ids(defaultCards())).toEqual(PHONE_CARDS.map((c) => c.id));
  expect(ids(defaultCards())[0]).toBe("clock");
  expect(defaultCards().filter((c) => c.visible).map((c) => c.id)).toEqual([
    "clock", "summary", "on_shift", "open_incidents", "shortcuts", "overdue_tasks", "sites", "add_member",
  ]);
  expect(defaultCards().filter((c) => !c.visible).map((c) => c.id)).toEqual(OPERATIONS);
});

describe("resolveLayout never breaks the screen", () => {
  test.each([null, undefined, 5, "x", [], {}, { version: 2, classic: { cards: [] } }, { version: 1 }, { version: 1, classic: { cards: "no" } }])(
    "falls back to today's screen for %j",
    (bad) => {
      expect(resolveLayout(bad)).toEqual(defaultCards());
    },
  );

  test("keeps the saved order and hidden cards, and appends cards it predates", () => {
    const out = resolveLayout(stored([{ id: "overdue_tasks", visible: true }, { id: "summary", visible: false }]));
    expect(ids(out).slice(0, 2)).toEqual(["overdue_tasks", "summary"]);
    expect(out[1].visible).toBe(false);
    expect(out).toHaveLength(PHONE_CARDS.length);
    // a saved home never gains a card on its own: what it predates waits, hidden, in the cards list
    expect(out.slice(2).every((c) => !c.visible)).toBe(true);
  });

  test("a layout saved before the operations cards loads with them hidden and everything else as saved", () => {
    const before = stored(PHONE_CARDS.slice(0, 8).map((c, i) => ({ id: c.id, visible: i !== 3 })));
    const out = resolveLayout(before);
    expect(out.slice(0, 8).map((c) => c.visible)).toEqual([true, true, true, false, true, true, true, true]);
    expect(out.slice(8).map((c) => [c.id, c.visible])).toEqual(OPERATIONS.map((id) => [id, false]));
  });

  test("skips unknown cards, repeats and junk", () => {
    const out = resolveLayout(stored([{ id: "from_the_future" }, null, 7, { id: "sites" }, { id: "sites", visible: false }, { id: "kpi_approved" }]));
    expect(ids(out)[0]).toBe("sites");
    expect(out.filter((c) => c.id === "sites")).toHaveLength(1);
    expect(out.find((c) => c.id === "sites")?.visible).toBe(true);
    expect(ids(out)).not.toContain("from_the_future");
    expect(ids(out)).not.toContain("kpi_approved"); // a desktop card
  });

  test("returns today's screen when nothing would be visible", () => {
    expect(resolveLayout(stored(PHONE_CARDS.map((c) => ({ id: c.id, visible: false }))))).toEqual(defaultCards());
  });

  test("round-trips through toStored", () => {
    const cards = setVisible(moveCard(defaultCards(), "sites", -1), "add_member", false);
    expect(resolveLayout(toStored(cards))).toEqual(cards);
  });
});

describe("arranging", () => {
  test("moves a card up and down, and stops at the ends", () => {
    const start = defaultCards();
    expect(ids(moveCard(start, "summary", -1))[0]).toBe("summary");
    expect(moveCard(start, "clock", -1)).toBe(start);
    expect(moveCard(start, "device_battery", 1)).toBe(start); // the last card
    expect(moveCard(start, "nope", 1)).toBe(start);
  });
  test("will not hide the last visible card", () => {
    let cards = defaultCards();
    for (const c of cards.slice(1)) cards = setVisible(cards, c.id, false);
    expect(cards.filter((c) => c.visible)).toHaveLength(1);
    expect(setVisible(cards, "clock", false)).toBe(cards);
  });
  test("knows when it is back to default", () => {
    expect(isDefaultLayout(defaultCards())).toBe(true);
    expect(isDefaultLayout(moveCard(defaultCards(), "sites", -1))).toBe(false);
    expect(isDefaultLayout(setVisible(defaultCards(), "sites", false))).toBe(false);
  });
});

test("only the three management roles have a customisable home", () => {
  for (const r of ["org_admin", "operations_manager", "site_manager"]) expect(canCustomiseHome(r)).toBe(true);
  for (const r of ["supervisor", "client_auditor", "cleaner", "system_admin", "", null, undefined]) expect(canCustomiseHome(r)).toBe(false);
});

describe("the device's copy", () => {
  test("reads back what was saved, and treats damage as nothing saved", () => {
    expect(parseCached(JSON.stringify(cached()))?.rev).toBe(2);
    for (const bad of [null, undefined, "", "not json", "{}", '{"rev":"x"}', JSON.stringify({ ...cached(), layout: { version: 9 } })]) {
      expect(parseCached(bad as string | null)).toBeNull();
    }
  });

  test("takes the server's copy when none is saved, when newer, or when a lock changed", () => {
    expect(reconcile(null, { phone: server(1) })).toMatchObject({ action: "set", entry: { rev: 1, pending: false } });
    expect(reconcile(cached({ rev: 2 }), { phone: server(3) }).action).toBe("set");
    expect(reconcile(cached({ rev: 2 }), { phone: server(2, true) })).toMatchObject({ action: "set", entry: { locked: true } });
  });
  test("keeps its own when the server's is the same or older", () => {
    expect(reconcile(cached({ rev: 2 }), { phone: server(2) }).action).toBe("keep");
    expect(reconcile(cached({ rev: 2 }), { phone: server(1) }).action).toBe("keep");
  });
  test("an unsynced edit of the person's own wins until it syncs", () => {
    expect(reconcile(cached({ pending: true }), { phone: server(9) }).action).toBe("keep");
    expect(reconcile(cached({ pending: true }), { phone: null }).action).toBe("keep");
  });
  test("clears the copy when the server has none (reset), but not when there was none", () => {
    expect(reconcile(cached(), { phone: null }).action).toBe("clear");
    expect(reconcile(cached(), {}).action).toBe("clear");
    expect(reconcile(null, { phone: null }).action).toBe("keep");
  });
  test("changes nothing against an older backend (undefined) or a role with no customisable home (null)", () => {
    expect(reconcile(cached(), undefined).action).toBe("keep");
    expect(reconcile(cached(), null).action).toBe("keep");
  });
});

import {
  CUSTOM_CARDS,
  defaultCustom,
  isDefaultCustom,
  mergeStored,
  patchCustomCard,
  resolveActiveHome,
  resolveCustom,
  setCardVisible,
} from "./homeLayout";

describe("the Custom home", () => {
  test("defaults to an operations-focused home, with the task cards waiting to be added", () => {
    const d = defaultCustom();
    expect(d.cards.filter((c) => c.visible).map((c) => c.id)).toEqual(["attendance_now", "approvals", "attention", "site_pulse", "maintenance", "stock_alerts", "incidents"]);
    expect(d.cards.filter((c) => !c.visible).map((c) => c.id)).toEqual(["on_shift", "completion", "flow", "activity_map", "quality", "open_tasks", "corrective_actions", "leave_today", "compliance_reviews", "noticeboard", "device_battery"]);
    expect(isDefaultCustom(d)).toBe(true);
  });

  test.each([null, undefined, 4, "x", {}, { version: 2, custom: { cards: [] } }, { version: 1 }, { version: 1, custom: "no" }])(
    "falls back to the default for %j",
    (bad) => {
      expect(resolveCustom(bad)).toEqual(defaultCustom());
    },
  );

  test("keeps the look, order, views and periods, and fixes what it cannot draw", () => {
    const out = resolveCustom({
      version: 1,
      custom: {
        look: { density: "compact", cardStyle: "outlined" },
        cards: [
          { id: "flow", visible: true, size: "m", view: "bar", period: "7" },
          { id: "completion", visible: true, view: "hologram", period: "7" },
          { id: "from_the_future" },
          { id: "flow" },
          null,
        ],
      },
    });
    expect(out.look).toEqual({ density: "compact", cardStyle: "outlined" });
    expect(out.cards.slice(0, 2).map((c) => c.id)).toEqual(["flow", "completion"]);
    expect(out.cards[0]).toMatchObject({ size: "m", view: "bar", period: "7" });
    expect(out.cards[1]).toMatchObject({ view: "gauge", period: null });
    expect(out.cards).toHaveLength(CUSTOM_CARDS.length);
  });

  test("returns the default cards when none would be visible", () => {
    const hidden = { version: 1, custom: { cards: CUSTOM_CARDS.map((c) => ({ id: c.id, visible: false })) } };
    expect(resolveCustom(hidden).cards).toEqual(defaultCustom().cards);
  });

  test("opens on Classic unless Custom was chosen", () => {
    expect(resolveActiveHome(undefined)).toBe("classic");
    expect(resolveActiveHome({ active: "nonsense" })).toBe("classic");
    expect(resolveActiveHome({ active: "custom" })).toBe("custom");
  });

  test("will not hide the last visible Custom card", () => {
    let cards = defaultCustom().cards;
    for (const c of cards.slice(1)) cards = setCardVisible(cards, c.id, false);
    expect(cards.filter((c) => c.visible)).toHaveLength(1);
    expect(setCardVisible(cards, cards[0].id, false)).toBe(cards);
  });
});

describe("storing a layout", () => {
  test("stores nothing when everything is default and Classic is active", () => {
    expect(mergeStored(null, { classic: defaultCards() })).toBeNull();
    expect(mergeStored(null, { custom: defaultCustom(), active: "classic" })).toBeNull();
  });

  test("stores a changed Classic home and keeps a Custom home saved earlier", () => {
    const custom = patchCustomCard(defaultCustom(), "completion", { view: "number" });
    const first = mergeStored(null, { custom, active: "custom" })!;
    const next = mergeStored(first, { classic: setVisible(defaultCards(), "sites", false), active: "classic" })!;
    expect(next.active).toBeUndefined();
    expect(next.classic?.cards.find((c) => c.id === "sites")?.visible).toBe(false);
    expect(resolveCustom(next).cards.find((c) => c.id === "completion")?.view).toBe("number");
  });

  test("opening on Custom with everything default is stored as the default Custom home (the server needs a part)", () => {
    const out = mergeStored(null, { active: "custom" })!;
    expect(out.active).toBe("custom");
    expect(out.custom?.cards.length).toBe(CUSTOM_CARDS.length);
    expect(out.classic).toBeUndefined();
  });

  test("round-trips a Custom home through storing and resolving", () => {
    let custom = patchCustomCard(defaultCustom(), "flow", { view: "bar", period: "7", size: "m" });
    custom = { look: { density: "compact", cardStyle: "outlined" }, cards: setCardVisible(custom.cards, "open_tasks", true) };
    expect(resolveCustom(mergeStored(null, { custom, active: "custom" }))).toEqual(custom);
  });
});
