import { TAG_PALETTE, tagColorName, tagStyle } from "./tagColors";

describe("tag colours", () => {
  it("uses the organisation's choice, ignoring case and spacing", () => {
    expect(tagColorName("  Opening ", { opening: "purple" })).toBe("purple");
  });
  it("gives a tag with no choice the same colour every time, from the palette", () => {
    const first = tagColorName("Closing");
    expect(tagColorName("closing")).toBe(first);
    expect(first in TAG_PALETTE).toBe(true);
  });
  it("ignores a stored colour that is not in the palette", () => {
    expect(tagColorName("Opening", { opening: "chartreuse" }) in TAG_PALETTE).toBe(true);
  });
  it("builds a tinted style from the colour", () => {
    expect(tagStyle("Opening", { opening: "blue" })).toEqual({
      color: "#2563eb",
      backgroundColor: "#2563eb22",
      borderColor: "#2563eb66",
    });
  });
});
