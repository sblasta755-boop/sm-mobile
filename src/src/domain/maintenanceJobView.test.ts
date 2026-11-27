import { describeEvent, firstName } from "./maintenanceEvents";
import { invoiceNext, jobActions, nextStage, progressSteps, readAmount, skipTargets } from "./maintenanceJobView";

const job = (over: Partial<Parameters<typeof jobActions>[0]> = {}) => ({
  state: "reported" as const,
  path: "contractor" as const,
  clearedToProceed: true,
  activeHolds: 0,
  skipMode: "next" as const,
  ...over,
});
const handler = { report: true, handle: true, approve: false, pay: false };

describe("job actions, same as the PWA", () => {
  it("offers one main action and tucks the rest under More", () => {
    const a = jobActions(job(), handler);
    expect(a.primary?.id).toBe("investigate");
    expect(a.more.map((m) => m.id)).toEqual(["add_quote", "no_repair", "cancel"]);
  });
  it("lets an approver review a waiting quote", () => {
    const a = jobActions(job({ state: "awaiting_approval" }), { ...handler, handle: false, approve: true });
    expect(a.primary?.id).toBe("review_quote");
  });
  it("gives the override right a skip and a close-early", () => {
    const a = jobActions(job(), { ...handler, override: true });
    expect(a.more.map((m) => m.id)).toEqual(expect.arrayContaining(["skip_next", "close_early"]));
  });
  it("offers nothing on a closed job", () => {
    expect(jobActions(job({ state: "completed" }), { ...handler, override: true })).toEqual({ primary: null, more: [] });
  });
});

describe("progress, stages and invoices", () => {
  it("has more stops for a contractor job than an in-house one", () => {
    expect(progressSteps({ state: "reported", path: "contractor" })).toHaveLength(5);
    expect(progressSteps({ state: "reported", path: "internal" })).toHaveLength(3);
  });
  it("knows the next stage and the skip targets", () => {
    expect(nextStage("approved", "contractor")?.to).toBe("scheduled");
    expect(nextStage("completed", "contractor")).toBeNull();
    expect(skipTargets("reported", "internal").some((t) => t.to === "awaiting_quote")).toBe(false);
  });
  it("tells a payer what to do with an invoice", () => {
    const inv = { state: "unpaid", popFiles: [], popForwardedAt: null, contractorAckAt: null };
    expect(invoiceNext(inv, { ...handler, pay: true }).action).toBe("record_proof");
    expect(invoiceNext(inv, handler).action).toBeNull();
  });
  it("reads amounts", () => {
    expect(readAmount("R 1250,50")).toBe(1250.5);
    expect(readAmount("abc")).toBeNull();
  });
});

describe("history in words", () => {
  it("says what happened", () => {
    expect(describeEvent({ kind: "quote_approved", message: "" }).text).toBe("Quote approved");
    expect(describeEvent({ kind: "state", message: "", data: { to: "completed" } }).text).toBe("Job closed");
  });
  it("shortens names", () => {
    expect(firstName("thandi mokoena (Cleaner)")).toBe("Thandi");
    expect(firstName(null)).toBe("Someone");
  });
});
