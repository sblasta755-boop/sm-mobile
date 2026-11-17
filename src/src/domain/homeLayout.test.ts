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

test("today's screen is every card in today's order", () => {
  expect(ids(defaultCards())).toEqual(PHONE_CARDS.map((c) => c.id));
  expect(ids(defaultCards())[0]).toBe("clock");
  expect(ids(defaultCards()).slice(-1)[0]).toBe("add_member");
  expect(defaultCards().every((c) => c.visible)).toBe(true);
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
    expect(out.slice(2).every((c) => c.visible)).toBe(true);
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
    expect(moveCard(start, "add_member", 1)).toBe(start);
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
