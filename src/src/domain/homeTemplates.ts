/**
 * Ready-made Custom homes. A person picks one instead of choosing a look and every card; they can still change
 * anything afterwards. A template is only a starting Custom home (look, which cards, their order and views), so
 * applying one stores an ordinary layout: no server support and no new data. Mirrored in the web console
 * (smart-property-operations/src/src/lib/smartclean/homeTemplates.ts); keep the ids and cards the same.
 */
import {
  CUSTOM_CARDS,
  defaultCustom,
  type CardSize,
  type Look,
  type Period,
  type ResolvedCustom,
  type ResolvedCustomCard,
  type StorePatch,
} from "./homeLayout";

export interface TemplateCard {
  id: string;
  /** Must be one of the card's own views; the card's first view when left out. */
  view?: string;
  size?: CardSize;
  period?: Period;
}

export interface HomeTemplate {
  id: string;
  name: string;
  /** One line on what it is for. */
  blurb: string;
  /** Who it suits, in the person's own terms. */
  forWho: string;
  look: Look;
  /** The cards that are on, in order. Every other card waits in the cards list. */
  cards: TemplateCard[];
}

export const TEMPLATES: HomeTemplate[] = [
  {
    id: "operations_desk",
    name: "Operations desk",
    blurb: "Who is in, what waits for you, and what needs attention.",
    forWho: "Operations managers running several sites",
    look: { density: "comfortable", cardStyle: "filled" },
    cards: [
      { id: "attendance_now" },
      { id: "approvals" },
      { id: "attention" },
      { id: "site_pulse" },
      { id: "maintenance" },
      { id: "stock_alerts" },
      { id: "incidents" },
    ],
  },
  {
    id: "on_the_floor",
    name: "On the floor",
    blurb: "A short, large-type list for a manager who is always moving.",
    forWho: "Site managers",
    look: { density: "comfortable", cardStyle: "filled" },
    cards: [
      { id: "attendance_now", view: "roster" },
      { id: "attention" },
      { id: "open_tasks", view: "ring" },
      { id: "incidents", view: "number" },
      { id: "approvals", view: "number" },
    ],
  },
  {
    id: "people_and_time",
    name: "People and time",
    blurb: "Attendance, leave, overtime and the phones that track them.",
    forWho: "Managers who look after staff",
    look: { density: "comfortable", cardStyle: "filled" },
    cards: [
      { id: "attendance_now", view: "bar" },
      { id: "approvals" },
      { id: "leave_today" },
      { id: "on_shift", view: "list" },
      { id: "device_battery" },
      { id: "compliance_reviews" },
    ],
  },
  {
    id: "quality_and_tasks",
    name: "Quality and tasks",
    blurb:
      "How work is going: completion, flow, inspection pass rate and corrective actions.",
    forWho: "Anyone judged on the standard of the work",
    look: { density: "comfortable", cardStyle: "filled" },
    cards: [
      { id: "completion", view: "gauge" },
      { id: "quality", view: "ring", period: "30" },
      { id: "flow", view: "trend", period: "30" },
      { id: "corrective_actions", view: "bar" },
      { id: "open_tasks", view: "bar" },
      { id: "activity_map", period: "90" },
    ],
  },
  {
    id: "numbers_only",
    name: "Numbers only",
    blurb:
      "Compact outlined cards that show one number each. The most on one screen.",
    forWho: "Quick checks between jobs",
    look: { density: "compact", cardStyle: "outlined" },
    cards: [
      { id: "attendance_now", view: "number" },
      { id: "approvals", view: "number" },
      { id: "open_tasks", view: "number" },
      { id: "incidents", view: "number" },
      { id: "maintenance", view: "number" },
      { id: "stock_alerts", view: "number" },
      { id: "corrective_actions", view: "number" },
    ],
  },
  {
    id: "all_sites",
    name: "All sites",
    blurb:
      "Compare sites side by side, with the money and stock risks beneath.",
    forWho: "Organisation admins and owners",
    look: { density: "comfortable", cardStyle: "filled" },
    cards: [
      { id: "site_pulse", view: "bar" },
      { id: "completion", view: "ring" },
      { id: "maintenance" },
      { id: "stock_alerts" },
      { id: "incidents", view: "bar" },
      { id: "approvals" },
      { id: "noticeboard" },
    ],
  },
];

export const templateById = (id: string): HomeTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

/**
 * The Custom home a template makes: its cards on, in its order, then every other card hidden in the usual order.
 * A view the card cannot draw falls back to the card's first, so a template can never break a card.
 */
export function templateCustom(template: HomeTemplate): ResolvedCustom {
  const base = defaultCustom();
  const byId = new Map(base.cards.map((c) => [c.id, c]));
  const used = new Set<string>();
  const on: ResolvedCustomCard[] = [];
  for (const t of template.cards) {
    const card = byId.get(t.id);
    const def = CUSTOM_CARDS.find((c) => c.id === t.id);
    if (!card || !def || used.has(t.id)) continue;
    used.add(t.id);
    on.push({
      ...card,
      visible: true,
      size: t.size ?? card.size,
      view: def.views.some((v) => v.id === t.view)
        ? (t.view as string)
        : card.view,
      period: def.periods ? (t.period ?? card.period) : null,
    });
  }
  const off = base.cards
    .filter((c) => !used.has(c.id))
    .map((c) => ({ ...c, visible: false }));
  return { look: { ...template.look }, cards: [...on, ...off] };
}

/** What to store to start from this template: open on the Custom home with its look and cards. */
export const templatePatch = (template: HomeTemplate): StorePatch => ({
  active: "custom",
  custom: templateCustom(template),
});

/** The template whose look, cards, order, views and sizes this Custom home still matches exactly, if any. */
export function matchingTemplate(
  custom: ResolvedCustom,
): HomeTemplate | undefined {
  return TEMPLATES.find((t) => {
    const made = templateCustom(t);
    return (
      made.look.density === custom.look.density &&
      made.look.cardStyle === custom.look.cardStyle &&
      made.cards.length === custom.cards.length &&
      made.cards.every((c, i) => {
        const o = custom.cards[i];
        return (
          c.id === o.id &&
          c.visible === o.visible &&
          c.view === o.view &&
          c.size === o.size &&
          c.period === o.period
        );
      })
    );
  });
}
