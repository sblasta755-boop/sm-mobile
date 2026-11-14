// Order verification on the phone: which answers a step needs, and what gets sent. Pure, so it is tested.
// The server re-checks everything (backend app/services/verification.py); this decides when Next is allowed.

import {
  type SignoffMode,
  type Stroke,
  signaturePayload,
  signoffProblems,
  wantsName,
} from "./signoff";

export type VerificationStepType = "photo" | "text" | "note" | "scan" | "reference" | "confirm" | "signoff";

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
  /** The typed name and the strokes drawn so far, in the drawing area's own pixels. */
  signoff?: { name: string; strokes: Stroke[]; width: number; height: number };
  capturedAt?: string;
}

export const signoffMode = (step: VerificationStep): SignoffMode => {
  const mode = step.config.mode;
  return mode === "name" || mode === "signature" ? mode : "name_and_signature";
};

/** What is still missing from a sign-off step, in plain words. `accountName` is the signed-in person's name; when
 * it is not known the "must match" rule is left to the server. */
export function signoffStepProblems(
  step: VerificationStep,
  answer: VerificationAnswerDraft | undefined,
  accountName = "",
): string[] {
  const given = answer?.signoff;
  if (!step.required && !given?.name?.trim() && !(given?.strokes?.length ?? 0)) return [];
  return signoffProblems({
    mode: signoffMode(step),
    requireNameMatch: step.config.requireNameMatch !== false && accountName !== "",
    accountName,
    typedName: given?.name ?? "",
    strokes: given?.strokes ?? [],
  });
}

export type AnswerMap = Record<string, VerificationAnswerDraft | undefined>;

export const photoLimits = (step: VerificationStep): { min: number; max: number } => {
  const max = Math.max(1, Number(step.config.max ?? 1));
  const min = step.required ? Math.min(max, Math.max(0, Number(step.config.min ?? 1))) : 0;
  return { min, max };
};

/** Whether a step has what it needs before the person may move on. */
export function stepComplete(
  step: VerificationStep,
  answer: VerificationAnswerDraft | undefined,
  accountName = "",
): boolean {
  switch (step.type) {
    case "signoff":
      return signoffStepProblems(step, answer, accountName).length === 0;
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
export function firstIncomplete(steps: VerificationStep[], answers: AnswerMap, accountName = ""): number {
  return steps.findIndex((step) => !stepComplete(step, answers[step.id], accountName));
}

export function progressPercent(steps: VerificationStep[], answers: AnswerMap, accountName = ""): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => stepComplete(step, answers[step.id], accountName)).length;
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
    signoff?: { name?: string; signature?: { strokes: number[][][]; width: number; height: number } };
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
    } else if (step.type === "signoff") {
      const given = answer.signoff;
      if (given && (given.name.trim() || given.strokes.length > 0)) {
        out.push({
          ...base,
          signoff: {
            ...(wantsName(signoffMode(step)) ? { name: given.name.trim() } : {}),
            ...(given.strokes.length > 0
              ? { signature: signaturePayload(given.strokes, given.width, given.height) }
              : {}),
          },
        });
      }
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

/** Short chips that say what a workflow involves, in the order a person meets them. */
export function workflowOutline(steps: VerificationStep[]): string[] {
  const photos = steps
    .filter((s) => s.type === "photo")
    .reduce((n, s) => n + Math.max(1, Number(s.config.min ?? 1)), 0);
  const chips: string[] = [];
  if (photos > 0) chips.push(`${photos} photo${photos === 1 ? "" : "s"}`);
  if (steps.some((s) => s.type === "scan" && s.config.scanKind === "staff_qr")) chips.push("Staff QR");
  else if (steps.some((s) => s.type === "scan")) chips.push("Scan");
  if (steps.some((s) => s.type === "confirm")) chips.push("Checks");
  if (steps.some((s) => s.type === "text" || s.type === "note")) chips.push("Notes");
  if (steps.some((s) => s.type === "signoff")) chips.push("Sign-off");
  if (steps.some((s) => s.type === "reference")) chips.push("Order number");
  return chips;
}

/** "Today, 22:58", "Yesterday, 09:10", or "12 Nov, 22:58" (with the year when it is not this one). */
export function friendlyWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${month}${year}, ${time}`;
}
