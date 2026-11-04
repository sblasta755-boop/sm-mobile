import { liveRecent, parseRecent, pushRecent } from "./recentPicks";

test("a pick moves to the front, once, and the list stays short", () => {
  expect(pushRecent([], "cleaner")).toEqual(["cleaner"]);
  expect(pushRecent(["waiter", "cleaner", "kitchen"], "cleaner")).toEqual(["cleaner", "waiter", "kitchen"]);
  expect(pushRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
});

test("only choices that still exist are offered", () => {
  const sites = [{ id: "s1" }, { id: "s2" }];
  expect(liveRecent(["s2", "gone", "s1"], sites, (s) => s.id)).toEqual([{ id: "s2" }, { id: "s1" }]);
});

test("stored values are read defensively", () => {
  expect(parseRecent(null)).toEqual([]);
  expect(parseRecent("not json")).toEqual([]);
  expect(parseRecent('["a", 2, "b"]')).toEqual(["a", "b"]);
});
