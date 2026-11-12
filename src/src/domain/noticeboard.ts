// Noticeboard rules the screens share. Mirrors the web app (smart-property-operations/src/src/lib/smartclean/noticeboard.ts): keep the two the same.
import type { Notice, NoticeAudience, NoticeCategory, NoticeInput, NoticeReminder } from "@/api/client";

export type CategoryMeta = { key: NoticeCategory; label: string; icon: string; color: string };

export const NOTICE_CATEGORIES: readonly CategoryMeta[] = [
  { key: "general", label: "General", icon: "megaphone-outline", color: "#18b6c4" },
  { key: "meeting", label: "Meeting", icon: "people-outline", color: "#7c8cff" },
  { key: "safety", label: "Safety", icon: "shield-outline", color: "#ef5b5b" },
  { key: "schedule_change", label: "Schedule change", icon: "repeat-outline", color: "#f5a623" },
  { key: "policy", label: "Policy", icon: "book-outline", color: "#b58cff" },
  { key: "celebration", label: "Celebration", icon: "sparkles-outline", color: "#ff7ab6" },
];

export const categoryMeta = (key: string): CategoryMeta =>
  NOTICE_CATEGORIES.find((c) => c.key === key) ?? NOTICE_CATEGORIES[0];

export const REMINDER_OPTIONS: readonly { key: NoticeReminder; label: string }[] = [
  { key: "1d", label: "A day before" },
  { key: "1h", label: "An hour before" },
  { key: "morning", label: "On the morning" },
];

/** Monday first, matching the server (Monday is 0). */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
/** 0 = Monday ... 6 = Sunday for a YYYY-MM-DD day. */
export const weekdayOf = (iso: string) => (parseDay(iso).getDay() + 6) % 7;

export const dayHeading = (iso: string, now = new Date()) => {
  const today = dayKey(now);
  if (iso === today) return "Today";
  if (iso === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)))
    return "Tomorrow";
  return parseDay(iso).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

export const emptyAudience = (): NoticeAudience => ({
  all: false,
  siteIds: [],
  roles: [],
  userIds: [],
});

export const emptyNotice = (date?: string | null): NoticeInput => ({
  title: "",
  body: "",
  category: date ? "meeting" : "general",
  audience: emptyAudience(),
  startDate: date ?? null,
  endDate: null,
  startTime: null,
  endTime: null,
  recurrence: null,
  pinned: false,
  requiresAck: false,
  alsoEmail: false,
  reminders: date ? ["morning"] : [],
  attachments: [],
});

export const toInput = (n: Notice): NoticeInput => ({
  title: n.title,
  body: n.body,
  category: n.category,
  audience: n.audience,
  startDate: n.startDate,
  endDate: n.endDate,
  startTime: n.startTime,
  endTime: n.endTime,
  recurrence: n.recurrence,
  pinned: n.pinned,
  requiresAck: n.requiresAck,
  alsoEmail: n.alsoEmail,
  reminders: n.reminders,
  attachments: n.attachments,
});

type Person = { id: string; role: string; siteIds: string[]; status?: string };

/** The people an audience reaches, worked out the way the server does. Sites and roles together narrow each other. */
export function audienceCount(
  audience: NoticeAudience,
  people: Person[],
  excludeId?: string,
): number {
  const active = people.filter((p) => !p.status || p.status === "Active");
  const out = new Set<string>(audience.userIds);
  if (audience.all) active.forEach((p) => out.add(p.id));
  else {
    const sites = new Set(audience.siteIds);
    const roles = new Set(audience.roles);
    for (const p of active) {
      const atSite = p.siteIds.some((s) => sites.has(s));
      const inRole = roles.has(p.role);
      if (
        sites.size && roles.size
          ? atSite && inRole
          : sites.size
            ? atSite
            : roles.size
              ? inRole
              : false
      )
        out.add(p.id);
    }
  }
  if (excludeId) out.delete(excludeId);
  return out.size;
}

export function audienceText(
  audience: NoticeAudience,
  siteName: (id: string) => string,
  roleName: (key: string) => string,
  personCount = audience.userIds.length,
): string {
  if (audience.all) return "Everyone";
  const parts: string[] = [];
  if (audience.siteIds.length) parts.push(audience.siteIds.map(siteName).join(", "));
  if (audience.roles.length) parts.push(audience.roles.map(roleName).join(", "));
  if (personCount) parts.push(`${personCount} named ${personCount === 1 ? "person" : "people"}`);
  return parts.join(" · ") || "Nobody chosen";
}

/** What stops this notice being posted, or null. The server checks again. */
export function noticeProblem(n: NoticeInput, today = dayKey(new Date())): string | null {
  if (!n.title.trim()) return "Give the notice a title";
  const a = n.audience;
  if (!(a.all || a.siteIds.length || a.roles.length || a.userIds.length))
    return "Choose who it is for";
  if (n.endDate && !n.startDate) return "Add a start date";
  if (n.startDate && n.endDate && n.endDate < n.startDate)
    return "The end date is before the start date";
  if (n.endTime && !n.startTime) return "Add a start time";
  if (n.startTime && n.endTime && n.endTime < n.startTime)
    return "The end time is before the start time";
  if (n.recurrence) {
    if (!n.recurrence.weekdays.length) return "Choose the days of the week to repeat on";
    if (!n.startDate) return "A repeating notice needs a start date";
    if (!n.recurrence.until || n.recurrence.until < n.startDate) return "Say when the repeat ends";
  }
  const last = n.recurrence?.until ?? n.endDate ?? n.startDate;
  if (last && last < today) return "That date has already passed";
  return null;
}

/** Group dated notices under the day they apply on (the agenda view); notices with no date go under "Always". */
export function agendaGroups(
  notices: Notice[],
): { key: string; heading: string; items: Notice[] }[] {
  const map = new Map<string, Notice[]>();
  for (const n of notices)
    map.set(n.nextDate ?? "always", [...(map.get(n.nextDate ?? "always") ?? []), n]);
  const keys = [...map.keys()].sort((a, b) =>
    a === "always" ? 1 : b === "always" ? -1 : a.localeCompare(b),
  );
  return keys.map((key) => ({
    key,
    heading: key === "always" ? "Always" : dayHeading(key),
    items: map.get(key)!,
  }));
}

export const unreadCount = (notices: Notice[]) => notices.filter((n) => !n.read).length;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const shortDay = (iso: string) => {
  const d = parseDay(iso);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

/** "Tue 8 Dec 08:00-09:00", "Every Tue, Thu", or "" - the same wording the server puts on a posted notice. */
export function whenTextOf(
  n: Pick<NoticeInput, "startDate" | "endDate" | "startTime" | "endTime" | "recurrence">,
): string {
  if (!n.startDate) return "";
  let text = shortDay(n.startDate);
  if (n.recurrence?.weekdays.length)
    text = `Every ${n.recurrence.weekdays.map((w) => WEEKDAYS[w]).join(", ")}`;
  else if (n.endDate) text += ` to ${shortDay(n.endDate)}`;
  if (n.startTime) text += ` ${n.startTime}${n.endTime ? `-${n.endTime}` : ""}`;
  return text;
}
