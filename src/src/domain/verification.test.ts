import {
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
