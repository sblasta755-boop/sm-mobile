import { resizeTarget } from "./photoSize";

describe("resizeTarget", () => {
  it("shrinks the longer side to the limit", () => {
    expect(resizeTarget(4000, 3000, 1600)).toEqual({ width: 1600 });
    expect(resizeTarget(3000, 4000, 1600)).toEqual({ height: 1600 });
  });
  it("leaves a small or unknown-size photo alone", () => {
    expect(resizeTarget(1200, 900, 1600)).toBeNull();
    expect(resizeTarget(undefined, undefined, 1600)).toBeNull();
  });
});
