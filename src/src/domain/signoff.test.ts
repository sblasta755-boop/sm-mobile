import { signaturePayload, signoffProblems, strokesToPath, type Stroke } from "./signoff";

const scribble: Stroke[] = [{ points: Array.from({ length: 12 }, (_, i) => [i * 5, 10 + (i % 3) * 6] as [number, number]) }];
const base = { requireNameMatch: true, accountName: "Jane Cleaner", typedName: "", strokes: [] as Stroke[] };

describe("signoffProblems", () => {
  it("name mode needs the typed name, matching the account when asked", () => {
    expect(signoffProblems({ ...base, mode: "name" })).toEqual(["Type your name"]);
    expect(signoffProblems({ ...base, mode: "name", typedName: "Bob" })).toEqual(["The name must match your account name"]);
    expect(signoffProblems({ ...base, mode: "name", typedName: " jane   cleaner " })).toEqual([]);
    expect(signoffProblems({ ...base, mode: "name", typedName: "Bob", requireNameMatch: false })).toEqual([]);
  });
  it("signature mode needs a real signature, not a dot", () => {
    expect(signoffProblems({ ...base, mode: "signature" })).toEqual(["Draw your signature"]);
    expect(signoffProblems({ ...base, mode: "signature", strokes: [{ points: [[1, 1], [2, 2]] }] })).toEqual(["Draw your signature"]);
    expect(signoffProblems({ ...base, mode: "signature", strokes: scribble })).toEqual([]);
  });
  it("name and signature needs both", () => {
    expect(signoffProblems({ ...base, mode: "name_and_signature" })).toHaveLength(2);
    expect(signoffProblems({ ...base, mode: "name_and_signature", typedName: "Jane Cleaner", strokes: scribble })).toEqual([]);
  });
});

describe("signature shape", () => {
  it("builds the payload and a path", () => {
    expect(signaturePayload(scribble, 300, 120)).toMatchObject({ width: 300, height: 120 });
    expect(strokesToPath(scribble).startsWith("M0.0 10.0 L")).toBe(true);
  });
});
