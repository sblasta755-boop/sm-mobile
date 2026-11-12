// Order verification on the phone: which answers a step needs, and what gets sent. Pure, so it is tested.
// The server re-checks everything (backend app/services/verification.py); this decides when Next is allowed.

export type VerificationStepType = "photo" | "text" | "note" | "scan" | "reference" | "confirm";

export interface VerificationStep {
  id: string;
  type: VerificationStepType;
  label: string;
  helpText: string;
  required: boolean;
  config: Record<string, unknown>;
}

export interface VerificationAnswerDraft {
  value?: string | boolean;
  filePaths?: string[];
  scan?: { value: string; name?: string };
  capturedAt?: string;
}

export type AnswerMap = Record<string, VerificationAnswerDraft | undefined>;

export const photoLimits = (step: VerificationStep): { min: number; max: number } => {
  const max = Math.max(1, Number(step.config.max ?? 1));
  const min = step.required ? Math.min(max, Math.max(0, Number(step.config.min ?? 1))) : 0;
  return { min, max };
};

/** Whether a step has what it needs before the person may move on. */
export function stepComplete(step: VerificationStep, answer: VerificationAnswerDraft | undefined): boolean {
  switch (step.type) {
    case "photo":
      return (answer?.filePaths?.length ?? 0) >= photoLimits(step).min;
    case "confirm":
      return !step.required || answer?.value === true;
    case "scan":
      return !step.required || !!answer?.scan?.value;
    default: {
      const text = typeof answer?.value === "string" ? answer.value.trim() : "";
      return !step.required || text.length > 0;
    }
  }
}

/** Index of the first step that is not complete, or -1 when the run is ready to send. */
export function firstIncomplete(steps: VerificationStep[], answers: AnswerMap): number {
  return steps.findIndex((step) => !stepComplete(step, answers[step.id]));
}

export function progressPercent(steps: VerificationStep[], answers: AnswerMap): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => stepComplete(step, answers[step.id])).length;
  return Math.round((done / steps.length) * 100);
}

/** The text of the order-number step as entered, if the workflow has one. */
export function referenceOf(steps: VerificationStep[], answers: AnswerMap): string | null {
  const step = steps.find((s) => s.type === "reference");
  const value = step ? answers[step.id]?.value : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The answers to send: only steps that were answered, with blanks dropped. */
export function buildAnswers(steps: VerificationStep[], answers: AnswerMap) {
  const out: {
    stepId: string;
    value?: string | boolean;
    filePaths?: string[];
    scan?: { value: string; name?: string };
    capturedAt?: string;
  }[] = [];
  for (const step of steps) {
    const answer = answers[step.id];
    if (!answer) continue;
    const base = { stepId: step.id, ...(answer.capturedAt ? { capturedAt: answer.capturedAt } : {}) };
    if (step.type === "photo") {
      if (answer.filePaths?.length) out.push({ ...base, filePaths: answer.filePaths });
    } else if (step.type === "scan") {
      if (answer.scan?.value) out.push({ ...base, scan: answer.scan });
    } else if (step.type === "confirm") {
      out.push({ ...base, value: answer.value === true });
    } else if (typeof answer.value === "string" && answer.value.trim()) {
      out.push({ ...base, value: answer.value.trim() });
    }
  }
  return out;
}

/** A scanned code can be a bare number or a web address that ends in it; keep what a person would type. */
export function referenceFromScan(raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    const last = value.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  }
  return value;
}

export const newIdempotencyKey = (): string =>
  `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
