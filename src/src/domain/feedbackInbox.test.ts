import { categoryLabel, initialsOf, neighbour, preview, replyLink } from "./feedbackInbox";

test("initials use first and last name, and are never empty", () => {
  expect(initialsOf("Thandi Mokoena")).toBe("TM");
  expect(initialsOf("  sipho  ")).toBe("SI");
  expect(initialsOf("")).toBe("?");
});

test("a preview flattens whitespace and trims with an ellipsis", () => {
  expect(preview("a\n\n  b   c")).toBe("a b c");
  const long = preview("x".repeat(300), 20);
  expect(long).toHaveLength(20);
  expect(long.endsWith("…")).toBe(true);
});

test("a reply opens mail with the subject and greeting filled in, and is null without an email", () => {
  const link = replyLink({ senderEmail: "t@x.test", senderName: "Thandi Mokoena", message: "Scan fails" })!;
  expect(link.startsWith("mailto:t%40x.test?subject=")).toBe(true);
  expect(decodeURIComponent(link)).toContain("Hi Thandi,");
  expect(replyLink({ senderEmail: null, senderName: "X", message: "m" })).toBeNull();
});

test("stepping through the list stops at the ends", () => {
  const ids = ["a", "b", "c"];
  expect(neighbour(ids, "a", 1)).toBe("b");
  expect(neighbour(ids, "c", 1)).toBeNull();
  expect(neighbour(ids, "a", -1)).toBeNull();
  expect(neighbour(ids, null, 1)).toBe("a");
  expect(neighbour([], "a", 1)).toBeNull();
});

test("an unknown category reads as Other", () => {
  expect(categoryLabel("idea")).toBe("Idea");
  expect(categoryLabel("nonsense" as never)).toBe("Other");
});
