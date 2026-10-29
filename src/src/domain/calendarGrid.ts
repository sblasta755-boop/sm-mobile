// Date maths and colour blending shared by every calendar in the app
// (see components/MonthCalendar.tsx). Day keys are local "YYYY-MM-DD".

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parseDayKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The days shown for a month: whole weeks, 5 or 6 of them. */
export function monthDays(month: Date, weekStartsOn: 0 | 1 = 1): string[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const count =
    Math.ceil(
      (lead +
        new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  return Array.from({ length: count }, (_, i) =>
    dayKey(new Date(first.getFullYear(), first.getMonth(), 1 - lead + i)),
  );
}

export const weekdayInitials = (weekStartsOn: 0 | 1 = 1) =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + ((weekStartsOn + i) % 7))
      .toLocaleDateString("en-ZA", { weekday: "short" })
      .slice(0, 3)
      .toUpperCase(),
  );

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Linear blend of two "#rrggbb" colours: t=0 -> a, t=1 -> b. */
export function mixHex(a: string, b: string, t: number): string {
  const ra = toRgb(a);
  const rb = toRgb(b);
  const channel = (i: number) =>
    Math.round(ra[i] + (rb[i] - ra[i]) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A tint of the primary over the card: intensity 0 = faint, 1 = full strength. */
export function heatColor(
  card: string,
  primary: string,
  intensity: number,
): string {
  const pct = 0.18 + Math.min(1, Math.max(0, intensity)) * 0.62;
  return mixHex(card, primary, pct);
}

export const monthTitle = (month: Date) =>
  month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

/** "#rrggbb" + alpha 0..1 -> "rgba(r,g,b,a)". */
export function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
