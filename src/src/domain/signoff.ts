// How a person signs when they submit a task. The organisation chooses
// (name only, name and signature, or signature only) and whether the typed
// name has to match their account. Mirrors the server's app/services/
// signoff.py, which enforces the same rules - this just says so up front.

export type SignoffMode = "name" | "name_and_signature" | "signature";

export interface Stroke {
  /** [x, y] points in the drawing area's own pixels. */
  points: [number, number][];
}

const MIN_POINTS = 8;

export const normalizeName = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const wantsName = (mode: SignoffMode) => mode === "name" || mode === "name_and_signature";
export const wantsSignature = (mode: SignoffMode) => mode === "signature" || mode === "name_and_signature";

export function pointCount(strokes: Stroke[]): number {
  return strokes.reduce((n, s) => n + s.points.length, 0);
}

/** What is still missing, in plain words; empty means the person can submit. */
export function signoffProblems(args: {
  mode: SignoffMode;
  requireNameMatch: boolean;
  accountName: string;
  typedName: string;
  strokes: Stroke[];
}): string[] {
  const problems: string[] = [];
  if (wantsName(args.mode)) {
    if (!args.typedName.trim()) problems.push("Type your name");
    else if (args.requireNameMatch && normalizeName(args.typedName) !== normalizeName(args.accountName)) {
      problems.push("The name must match your account name");
    }
  }
  if (wantsSignature(args.mode) && pointCount(args.strokes) < MIN_POINTS) problems.push("Draw your signature");
  return problems;
}

/** The strokes in the shape the server expects. */
export function signaturePayload(strokes: Stroke[], width: number, height: number) {
  return { strokes: strokes.map((s) => s.points.map(([x, y]) => [x, y])), width, height };
}

/** SVG path data for drawing the strokes. */
export function strokesToPath(strokes: Stroke[]): string {
  return strokes
    .filter((s) => s.points.length > 1)
    .map((s) => "M" + s.points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L"))
    .join(" ");
}
