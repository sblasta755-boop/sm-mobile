import { useEffect, useMemo, useState } from "react";
import { getClosedDays, type ClosedDays } from "@/api/client";
import { useSmartClean } from "@/features/store";

const SLICE_DAYS = 90;

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * The days sites are shut between two dates (YYYY-MM-DD), from the server so public holidays are counted once,
 * the same way the background jobs count them. `forSite(siteId, day)` says why one site is shut, or null when it is
 * open; `allShut(siteIds, day)` is for views that mix sites: shut only when every one of them is.
 */
export function useClosedDays(start: string | undefined, end: string | undefined, siteId?: string) {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [days, setDays] = useState<ClosedDays>({});
  // Refetch when a site's calendar changes, not only when the range moves.
  const calendarKey = useMemo(
    () => JSON.stringify(state.sites.map((s) => [s.id, s.operatingDays, s.closedOnPublicHolidays, s.closures])),
    [state.sites],
  );

  useEffect(() => {
    if (!token || !start || !end || end < start) {
      setDays({});
      return;
    }
    let live = true;
    (async () => {
      const merged: ClosedDays = {};
      for (let from = parse(start); iso(from) <= end; from.setDate(from.getDate() + SLICE_DAYS + 1)) {
        const to = new Date(from);
        to.setDate(to.getDate() + SLICE_DAYS);
        const slice = await getClosedDays(token, iso(from), iso(to) < end ? iso(to) : end, siteId);
        for (const [id, byDay] of Object.entries(slice.days)) merged[id] = { ...merged[id], ...byDay };
      }
      if (live) setDays(merged);
    })().catch(() => live && setDays({}));
    return () => {
      live = false;
    };
  }, [token, start, end, siteId, calendarKey]);

  return useMemo(
    () => ({
      forSite: (id: string, day: string): string | null => days[id]?.[day]?.reason ?? null,
      allShut: (ids: string[], day: string): string | null => {
        if (ids.length === 0) return null;
        const reasons = ids.map((id) => days[id]?.[day]?.reason ?? null);
        return reasons.every(Boolean) ? (reasons[0] as string) : null;
      },
    }),
    [days],
  );
}
