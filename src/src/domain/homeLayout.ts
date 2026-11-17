/**
 * Customisable home for managers (phone). The card catalogue, today's screen as the built-in default, and the pure
 * rules for reading, arranging and syncing a layout. No React, no network.
 *
 * Today's screen IS the default. A person with no saved layout, a layout this build cannot read, or one with
 * nothing visible gets exactly the screen that existed before customising. A layout only orders and hides cards;
 * what a person may see (module, role, site) is still decided by each card and by the server.
 *
 * Mirrors the web console's lib/smartclean/homeLayout.ts and the backend's app/services/home_layout.py. The card ids
 * are the contract between them: keep the three in step.
 */

export const LAYOUT_VERSION = 1;

export interface StoredCard {
  id: string;
  visible: boolean;
}

export interface StoredLayout {
  version: 1;
  classic: { cards: StoredCard[] };
}

export interface ResolvedCard {
  id: string;
  visible: boolean;
}

export interface CardDef {
  id: string;
  label: string;
  hint: string;
}

/** The roles that have a customisable home. Supervisors and field roles are unchanged. */
export const CUSTOMISABLE_ROLES = ["org_admin", "operations_manager", "site_manager"] as const;
export const canCustomiseHome = (role: string | null | undefined): boolean =>
  CUSTOMISABLE_ROLES.includes(role as (typeof CUSTOMISABLE_ROLES)[number]);

/** The phone Overview in today's order (app/(manage)/manage-home.tsx before customising). */
export const PHONE_CARDS: CardDef[] = [
  { id: "clock", label: "Clock in", hint: "Site managers who clock in" },
  { id: "summary", label: "Tasks, People, Issues", hint: "The big summary card" },
  { id: "on_shift", label: "On shift now", hint: "Who is clocked in" },
  { id: "open_incidents", label: "Open incidents", hint: "With corrective actions" },
  { id: "shortcuts", label: "Shortcuts", hint: "Report, Schedule, Pay runs" },
  { id: "overdue_tasks", label: "Overdue tasks", hint: "The three latest" },
  { id: "sites", label: "Your sites", hint: "Floor plans" },
  { id: "add_member", label: "Add a team member", hint: "Create an account with a QR code" },
];

export const cardLabel = (id: string) => PHONE_CARDS.find((c) => c.id === id)?.label ?? id;

export const defaultCards = (): ResolvedCard[] => PHONE_CARDS.map((c) => ({ id: c.id, visible: true }));

/**
 * The cards to draw for a stored layout. Never throws: anything unreadable is today's screen. Unknown cards are
 * skipped, repeats ignored, and a card the stored layout predates is appended (visible) so a new card reaches
 * people who saved earlier.
 */
export function resolveLayout(stored: unknown): ResolvedCard[] {
  const fallback = defaultCards();
  if (!stored || typeof stored !== "object") return fallback;
  const raw = stored as { version?: unknown; classic?: { cards?: unknown } };
  const list = raw.classic?.cards;
  if (raw.version !== LAYOUT_VERSION || !Array.isArray(list)) return fallback;

  const seen = new Set<string>();
  const out: ResolvedCard[] = [];
  for (const item of list as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const card = item as { id?: unknown; visible?: unknown };
    const known = typeof card.id === "string" && PHONE_CARDS.some((c) => c.id === card.id);
    if (!known || seen.has(card.id as string)) continue;
    seen.add(card.id as string);
    out.push({ id: card.id as string, visible: card.visible !== false });
  }
  for (const def of PHONE_CARDS) if (!seen.has(def.id)) out.push({ id: def.id, visible: true });
  return out.some((c) => c.visible) ? out : fallback;
}

export function toStored(cards: ResolvedCard[]): StoredLayout {
  return { version: LAYOUT_VERSION, classic: { cards: cards.map((c) => ({ id: c.id, visible: c.visible })) } };
}

/** True when the cards are exactly today's screen, so there is nothing to save or reset. */
export function isDefaultLayout(cards: ResolvedCard[]): boolean {
  const base = defaultCards();
  return cards.length === base.length && cards.every((c, i) => c.id === base[i].id && c.visible);
}

export function moveCard(cards: ResolvedCard[], id: string, direction: -1 | 1): ResolvedCard[] {
  const from = cards.findIndex((c) => c.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= cards.length) return cards;
  const next = [...cards];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Show or hide a card. The last visible card cannot be hidden: an empty home helps nobody. */
export function setVisible(cards: ResolvedCard[], id: string, visible: boolean): ResolvedCard[] {
  const target = cards.find((c) => c.id === id);
  if (!target || target.visible === visible) return cards;
  if (!visible && cards.filter((c) => c.visible).length <= 1) return cards;
  return cards.map((c) => (c.id === id ? { ...c, visible } : c));
}

// ---- The device's copy, and when the server's replaces it ----

/** One saved layout as the server sends it. */
export interface ServerLayout {
  layout: unknown;
  rev: number;
  locked: boolean;
}

/** What this device keeps. `pending` = saved here, not yet confirmed by the server. */
export interface CachedLayout {
  layout: StoredLayout;
  rev: number;
  /** An administrator set it: the person cannot change it. */
  locked: boolean;
  pending: boolean;
}

/** Whether a stored value is a copy this build can use. Anything else counts as nothing saved. */
export function parseCached(raw: string | null | undefined): CachedLayout | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedLayout> | null;
    if (
      v &&
      typeof v === "object" &&
      typeof v.rev === "number" &&
      typeof v.locked === "boolean" &&
      typeof v.pending === "boolean" &&
      v.layout &&
      v.layout.version === LAYOUT_VERSION
    ) {
      return v as CachedLayout;
    }
  } catch {
    // fall through
  }
  return null;
}

export type Reconcile = { action: "keep" } | { action: "set"; entry: CachedLayout } | { action: "clear" };

/**
 * What to do with this device's copy given the server's (from /bootstrap). `serverLayouts` undefined = an older
 * backend, null = this role has no customisable home: either way, change nothing. A missing row for the phone
 * means it was reset on the server, so the copy is cleared. An unsynced edit of the person's own wins until it syncs.
 */
export function reconcile(
  cached: CachedLayout | null,
  serverLayouts: { phone?: ServerLayout | null } | null | undefined,
): Reconcile {
  if (!serverLayouts) return { action: "keep" };
  if (cached?.pending) return { action: "keep" };
  const row = serverLayouts.phone;
  if (!row) return cached ? { action: "clear" } : { action: "keep" };
  if (!cached || row.rev > cached.rev || row.locked !== cached.locked) {
    return { action: "set", entry: { layout: row.layout as StoredLayout, rev: row.rev, locked: row.locked, pending: false } };
  }
  return { action: "keep" };
}
