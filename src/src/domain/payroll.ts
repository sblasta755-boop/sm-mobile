// Pay runs on the phone: wording, the CSV and the printable documents. Mirrors the web app
// (smart-property-operations/src/src/lib/smartclean/payroll.ts and routes/payroll.print.*) - keep
// the figures identical: they come from the server as exact decimal strings and are only shown here.

import type { PayPerson, PayRun } from "@/api/client";
import { esc } from "./managementReportHtml";

const SYMBOLS: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€", GBP: "£" };

const group = (n: number) => {
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
};

/** "R 1,693.44" - two decimals, comma thousands, the symbol first. */
export function formatMoney(value: string | number | null | undefined, currency = "ZAR"): string {
  const n = Number(value ?? 0);
  return `${SYMBOLS[currency] ?? currency} ${group(Number.isFinite(n) ? n : 0)}`;
}

/** "40 h", "7.5 h": trailing zeros dropped. */
export function formatHours(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? Number(n.toFixed(2)) : 0} h`;
}

export function formatDays(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return String(Number.isFinite(n) ? Number(n.toFixed(2)) : 0);
}

export const periodLabel = (run: Pick<PayRun, "periodStart" | "periodEnd">) => `${run.periodStart} to ${run.periodEnd}`;

const clock = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** The summary as CSV: opens in Excel and any spreadsheet. */
export function summaryCsv(run: PayRun): string {
  const header = ["Name", "Days paid", "Days not counted", "Hours paid", "Hourly rate", "Earned", "Adjustments", "Gross pay"];
  const rows: (string | number)[][] = (run.people ?? []).map((p) => [
    p.name,
    Number(p.daysCounted),
    p.daysExcluded,
    Number(p.paidHours),
    Number(p.rate),
    Number(p.earned),
    Number(p.adjustmentTotal),
    Number(p.gross),
  ]);
  rows.push(["Total", Number(run.totals.daysCounted), run.totals.daysExcluded, Number(run.totals.paidHours), "", Number(run.totals.earned), Number(run.totals.adjustments), Number(run.totals.gross)]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

/** Every day behind every figure, as CSV. */
export function dayDetailCsv(run: PayRun): string {
  const header = ["Name", "Date", "Clock in", "Clock out", "Counted", "Reason not counted", "Day fraction", "Multiplier", "Hours paid"];
  const rows: (string | number)[][] = [];
  for (const p of run.people ?? []) {
    for (const d of p.days) {
      rows.push([
        p.name,
        d.date ?? "",
        clock(d.clockInAt),
        clock(d.clockOutAt),
        d.counted ? "Yes" : "No",
        d.manual ? `Entered by hand${d.label ? `: ${d.label}` : ""}` : (d.reason ?? ""),
        Number(d.fraction),
        Number(d.multiplier),
        Number(d.paidHours),
      ]);
    }
  }
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

const NAVY = "#12293f";
const TEAL = "#0a8f8a";
const BLUE = "#0a6c8a";

const STYLE = `
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-size: 18px; font-weight: 800; color: ${NAVY}; }
  .label { font-size: 9px; font-weight: 700; letter-spacing: .08em; color: ${BLUE}; text-align: right; }
  .sub { font-size: 8px; color: #64748b; text-align: right; text-transform: uppercase; margin-top: 2px; }
  .draft { color: #b91c1c; font-weight: 700; font-size: 9px; text-align: right; margin-top: 3px; }
  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${TEAL}; letter-spacing: .04em; }
  h1 { font-size: 22px; margin: 2px 0 4px; color: ${NAVY}; }
  .muted { color: #475569; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: ${NAVY}; color: #fff; padding: 6px 7px; font-size: 10px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 5px 7px; text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { border-top: 2px solid ${NAVY}; font-weight: 700; background: #fff !important; }
  .kpis { display: flex; gap: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; text-align: center; margin-top: 12px; }
  .kpis div { flex: 1; } .kpis b { display: block; font-size: 13px; } .kpis span { font-size: 8px; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .total { width: 62%; margin: 14px 0 0 auto; font-size: 12px; }
  .total div { display: flex; justify-content: space-between; padding: 2px 0; }
  .total .gross { border-top: 2px solid ${NAVY}; margin-top: 4px; padding-top: 4px; font-size: 15px; font-weight: 800; color: ${NAVY}; }
  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #cbd5e1; font-size: 8px; color: #64748b; }
  .sign { display: flex; gap: 40px; margin-top: 36px; font-size: 10px; color: #475569; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 3px; }
  .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
`;

function head(run: PayRun, brandName: string, logo: string | null, label: string, generated: string): string {
  const draft = run.status !== "final";
  return `<div class="head">
    <div>${logo ? `<img src="${esc(logo)}" style="max-height:44px" />` : `<span class="brand">${esc(brandName)}</span>`}</div>
    <div><div class="label">${esc(label)}</div><div class="sub">${esc(run.title)} | ${esc(generated)}</div>${draft ? '<div class="draft">DRAFT - NOT FINAL</div>' : ""}</div>
  </div>`;
}

const DISCLAIMER = "Gross pay worked out from approved attendance records. Tax and other deductions are not included.";

export interface PayDocOptions {
  brandName: string;
  logoUrl: string | null;
  generatedLabel: string;
}

/** The whole run on one document: totals, one row per person, and the approval lines. */
export function buildSummaryHtml(run: PayRun, o: PayDocOptions): string {
  const money = (v: string) => formatMoney(v, run.currency);
  const rows = (run.people ?? [])
    .map(
      (p) => `<tr><td>${esc(p.name)}</td><td>${formatDays(p.daysCounted)}</td><td>${formatHours(p.paidHours)}</td><td>${money(p.rate)}</td><td>${money(p.earned)}</td><td>${money(p.adjustmentTotal)}</td><td><b>${money(p.gross)}</b></td></tr>`,
    )
    .join("");
  return `<html><head><meta charset="utf-8"/><style>${STYLE}</style></head><body><div class="page">
    ${head(run, o.brandName, o.logoUrl, "PAY RUN SUMMARY", o.generatedLabel)}
    <div class="eyebrow">${esc(periodLabel(run))} | ${esc(run.siteNames.join(", ") || "All sites")}</div>
    <h1>${esc(run.title)}</h1>
    <div class="muted">${esc(run.ruleDescription)}</div>
    <div class="kpis">
      <div><span>People</span><b>${run.totals.people}</b></div>
      <div><span>Days paid</span><b>${formatDays(run.totals.daysCounted)}</b></div>
      <div><span>Hours paid</span><b>${formatHours(run.totals.paidHours)}</b></div>
      <div><span>Gross pay</span><b>${money(run.totals.gross)}</b></div>
    </div>
    <table><thead><tr><th>Name</th><th>Days</th><th>Hours</th><th>Rate / h</th><th>Earned</th><th>Adjust.</th><th>Gross pay</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td>${formatDays(run.totals.daysCounted)}</td><td>${formatHours(run.totals.paidHours)}</td><td></td><td>${money(run.totals.earned)}</td><td>${money(run.totals.adjustments)}</td><td>${money(run.totals.gross)}</td></tr></tfoot></table>
    ${run.notes ? `<p class="muted" style="margin-top:12px;white-space:pre-line">${esc(run.notes)}</p>` : ""}
    <div class="sign"><div>Prepared by ${esc(run.createdByName)}</div><div>Approved by ${esc(run.finalisedByName ?? "________________")}</div></div>
    <div class="foot">${DISCLAIMER}</div>
  </div></body></html>`;
}

function statement(run: PayRun, p: PayPerson, o: PayDocOptions): string {
  const money = (v: string) => formatMoney(v, run.currency);
  const days = p.days
    .filter((d) => d.counted)
    .map(
      (d) =>
        `<tr><td>${esc(d.date ?? (d.label || "Entered by hand"))}</td><td>${clock(d.clockInAt)}</td><td>${clock(d.clockOutAt)}</td><td>${formatDays(d.fraction)}</td><td>${Number(d.multiplier) === 1 ? "-" : `x${Number(d.multiplier)}`}</td><td>${formatHours(d.paidHours)}</td></tr>`,
    )
    .join("");
  const adjustments = p.adjustments.map((a) => `<div><span>${esc(a.label)}</span><span>${money(a.amount)}</span></div>`).join("");
  return `<div class="page">
    ${head(run, o.brandName, o.logoUrl, "PAY STATEMENT / INVOICE", o.generatedLabel)}
    <div class="eyebrow">${esc(periodLabel(run))} | ${esc(run.siteNames.join(", ") || "All sites")}</div>
    <h1>${esc(p.name)}</h1>
    <div class="muted">${esc(run.ruleDescription)}</div>
    <table><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Day</th><th>Multiplier</th><th>Hours paid</th></tr></thead><tbody>${days}</tbody></table>
    <div class="total">
      <div><span>${formatDays(p.daysCounted)} day(s), ${formatHours(p.paidHours)} at ${money(p.rate)}</span><span>${money(p.earned)}</span></div>
      ${adjustments}
      <div class="gross"><span>Gross pay</span><span>${money(p.gross)}</span></div>
    </div>
    ${p.daysExcluded > 0 ? `<p class="muted">${p.daysExcluded} day(s) in this period were not counted (not approved or incomplete).</p>` : ""}
    <div class="foot">${DISCLAIMER}</div>
  </div>`;
}

/** One page per person (or the single person given). */
export function buildInvoicesHtml(run: PayRun, people: PayPerson[], o: PayDocOptions): string {
  return `<html><head><meta charset="utf-8"/><style>${STYLE}</style></head><body>${people.map((p) => statement(run, p, o)).join("")}</body></html>`;
}
