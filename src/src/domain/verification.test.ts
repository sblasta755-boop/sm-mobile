import {
  friendlyWhen,
  workflowOutline,
  buildAnswers,
  firstIncomplete,
  photoLimits,
  progressPercent,
  referenceFromScan,
  referenceOf,
  stepComplete,
  type VerificationStep,
} from "./verification";

const step = (over: Partial<VerificationStep> & Pick<VerificationStep, "id" | "type">): VerificationStep => ({
  label: over.id,
  helpText: "",
  required: true,
  config: {},
  ...over,
});

const photo = step({ id: "p", type: "photo", config: { min: 2, max: 3 } });

describe("photo steps", () => {
  it("need the minimum number of photos", () => {
    expect(stepComplete(photo, undefined)).toBe(false);
    expect(stepComplete(photo, { filePaths: ["images/a.jpg"] })).toBe(false);
    expect(stepComplete(photo, { filePaths: ["images/a.jpg", "images/b.jpg"] })).toBe(true);
  });
  it("an optional photo step needs none", () => {
    const optional = step({ id: "o", type: "photo", required: false, config: { min: 2, max: 3 } });
    expect(photoLimits(optional)).toEqual({ min: 0, max: 3 });
    expect(stepComplete(optional, undefined)).toBe(true);
  });
});

describe("other steps", () => {
  it("required text must not be blank", () => {
    const text = step({ id: "t", type: "text" });
    expect(stepComplete(text, { value: "   " })).toBe(false);
    expect(stepComplete(text, { value: "SEAL-9" })).toBe(true);
  });
  it("an optional note can stay empty", () => {
    expect(stepComplete(step({ id: "n", type: "note", required: false }), undefined)).toBe(true);
  });
  it("confirm must be ticked when required", () => {
    const confirm = step({ id: "c", type: "confirm" });
    expect(stepComplete(confirm, { value: false })).toBe(false);
    expect(stepComplete(confirm, { value: true })).toBe(true);
  });
  it("scan needs a scanned value", () => {
    const scan = step({ id: "s", type: "scan" });
    expect(stepComplete(scan, undefined)).toBe(false);
    expect(stepComplete(scan, { scan: { value: "X" } })).toBe(true);
  });
});

describe("a whole run", () => {
  const steps = [photo, step({ id: "c", type: "confirm" }), step({ id: "r", type: "reference" })];
  it("points at the first step still to do", () => {
    expect(firstIncomplete(steps, {})).toBe(0);
    expect(firstIncomplete(steps, { p: { filePaths: ["a", "b"] } })).toBe(1);
    expect(firstIncomplete(steps, { p: { filePaths: ["a", "b"] }, c: { value: true } })).toBe(2);
    expect(firstIncomplete(steps, { p: { filePaths: ["a", "b"] }, c: { value: true }, r: { value: "O-1" } })).toBe(-1);
  });
  it("reports progress", () => {
    expect(progressPercent(steps, {})).toBe(0);
    expect(progressPercent(steps, { c: { value: true } })).toBe(33);
    expect(progressPercent([], {})).toBe(0);
  });
  it("builds the payload from answered steps only, trimming text", () => {
    const answers = {
      p: { filePaths: ["images/a.jpg", "images/b.jpg"] },
      c: { value: true },
      r: { value: "  ORD-1 " },
    };
    expect(buildAnswers(steps, answers)).toEqual([
      { stepId: "p", filePaths: ["images/a.jpg", "images/b.jpg"] },
      { stepId: "c", value: true },
      { stepId: "r", value: "ORD-1" },
    ]);
    expect(buildAnswers(steps, { c: { value: false } })).toEqual([{ stepId: "c", value: false }]);
    expect(referenceOf(steps, answers)).toBe("ORD-1");
    expect(referenceOf([photo], {})).toBeNull();
  });
});

describe("referenceFromScan", () => {
  it("keeps a plain code and takes the last part of an address", () => {
    expect(referenceFromScan(" ORD-77 ")).toBe("ORD-77");
    expect(referenceFromScan("https://shop.example.com/orders/ORD-77?x=1")).toBe("ORD-77");
  });
});

describe("sign-off steps", () => {
  const strokes = [{ points: Array.from({ length: 12 }, (_, i) => [i * 5, 10 + (i % 3)] as [number, number]) }];
  const signStep = (config: Record<string, unknown> = {}, required = true) =>
    step({ id: "s", type: "signoff", required, config: { mode: "name_and_signature", requireNameMatch: true, ...config } });

  it("needs a matching name and a real signature when both are asked for", () => {
    const s = signStep();
    expect(stepComplete(s, undefined, "Thandi N")).toBe(false);
    expect(stepComplete(s, { signoff: { name: "Thandi N", strokes: [], width: 0, height: 0 } }, "Thandi N")).toBe(false);
    expect(stepComplete(s, { signoff: { name: "Someone", strokes, width: 300, height: 200 } }, "Thandi N")).toBe(false);
    expect(stepComplete(s, { signoff: { name: " thandi  n ", strokes, width: 300, height: 200 } }, "Thandi N")).toBe(true);
  });

  it("follows the mode and leaves name matching to the server when the account name is unknown", () => {
    expect(stepComplete(signStep(), { signoff: { name: "Anyone", strokes, width: 300, height: 200 } })).toBe(true);
    const nameOnly = signStep({ mode: "name", requireNameMatch: false });
    expect(stepComplete(nameOnly, { signoff: { name: "Any", strokes: [], width: 0, height: 0 } })).toBe(true);
    const drawOnly = signStep({ mode: "signature" });
    expect(stepComplete(drawOnly, { signoff: { name: "", strokes, width: 300, height: 200 } })).toBe(true);
    expect(stepComplete(drawOnly, { signoff: { name: "typed", strokes: [], width: 0, height: 0 } })).toBe(false);
    expect(stepComplete(signStep({}, false), undefined, "Thandi N")).toBe(true);
  });

  it("sends the name only when the mode wants it, and the strokes in the server's shape", () => {
    const answers = { s: { signoff: { name: " Thandi N ", strokes, width: 300, height: 200 } } };
    const both = buildAnswers([signStep()], answers)[0].signoff;
    expect(both?.name).toBe("Thandi N");
    expect(both?.signature?.width).toBe(300);
    expect(both?.signature?.strokes[0][0]).toEqual([0, 10]);
    expect(buildAnswers([signStep({ mode: "signature" })], answers)[0].signoff?.name).toBeUndefined();
    expect(buildAnswers([signStep()], { s: { signoff: { name: "", strokes: [], width: 0, height: 0 } } })).toEqual([]);
  });
});

describe("screen helpers", () => {
  it("outlines a workflow", () => {
    const steps = [
      step({ id: "a", type: "scan", config: { scanKind: "staff_qr" } }),
      step({ id: "b", type: "photo", config: { min: 2, max: 3 } }),
      step({ id: "c", type: "signoff" }),
      step({ id: "d", type: "reference" }),
    ];
    expect(workflowOutline(steps)).toEqual(["2 photos", "Staff QR", "Sign-off", "Order number"]);
    expect(workflowOutline([])).toEqual([]);
  });

  it("says when in plain words", () => {
    const now = new Date(2026, 10, 12, 23, 0);
    expect(friendlyWhen(new Date(2026, 10, 12, 22, 58).toISOString(), now)).toBe("Today, 22:58");
    expect(friendlyWhen(new Date(2026, 10, 11, 9, 5).toISOString(), now)).toBe("Yesterday, 09:05");
    expect(friendlyWhen(new Date(2026, 10, 3, 14, 0).toISOString(), now)).toBe("3 Nov, 14:00");
    expect(friendlyWhen(new Date(2025, 11, 31, 8, 0).toISOString(), now)).toBe("31 Dec 2025, 08:00");
    expect(friendlyWhen("nope", now)).toBe("nope");
  });
});
