// The "My verified orders" list on the phone: which days a preset covers, and one line describing an answer.
// Dates are the phone's local calendar days, like the web app.

import type { VerificationRunAnswer } from "../api/client";

export type OrdersRange = "today" | "week" | "month";

export const ORDERS_RANGES: { key: OrdersRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "month", label: "30 days" },
];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** [start, end] day keys, inclusive, ending today. */
export function ordersRange(range: OrdersRange, now: Date = new Date()): [string, string] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = range === "today" ? 0 : range === "week" ? 6 : 29;
  const start = new Date(end);
  start.setDate(end.getDate() - back);
  return [dayKey(start), dayKey(end)];
}

export function answerLine(answer: VerificationRunAnswer): string {
  if (answer.signoff) return answer.signoff.name ?? "Signed";
  if (answer.filePaths) return `${answer.filePaths.length} photo${answer.filePaths.length === 1 ? "" : "s"}`;
  if (answer.scan) return answer.scan.name ?? answer.scan.value;
  if (typeof answer.value === "boolean") return answer.value ? "Yes" : "No";
  return answer.value ?? "";
}
