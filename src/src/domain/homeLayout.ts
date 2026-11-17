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

export type Home = "classic" | "custom";
export type Density = "comfortable" | "compact";
export type CardStyle = "filled" | "outlined";
export type Period = "7" | "30" | "90";
export type CardSize = "s" | "m" | "l";

export interface StoredCustomCard {
  id: string;
  visible: boolean;
  size?: CardSize;
  view?: string;
  period?: Period;
}

export interface Look {
  density: Density;
  cardStyle: CardStyle;
}

/**
 * What is stored and sent: which home the person opens on, today's screen arranged (`classic`) and the secondary
 * home (`custom`). A part that is just the default is left out, so "nothing saved" really is nothing.
 */
export interface StoredLayout {
  version: 1;
  active?: Home;
  classic?: { cards: StoredCard[] };
  custom?: { look?: Partial<Look>; cards: StoredCustomCard[] };
}

export interface ResolvedCard {
  id: string;
  visible: boolean;
}

export interface CardDef {
  id: string;
  label: string;
  hint: string;
  /**
   * Whether the card is on the home until someone chooses otherwise. Today's cards are; the operations cards added
   * since are not, so every existing home is exactly what it was until a person adds one.
   */
  defaultVisible?: boolean;
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
  // The operations cards: not about tasks, fed by /home/summary and /bootstrap (see features/useHomeSummary.ts).
  // Appended after today's cards and hidden until someone adds them.
  { id: "attendance_now", label: "Who is in", hint: "Booked, on site, late", defaultVisible: false },
  { id: "approvals", label: "Waiting for you", hint: "Overtime, leave, sign-ups, quotes", defaultVisible: false },
  { id: "site_pulse", label: "Site pulse", hint: "Each site at a glance", defaultVisible: false },
  { id: "maintenance", label: "Maintenance", hint: "Open jobs and what needs a decision", defaultVisible: false },
  { id: "stock_alerts", label: "Stock alerts", hint: "Out of stock and at reorder", defaultVisible: false },
  { id: "leave_today", label: "Away today", hint: "Approved leave today", defaultVisible: false },
  { id: "compliance_reviews", label: "Compliance reviews", hint: "Days waiting for sign-off", defaultVisible: false },
  { id: "noticeboard", label: "Noticeboard", hint: "Notices you have not read", defaultVisible: false },
  { id: "device_battery", label: "Phone batteries", hint: "Low or not reporting", defaultVisible: false },
];

export const cardLabel = (id: string) => PHONE_CARDS.find((c) => c.id === id)?.label ?? id;

export const defaultCards = (): ResolvedCard[] => PHONE_CARDS.map((c) => ({ id: c.id, visible: c.defaultVisible !== false }));

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
  // A card the saved layout predates comes in hidden, waiting in the cards list: a saved home never gains a card on its
  // own (and a locked one does not get a card its owner cannot hide).
  for (const def of PHONE_CARDS) if (!seen.has(def.id)) out.push({ id: def.id, visible: false });
  return out.some((c) => c.visible) ? out : fallback;
}

/** True when the cards are exactly today's screen, so there is nothing to save or reset. */
export function isDefaultLayout(cards: ResolvedCard[]): boolean {
  const base = defaultCards();
  return cards.length === base.length && cards.every((c, i) => c.id === base[i].id && c.visible === base[i].visible);
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

// ---- The secondary (Custom) home ----

export interface CustomCardDef {
  id: string;
  label: string;
  hint: string;
  /** The ways it can show its data, the first being the default. Only views the card can really draw. */
  views: { id: string; label: string }[];
  /** Whether it has a chart period (7, 30 or 90 days). */
  periods: boolean;
  defaultSize: CardSize;
  /** Shown from the start. The rest wait in the cards list to be added. */
  defaultVisible: boolean;
}

// The ids and views are the contract with the backend (home_layout.py CUSTOM_CARDS) and the web console.
export const CUSTOM_CARDS: CustomCardDef[] = [
  { id: "attendance_now", label: "Who is in", hint: "Booked, on site, late", views: [{ id: "roster", label: "Roster" }, { id: "number", label: "Number" }, { id: "bar", label: "Bars" }], periods: false, defaultSize: "l", defaultVisible: true },
  { id: "approvals", label: "Waiting for you", hint: "Overtime, leave, sign-ups, quotes", views: [{ id: "list", label: "List" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: true },
  { id: "attention", label: "Needs attention", hint: "What is overdue, and how late", views: [{ id: "card", label: "Card" }], periods: false, defaultSize: "s", defaultVisible: true },
  { id: "site_pulse", label: "Site pulse", hint: "Each site at a glance", views: [{ id: "list", label: "List" }, { id: "bar", label: "Bars" }], periods: false, defaultSize: "l", defaultVisible: true },
  { id: "maintenance", label: "Maintenance", hint: "Open jobs and what needs a decision", views: [{ id: "summary", label: "Summary" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: true },
  { id: "stock_alerts", label: "Stock alerts", hint: "Out of stock and at reorder", views: [{ id: "list", label: "List" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: true },
  { id: "incidents", label: "Open incidents", hint: "Incidents still open", views: [{ id: "number", label: "Number" }, { id: "bar", label: "Bar" }], periods: false, defaultSize: "s", defaultVisible: true },
  { id: "on_shift", label: "On shift now", hint: "Who is clocked in", views: [{ id: "number", label: "Number" }, { id: "list", label: "By site" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "completion", label: "Task completion", hint: "How much of the work is done", views: [{ id: "gauge", label: "Gauge" }, { id: "ring", label: "Ring" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "flow", label: "Operational flow", hint: "Tasks done per day", views: [{ id: "trend", label: "Trend" }, { id: "bar", label: "Bars" }, { id: "number", label: "Number" }], periods: true, defaultSize: "l", defaultVisible: false },
  { id: "activity_map", label: "Task activity", hint: "Busy and quiet days at a glance", views: [{ id: "heatmap", label: "Heat map" }], periods: true, defaultSize: "l", defaultVisible: false },
  { id: "quality", label: "Inspection quality", hint: "Pass rate and scores", views: [{ id: "ring", label: "Ring" }, { id: "bar", label: "Bars" }, { id: "number", label: "Number" }], periods: true, defaultSize: "s", defaultVisible: false },
  { id: "open_tasks", label: "Open tasks", hint: "Overdue and on time", views: [{ id: "number", label: "Number" }, { id: "bar", label: "Bar" }, { id: "ring", label: "Ring" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "corrective_actions", label: "Corrective actions", hint: "Open and overdue", views: [{ id: "number", label: "Number" }, { id: "bar", label: "Bar" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "leave_today", label: "Away today", hint: "Approved leave today", views: [{ id: "list", label: "List" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "compliance_reviews", label: "Compliance reviews", hint: "Days waiting for sign-off", views: [{ id: "summary", label: "Summary" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "noticeboard", label: "Noticeboard", hint: "Notices you have not read", views: [{ id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: false },
  { id: "device_battery", label: "Phone batteries", hint: "Low or not reporting", views: [{ id: "list", label: "List" }, { id: "number", label: "Number" }], periods: false, defaultSize: "s", defaultVisible: false },
];

export const customDef = (id: string) => CUSTOM_CARDS.find((c) => c.id === id);

export interface ResolvedCustomCard {
  id: string;
  visible: boolean;
  size: CardSize;
  view: string;
  period: Period | null;
}

export interface ResolvedCustom {
  look: Look;
  cards: ResolvedCustomCard[];
}

const VALID_SIZES: CardSize[] = ["s", "m", "l"];
const PERIODS: Period[] = ["7", "30", "90"];
export const DEFAULT_PERIOD: Period = "30";
export const DEFAULT_LOOK: Look = { density: "comfortable", cardStyle: "filled" };

const defaultCustomCard = (def: CustomCardDef): ResolvedCustomCard => ({
  id: def.id,
  visible: def.defaultVisible,
  size: def.defaultSize,
  view: def.views[0].id,
  period: def.periods ? DEFAULT_PERIOD : null,
});

export const defaultCustom = (): ResolvedCustom => ({ look: { ...DEFAULT_LOOK }, cards: CUSTOM_CARDS.map(defaultCustomCard) });

/** Which home the person opens on. Classic (today's screen) unless they chose Custom. Never throws. */
export function resolveActiveHome(stored: unknown): Home {
  return (stored as { active?: unknown } | null | undefined)?.active === "custom" ? "custom" : "classic";
}

/**
 * The Custom home to draw for a stored layout. Never throws: anything unreadable is the default Custom home. Unknown
 * cards are skipped, a view the card cannot draw falls back to its first, and a card the layout predates is
 * appended hidden.
 */
export function resolveCustom(stored: unknown): ResolvedCustom {
  const fallback = defaultCustom();
  const raw = (stored as { version?: unknown; custom?: { look?: unknown; cards?: unknown } } | null | undefined) ?? null;
  if (!raw || raw.version !== LAYOUT_VERSION || !raw.custom || typeof raw.custom !== "object") return fallback;

  const lookIn = (raw.custom.look ?? {}) as { density?: unknown; cardStyle?: unknown };
  const look: Look = {
    density: lookIn.density === "compact" ? "compact" : "comfortable",
    cardStyle: lookIn.cardStyle === "outlined" ? "outlined" : "filled",
  };
  if (!Array.isArray(raw.custom.cards)) return { ...fallback, look };

  const seen = new Set<string>();
  const cards: ResolvedCustomCard[] = [];
  for (const item of raw.custom.cards as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const card = item as { id?: unknown; visible?: unknown; size?: unknown; view?: unknown; period?: unknown };
    const def = typeof card.id === "string" ? customDef(card.id) : undefined;
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    cards.push({
      id: def.id,
      visible: card.visible !== false,
      size: VALID_SIZES.includes(card.size as CardSize) ? (card.size as CardSize) : def.defaultSize,
      view: def.views.some((v) => v.id === card.view) ? (card.view as string) : def.views[0].id,
      period: def.periods ? (PERIODS.includes(card.period as Period) ? (card.period as Period) : DEFAULT_PERIOD) : null,
    });
  }
  // Like Classic: a card the saved layout predates waits in the cards list, hidden, rather than appearing on its own.
  for (const def of CUSTOM_CARDS) if (!seen.has(def.id)) cards.push({ ...defaultCustomCard(def), visible: false });
  return { look, cards: cards.some((c) => c.visible) ? cards : defaultCustom().cards };
}

export function isDefaultCustom(custom: ResolvedCustom): boolean {
  const base = defaultCustom();
  return (
    custom.look.density === base.look.density &&
    custom.look.cardStyle === base.look.cardStyle &&
    custom.cards.length === base.cards.length &&
    custom.cards.every((c, i) => {
      const b = base.cards[i];
      return c.id === b.id && c.visible === b.visible && c.size === b.size && c.view === b.view && c.period === b.period;
    })
  );
}

export function patchCustomCard(
  custom: ResolvedCustom,
  id: string,
  patch: Partial<Pick<ResolvedCustomCard, "size" | "view" | "period">>,
): ResolvedCustom {
  return { ...custom, cards: custom.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** Arranging either home's cards (the same rules as the Classic ones). */
export function moveById<T extends { id: string }>(cards: T[], id: string, direction: -1 | 1): T[] {
  const from = cards.findIndex((c) => c.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= cards.length) return cards;
  const next = [...cards];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function setCardVisible<T extends { id: string; visible: boolean }>(cards: T[], id: string, visible: boolean): T[] {
  const target = cards.find((c) => c.id === id);
  if (!target || target.visible === visible) return cards;
  if (!visible && cards.filter((c) => c.visible).length <= 1) return cards;
  return cards.map((c) => (c.id === id ? { ...c, visible } : c));
}

// ---- Storing ----

export interface StorePatch {
  active?: Home;
  classic?: ResolvedCard[];
  custom?: ResolvedCustom;
}

const storedCustom = (custom: ResolvedCustom) => ({
  look: { density: custom.look.density, cardStyle: custom.look.cardStyle },
  cards: custom.cards.map((c) => ({
    id: c.id,
    visible: c.visible,
    size: c.size,
    view: c.view,
    ...(c.period ? { period: c.period } : {}),
  })),
});

const hasPart = (stored: unknown, part: "classic" | "custom") =>
  !!stored && typeof stored === "object" && !!(stored as Record<string, unknown>)[part];

/**
 * The layout to store after a change: what is already saved, with the change on top. A part that equals the default
 * is left out, so a person who changes nothing stores nothing. Returns null when nothing at all is left to store
 * (today's screen, opened on Classic), which means "forget the saved layout".
 */
export function mergeStored(prev: unknown, patch: StorePatch): StoredLayout | null {
  const active = patch.active ?? resolveActiveHome(prev);
  const classicCards = patch.classic ?? (hasPart(prev, "classic") ? resolveLayout(prev) : null);
  const custom = patch.custom ?? (hasPart(prev, "custom") ? resolveCustom(prev) : null);

  const out: StoredLayout = { version: LAYOUT_VERSION };
  if (active === "custom") out.active = "custom";
  if (classicCards && !isDefaultLayout(classicCards)) out.classic = { cards: classicCards.map((c) => ({ id: c.id, visible: c.visible })) };
  if (custom && !isDefaultCustom(custom)) out.custom = storedCustom(custom);
  // The server needs at least one part. Opening on Custom with everything default is stored as the default Custom home.
  if (!out.classic && !out.custom) {
    if (active !== "custom") return null;
    out.custom = storedCustom(defaultCustom());
  }
  return out;
}

/** The stored form of one arranged Classic home. */
export function toStored(cards: ResolvedCard[]): StoredLayout {
  return { version: LAYOUT_VERSION, classic: { cards: cards.map((c) => ({ id: c.id, visible: c.visible })) } };
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
