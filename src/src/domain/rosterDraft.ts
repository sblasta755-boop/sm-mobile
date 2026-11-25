/**
 * The roster's draft: the changes a manager has marked for the week but not sent yet. Nothing in it reaches
 * anyone until it is sent, and then each person gets one notification and one email covering their own changes.
 *
 * Plain functions with no UI in them, so the rules are easy to test. The draft is keyed by person and day, so
 * marking the same cell twice replaces the first mark, and it survives moving between weeks.
 */

export type DraftHours = {
  shiftIds: string[];
  startTime: string | null;
  endTime: string | null;
};

type Who = { userId: string; userName: string; date: string };

export type DraftEntry =
  /** A new booking. */
  | (Who & { kind: "add"; hours: DraftHours; instructions: string; label: string })
  /** New hours or instructions for a booking that already exists. */
  | (Who & {
      kind: "update";
      bookingId: string;
      hours: DraftHours;
      instructions: string;
      label: string;
    })
  /** An existing booking that is to be cancelled. */
  | (Who & { kind: "cancel"; bookingId: string; label: string });

export type Draft = Record<string, DraftEntry>;

export type BatchEntry = {
  action: "add" | "update" | "cancel";
  bookingId?: string;
  userId: string;
  date?: string;
  shiftIds: string[];
  startTime: string | null;
  endTime: string | null;
  instructions: string;
};

export const draftKey = (userId: string, date: string) => `${userId}|${date}`;

/** Marks a cell, or clears the mark when `entry` is null. Returns a new draft. */
export function stage(draft: Draft, userId: string, date: string, entry: DraftEntry | null): Draft {
  const next = { ...draft };
  const key = draftKey(userId, date);
  if (entry) next[key] = entry;
  else delete next[key];
  return next;
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** True when the hours and instructions are exactly what the booking already has, so marking it would change nothing. */
export function sameAsBooking(
  booking: {
    shiftIds: string[];
    startTime: string | null;
    endTime: string | null;
    instructions: string;
  },
  hours: DraftHours,
  instructions: string,
): boolean {
  return (
    sameList(booking.shiftIds, hours.shiftIds) &&
    (booking.startTime ?? null) === (hours.startTime || null) &&
    (booking.endTime ?? null) === (hours.endTime || null) &&
    booking.instructions.trim() === instructions.trim()
  );
}

/** What a set of hours is called in a cell: the shift names, else the times, else "All day". */
export function hoursLabel(hours: DraftHours, shiftNames: Record<string, string>): string {
  const names = hours.shiftIds.map((id) => shiftNames[id]).filter(Boolean);
  if (names.length > 0) return names.join(" + ");
  if (hours.startTime && hours.endTime) return `${hours.startTime}-${hours.endTime}`;
  if (hours.startTime) return `from ${hours.startTime}`;
  return "All day";
}

export type DraftSummary = {
  added: number;
  changed: number;
  removed: number;
  people: number;
  total: number;
};

export function summarise(draft: Draft): DraftSummary {
  const entries = Object.values(draft);
  const count = (kind: DraftEntry["kind"]) => entries.filter((e) => e.kind === kind).length;
  return {
    added: count("add"),
    changed: count("update"),
    removed: count("cancel"),
    people: new Set(entries.map((e) => e.userId)).size,
    total: entries.length,
  };
}

/** "3 added, 2 changed, 1 removed", leaving out what is zero. */
export function summaryText(s: DraftSummary): string {
  return [
    s.added > 0 ? `${s.added} added` : "",
    s.changed > 0 ? `${s.changed} changed` : "",
    s.removed > 0 ? `${s.removed} removed` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** The request body entries, in day order so the send is predictable. */
export function toBatchEntries(draft: Draft): BatchEntry[] {
  return Object.values(draft)
    .sort((a, b) => a.date.localeCompare(b.date) || a.userName.localeCompare(b.userName))
    .map((e) => {
      if (e.kind === "cancel") {
        return {
          action: "cancel" as const,
          bookingId: e.bookingId,
          userId: e.userId,
          shiftIds: [],
          startTime: null,
          endTime: null,
          instructions: "",
        };
      }
      return {
        action: e.kind,
        ...(e.kind === "update" ? { bookingId: e.bookingId } : {}),
        userId: e.userId,
        date: e.date,
        shiftIds: e.hours.shiftIds,
        startTime: e.hours.startTime,
        endTime: e.hours.endTime,
        instructions: e.instructions,
      };
    });
}

/** After a send: what was applied is gone from the draft, and what the server skipped stays so it can be fixed. */
export function keepSkipped(draft: Draft, skipped: { userId: string; date: string }[]): Draft {
  const keep = new Set(skipped.map((s) => draftKey(s.userId, s.date)));
  return Object.fromEntries(Object.entries(draft).filter(([key]) => keep.has(key)));
}

/** Every site's draft, by site id. The roster, list and calendar all add to the same one. */
export type Drafts = Record<string, Draft>;

/** Marks (or, with null, clears) one person's day at one site. Returns a new Drafts. */
export function stageIn(
  drafts: Drafts,
  siteId: string,
  userId: string,
  date: string,
  entry: DraftEntry | null,
): Drafts {
  const next = { ...drafts, [siteId]: stage(drafts[siteId] ?? {}, userId, date, entry) };
  if (Object.keys(next[siteId]).length === 0) delete next[siteId];
  return next;
}

/** The counts across every site. People are counted once per site, since each site sends its own message. */
export function summariseAll(drafts: Drafts): DraftSummary {
  const parts = Object.values(drafts).map(summarise);
  return parts.reduce(
    (a, p) => ({
      added: a.added + p.added,
      changed: a.changed + p.changed,
      removed: a.removed + p.removed,
      people: a.people + p.people,
      total: a.total + p.total,
    }),
    { added: 0, changed: 0, removed: 0, people: 0, total: 0 },
  );
}

/** A marked entry in one line, for the review list: "Ann, 2026-11-26: Day (new)". */
export function describeEntry(entry: DraftEntry): string {
  const what =
    entry.kind === "cancel"
      ? `remove ${entry.label}`
      : `${entry.label} (${entry.kind === "add" ? "new" : "changed"})`;
  return `${entry.userName}, ${entry.date}: ${what}`;
}

/** The entries of every site, in day order, with the site each belongs to. */
export function entriesOf(drafts: Drafts): { siteId: string; entry: DraftEntry }[] {
  return Object.entries(drafts)
    .flatMap(([siteId, draft]) => Object.values(draft).map((entry) => ({ siteId, entry })))
    .sort(
      (a, b) =>
        a.entry.date.localeCompare(b.entry.date) ||
        a.entry.userName.localeCompare(b.entry.userName),
    );
}

/** Stages a booking's change: the same hours and instructions as before except what the patch says. */
export function updateEntry(
  booking: {
    id: string;
    shiftIds: string[];
    startTime: string | null;
    endTime: string | null;
    instructions: string;
    userId: string;
    userName: string;
    date: string;
  },
  patch: { hours?: DraftHours; instructions?: string },
  label: string,
): DraftEntry | null {
  const hours = patch.hours ?? {
    shiftIds: booking.shiftIds,
    startTime: booking.startTime,
    endTime: booking.endTime,
  };
  const instructions = patch.instructions ?? booking.instructions;
  if (sameAsBooking(booking, hours, instructions)) return null;
  return {
    kind: "update",
    bookingId: booking.id,
    userId: booking.userId,
    userName: booking.userName,
    date: booking.date,
    hours,
    instructions,
    label,
  };
}
