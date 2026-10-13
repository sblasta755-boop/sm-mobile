// Colours for task tags. Mirrored in the web app at
// smart-property-operations/src/src/lib/smartclean/tagColors.ts - keep both in sync.
//
// An organisation can choose a colour per tag (the backend's /tenant/tag-colors);
// a tag with no choice gets one from its name, so every tag is colour-coded from
// the start and looks the same on every device.

export const TAG_PALETTE = {
  teal: "#0d9488",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#d97706",
  orange: "#ea580c",
  red: "#dc2626",
  pink: "#db2777",
  purple: "#7c3aed",
  slate: "#64748b",
} as const;

export type TagColorName = keyof typeof TAG_PALETTE;
export const TAG_COLOR_NAMES = Object.keys(TAG_PALETTE) as TagColorName[];

const FALLBACK_ORDER: TagColorName[] = ["teal", "blue", "purple", "amber", "green", "pink", "orange", "red", "slate"];

export type TagColorOverrides = Record<string, string>;

/** Stable colour name for a tag: the organisation's choice, else a hash of its name. */
export function tagColorName(tag: string, overrides: TagColorOverrides = {}): TagColorName {
  const key = tag.trim().toLowerCase();
  const chosen = overrides[key];
  if (chosen && chosen in TAG_PALETTE) return chosen as TagColorName;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return FALLBACK_ORDER[hash % FALLBACK_ORDER.length];
}

/** The colours to draw a tag with: text, a soft tinted background and a border. */
export function tagStyle(tag: string, overrides: TagColorOverrides = {}) {
  const color = TAG_PALETTE[tagColorName(tag, overrides)];
  return { color, backgroundColor: `${color}22`, borderColor: `${color}66` };
}
