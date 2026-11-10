import { useDeferredValue, useMemo } from "react";

/**
 * Forgiving text search for every search box: accents and punctuation do not matter, word order does not matter,
 * and a small typo still finds the row. Results are ranked best first (exact, then prefix, word-part, in-order
 * letters, then typos). Kept in step with the web app's lib/smartclean/fuzzySearch.ts - change both together.
 *
 * Cheap on purpose: a row is turned into words once, a query word is compared with tiers that stop at the first
 * hit, and the typo tier is a bounded edit distance that gives up early and only runs for words of 4+ letters.
 */

const EXTRA: Record<string, string> = { ł: "l", đ: "d", ø: "o", ß: "ss", æ: "ae", œ: "oe", ð: "d", þ: "th" };

/** Lower case, accents removed, anything that is not a letter or digit turned into a space. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[łđøßæœðþ]/g, (c) => EXTRA[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const words = (text: string): string[] => {
  const n = normalise(text);
  return n === "" ? [] : n.split(" ");
};

/** How many typos a query word of this length may have. Short words stay strict so results do not turn to noise. */
const typoBudget = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2);

/** Edit distance (insert, delete, change, swap two neighbours) between a and b, or max + 1 once it exceeds `max`. */
function boundedDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

const inOrder = (needle: string, hay: string): boolean => {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
  return i === needle.length;
};

/** The best (lowest) score of one query word against a row's words, or null when nothing is close enough. */
function wordScore(q: string, rowWords: string[]): number | null {
  let best: number | null = null;
  const budget = typoBudget(q.length);
  for (const w of rowWords) {
    let s: number | null = null;
    if (w === q) s = 0;
    else if (w.startsWith(q)) s = 1;
    else if (q.length >= 2 && w.includes(q)) s = 3;
    else if (q.length >= 4 && inOrder(q, w) && q.length * 2 >= w.length) s = 5;
    else if (budget > 0 && (w[0] === q[0] || w[1] === q[1] || w[0] === q[1] || w[1] === q[0])) {
      // Only words that start alike are worth the edit-distance work; typos rarely hit the first two letters.
      const d = Math.min(boundedDistance(q, w, budget), boundedDistance(q, w.slice(0, q.length), budget));
      if (d <= budget) s = 6 + d * 2;
    }
    if (s !== null && (best === null || s < best)) best = s;
    if (best === 0) break;
  }
  return best;
}

/** Score for a row (lower is better) given its words, or null when any query word finds no match. */
export function scoreWords(queryWords: string[], rowWords: string[]): number | null {
  let total = 0;
  for (const q of queryWords) {
    const s = wordScore(q, rowWords);
    if (s === null) return null;
    total += s;
  }
  return total;
}

/** Score of one row's fields for a query. 0 for an empty query, null for no match. */
export function fuzzyScore(query: string, fields: (string | null | undefined)[]): number | null {
  const q = words(query);
  if (q.length === 0) return 0;
  return scoreWords(q, words(fields.filter(Boolean).join(" ")));
}

function rank<T>(items: T[], index: string[][], query: string, limit?: number): T[] {
  const q = words(query);
  if (q.length === 0) return items;
  const hits: { item: T; score: number; order: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const score = scoreWords(q, index[i]);
    if (score !== null) hits.push({ item: items[i], score, order: i });
  }
  hits.sort((a, b) => a.score - b.score || a.order - b.order);
  const out = hits.map((h) => h.item);
  return limit ? out.slice(0, limit) : out;
}

/** Items matching the query, best first. An empty query returns the items untouched, in their own order. */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
  limit?: number,
): T[] {
  if (words(query).length === 0) return items;
  return rank(items, items.map((item) => words(getFields(item).filter(Boolean).join(" "))), query, limit);
}

/**
 * The hook version for screens: each row is turned into words once per list (not per keystroke), and typing is
 * deferred so a long list never holds up the text box. `getFields` is read when the list changes.
 */
export function useFuzzyFilter<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[],
  limit?: number,
): T[] {
  const deferred = useDeferredValue(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => items.map((item) => words(getFields(item).filter(Boolean).join(" "))), [items]);
  return useMemo(() => rank(items, index, deferred, limit), [items, index, deferred, limit]);
}
