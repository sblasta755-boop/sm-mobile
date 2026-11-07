/**
 * Pure helpers for the operators' feedback inbox. Mirrors the web console's lib/smartclean/feedbackInbox.ts so
 * the two read the same.
 */

export type FeedbackCategory = "bug" | "idea" | "question" | "other";

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; plural: string }[] = [
  { value: "bug", label: "Problem", plural: "Problems" },
  { value: "idea", label: "Idea", plural: "Ideas" },
  { value: "question", label: "Question", plural: "Questions" },
  { value: "other", label: "Other", plural: "Other" },
];

export const categoryLabel = (value: FeedbackCategory) =>
  FEEDBACK_CATEGORIES.find((c) => c.value === value)?.label ?? "Other";

/** "Thandi Mokoena" -> "TM". One word -> its first two letters. Never empty. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The message flattened to one line and cut for a list row. */
export function preview(message: string, max = 140): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** A reply that opens in the operator's mail app, subject and greeting filled in. Null when the sender has no email. */
export function replyLink(item: { senderEmail: string | null; senderName: string; message: string }): string | null {
  if (!item.senderEmail) return null;
  const subject = `Re: your Šoma360 feedback - ${preview(item.message, 50)}`;
  const body = `Hi ${item.senderName.split(/\s+/)[0] || "there"},\n\n\n\n--\nIn reply to:\n${preview(item.message, 300)}`;
  return `mailto:${encodeURIComponent(item.senderEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The id one step before or after `currentId`; null at either end. With nothing selected, the first or last. */
export function neighbour(ids: readonly string[], currentId: string | null, step: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const at = currentId ? ids.indexOf(currentId) : -1;
  if (at === -1) return step === 1 ? ids[0] : ids[ids.length - 1];
  const next = at + step;
  return next >= 0 && next < ids.length ? ids[next] : null;
}
