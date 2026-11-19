import type { ChartSpec } from "./scheduleAnalysis";

// Charts as inline SVG text, so the same picture prints from the web page and from the phone's PDF
// (expo-print turns HTML into a PDF and cannot run a chart library). Every label is escaped.

const NAVY = "#12293f";
const TEAL = "#0a8f8a";
const GRID = "#e2e8f0";
const MUTED = "#64748b";

const esc = (value: string | number) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const cut = (label: string, max: number) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);
const fmt = (n: number, unit: string) => `${n % 1 === 0 ? n : n.toFixed(1)}${unit ? ` ${unit}` : ""}`;

/** A "nice" top for the value axis, so the gridlines land on round numbers. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const f = max / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

export function chartSvg(spec: ChartSpec): string {
  const items = spec.items;
  if (items.length === 0) return "";
  return spec.type === "columns" ? columns(spec) : bars(spec);
}

function columns(spec: ChartSpec): string {
  const W = 520;
  const H = 170;
  const left = 30;
  const top = 14;
  const bottom = 24;
  const plotW = W - left - 8;
  const plotH = H - top - bottom;
  const items = spec.items;
  const top_ = niceMax(Math.max(...items.map((i) => i.value)));
  const slot = plotW / items.length;
  const barW = Math.min(26, slot * 0.7);
  const showValues = items.length <= 16;
  // Skip some x labels when columns are narrow, so they never run together.
  const every = Math.ceil(items.length / Math.floor(plotW / 28));

  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = top + plotH - plotH * f;
      return `<line x1="${left}" x2="${W - 8}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="1"/><text x="${left - 4}" y="${y + 3}" font-size="8" text-anchor="end" fill="${MUTED}">${esc(fmt(top_ * f, ""))}</text>`;
    })
    .join("");
  const cols = items
    .map((item, i) => {
      const h = (item.value / top_) * plotH;
      const x = left + slot * i + (slot - barW) / 2;
      const y = top + plotH - h;
      const value = showValues && item.value > 0
        ? `<text x="${x + barW / 2}" y="${y - 3}" font-size="8" font-weight="700" text-anchor="middle" fill="${NAVY}">${esc(fmt(item.value, ""))}</text>`
        : "";
      const label = i % every === 0
        ? `<text x="${x + barW / 2}" y="${H - 8}" font-size="8" text-anchor="middle" fill="${MUTED}">${esc(cut(item.label, 6))}</text>`
        : "";
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, item.value > 0 ? 1 : 0)}" rx="2" fill="${TEAL}"/>${value}${label}`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(spec.title)}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">${grid}${cols}</svg>`;
}

function bars(spec: ChartSpec): string {
  const W = 520;
  const rowH = 20;
  const left = 150;
  const right = 56;
  const items = spec.items;
  const H = items.length * rowH + 8;
  const max = Math.max(...items.map((i) => i.value), 1);
  const plotW = W - left - right;
  const rows = items
    .map((item, i) => {
      const y = 4 + i * rowH;
      const w = Math.max((item.value / max) * plotW, item.value > 0 ? 2 : 0);
      return `<text x="${left - 8}" y="${y + 12}" font-size="9" text-anchor="end" fill="${NAVY}">${esc(cut(item.label, 26))}</text><rect x="${left}" y="${y + 3}" width="${plotW}" height="10" rx="2" fill="${GRID}" opacity="0.5"/><rect x="${left}" y="${y + 3}" width="${w}" height="10" rx="2" fill="${TEAL}"/><text x="${left + w + 5}" y="${y + 12}" font-size="9" font-weight="700" fill="${NAVY}">${esc(fmt(item.value, spec.unit))}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(spec.title)}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">${rows}</svg>`;
}
