import { useEffect, useState } from "react";
import { getNoticeUnreadCount, listNoticeCalendar, type NoticeCalendarEntry } from "@/api/client";
import { useModules } from "@/features/modules";
import { useSmartClean } from "@/features/store";

/** The Noticeboard is switched on per organisation by the platform; everyone then reads what is addressed to them. */
export function useNoticeboardOn(): boolean {
  return useModules().has("noticeboard");
}

/** Managers and supervisors post; the server enforces whose sites, and who can post to everyone. */
export function useCanPostNotices(): boolean {
  const { currentUser } = useSmartClean();
  return !!currentUser && ["org_admin", "operations_manager", "site_manager", "supervisor"].includes(currentUser.role);
}

/** How many notices addressed to this person are unopened; refreshed while the screen is open. */
export function useNoticesUnread(enabled: boolean): number {
  const { state } = useSmartClean();
  const token = state.accessToken;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled || !token) {
      setCount(0);
      return;
    }
    let live = true;
    const load = () =>
      getNoticeUnreadCount(token)
        .then((r) => live && setCount(r.count))
        .catch(() => live && setCount(0));
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, token]);
  return count;
}

/** The dated notices this person can see between two days, by day. Empty when the Noticeboard is off. */
export function useNoticeCalendar(start: string, end: string): Map<string, NoticeCalendarEntry[]> {
  const { state } = useSmartClean();
  const on = useNoticeboardOn();
  const token = state.accessToken;
  const [entries, setEntries] = useState<NoticeCalendarEntry[]>([]);
  useEffect(() => {
    if (!on || !token) {
      setEntries([]);
      return;
    }
    let live = true;
    listNoticeCalendar(token, start, end)
      .then((rows) => live && setEntries(rows))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [on, token, start, end]);
  const byDay = new Map<string, NoticeCalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return byDay;
}
