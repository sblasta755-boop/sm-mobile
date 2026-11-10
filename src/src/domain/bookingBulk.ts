/**
 * Booking several people at once, and changing the ones already booked at the same time. Plain functions so the rules
 * are tested: who is new, who is already booked, what to send, and what the button should say.
 */

export type BookedPair = { userId: string; date: string };

/**
 * Of the people chosen and the days chosen, which person-days are new bookings and which already exist.
 * `people` are the ids chosen; `existing` is who is already booked at the site on those days.
 */
export function splitChosen(people: string[], dates: string[], existing: BookedPair[]) {
  const has = new Set(existing.map((b) => `${b.userId}|${b.date}`));
  let toBook = 0;
  let toChange = 0;
  const bookedPeople = new Set<string>();
  const newPeople = new Set<string>();
  for (const id of people) {
    for (const day of dates) {
      if (has.has(`${id}|${day}`)) {
        toChange += 1;
        bookedPeople.add(id);
      } else {
        toBook += 1;
        newPeople.add(id);
      }
    }
  }
  return { toBook, toChange, bookedPeople: [...bookedPeople], newPeople: [...newPeople] };
}

export type HoursLike = { custom: boolean; shiftIds: string[]; startTime: string; endTime: string };

/** Whether any hours have been chosen. An untouched picker means "leave the hours as they are". */
export function hoursChosen(hours: HoursLike): boolean {
  return hours.custom ? hours.startTime.trim() !== "" : hours.shiftIds.length > 0;
}

/**
 * What a change sends: only what the person set. Hours they did not choose and instructions they left empty
 * stay as each booking has them, so a change of notes never wipes the shifts.
 */
export function changePatch(
  hours: HoursLike,
  instructions: string,
  payload: { shiftIds: string[]; startTime: string | null; endTime: string | null },
) {
  return {
    ...(hoursChosen(hours)
      ? { shiftIds: payload.shiftIds, startTime: payload.startTime, endTime: payload.endTime }
      : {}),
    ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
  };
}

export type BookAction = "none" | "book" | "change" | "both";

/** What pressing the main button will do, given the people chosen. */
export function actionFor(c: { toBook: number; toChange: number }, canChange: boolean): BookAction {
  const change = c.toChange > 0 && canChange;
  if (c.toBook > 0 && change) return "both";
  if (c.toBook > 0) return "book";
  if (change) return "change";
  return "none";
}

export function buttonLabel(action: BookAction): string {
  return action === "both"
    ? "Book and update"
    : action === "change"
      ? "Update bookings"
      : "Book and notify";
}

/** The one line under the list: how many of each, and what is missing for a change. */
export function summaryLine(
  people: number,
  days: number,
  c: { toBook: number; toChange: number },
  canChange: boolean,
): string {
  const base = `${people} ${people === 1 ? "person" : "people"} × ${days} ${days === 1 ? "day" : "days"}`;
  if (people === 0 || days === 0) return base;
  const parts = [
    c.toBook > 0 ? `${c.toBook} to book` : null,
    c.toChange > 0 ? `${c.toChange} already booked${canChange ? " (will be updated)" : ""}` : null,
  ].filter(Boolean);
  return parts.length ? `${base} · ${parts.join(" · ")}` : base;
}
