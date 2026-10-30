// How the phone writes the stock overview's numbers. Pure, so it is tested.

/** "R654 208,99": rand, space-grouped thousands, comma decimals, cents only when there are some. */
export function rand(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "-" : ""}R${grouped}${frac ? `,${String(frac).padStart(2, "0")}` : ""}`;
}

/** "R654k", "R1,2m": for tight tiles and chart labels. */
export function randShort(value: number): string {
  const v = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const trim = (n: number) => n.toFixed(1).replace(".", ",").replace(",0", "");
  if (v >= 1_000_000) return `${sign}R${trim(v / 1_000_000)}m`;
  if (v >= 10_000) return `${sign}R${Math.round(v / 1000)}k`;
  if (v >= 1_000) return `${sign}R${trim(v / 1000)}k`;
  return `${sign}R${Math.round(v)}`;
}

export const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export function sentence(text: string): string {
  const t = text.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Only site managers and above see stock insights. */
export const canSeeStockOverview = (role: string | null | undefined) =>
  role === "org_admin" || role === "operations_manager" || role === "site_manager";

/** Organisation admins and operations managers can also see every site together. */
export const canSeeAllSites = (role: string | null | undefined) => role === "org_admin" || role === "operations_manager";

/**
 * Slices of a donut for `rows`, as dash lengths on a circle of circumference `c`: each slice's length and
 * where it starts. Rows with no value are dropped; the gaps keep slices apart.
 */
export function donutSlices(rows: { name: string; value: number }[], c: number, gap = 3) {
  const live = rows.filter((r) => r.value > 0);
  const total = live.reduce((n, r) => n + r.value, 0);
  let offset = 0;
  return live.map((r) => {
    const len = total > 0 ? (r.value / total) * c : 0;
    const slice = { name: r.name, length: Math.max(0, len - (live.length > 1 ? gap : 0)), offset };
    offset += len;
    return slice;
  });
}
