import { esc } from "./managementReportHtml";
import type { ReportDoc } from "./reportDoc";
import { chartSvg } from "./scheduleCharts";
import { SOMA_LOGO_ASPECT, SOMA_LOGO_DATA_URI, SOMA_WEBSITE_URL } from "./somaLogo";

// A schedule report as one HTML document for expo-print, laid out like the management report:
// letterhead on every page, a cover with figures and details, then a numbered section per group.
// The footer with page numbers is stamped on afterwards (pdfFooter.ts). Every value goes through esc().

const NAVY = "#12293f";
const TEAL = "#0a8f8a";
const BLUE = "#0a6c8a";

export interface ScheduleHtmlOptions {
  report: ReportDoc;
  siteName: string;
  siteAddress: string;
  clientName: string;
  /** The client's own logo (an embedded data address works best), or null to show the name. */
  clientLogoUrl: string | null;
  /** "09 OCTOBER 2026 | 05:35" */
  generatedAtLabel: string;
  preparedBy: string;
}

const kpi = (label: string, value: string) =>
  `<div><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;
const detail = (k: string, v: string) => `<tr><td class="k2">${esc(k)}</td><td>${esc(v)}</td></tr>`;

export function buildScheduleReportHtml(options: ScheduleHtmlOptions): string {
  const { report, siteName, siteAddress, clientName, clientLogoUrl, generatedAtLabel, preparedBy } = options;
  const keep = (_: unknown, c: number) => !report.hiddenColumns.includes(c);
  const head = report.header.filter(keep);
  const logoHeight = 34;
  const logoWidth = Math.round(logoHeight * SOMA_LOGO_ASPECT);

  const letterhead = `<div class="letterhead">
    <div class="client">${
      clientLogoUrl
        ? `<img src="${esc(clientLogoUrl)}" alt="${esc(clientName)}">`
        : `<span class="clientname">${esc(clientName)}</span>`
    }</div>
    <div class="right">
      <div class="proof">${esc(report.eyebrow)}</div>
      <div class="sub">${esc(report.title.toUpperCase())} | ${esc(generatedAtLabel)}</div>
      <div class="powered"><span>POWERED BY</span>
        <a href="${esc(SOMA_WEBSITE_URL)}"><img src="${SOMA_LOGO_DATA_URI}" alt="Šoma360" width="${logoWidth}" height="${logoHeight}"></a></div>
    </div>
  </div>`;

  const analysis =
    report.insights.length > 0 || report.charts.length > 0
      ? `<section class="page-start">
    <h2>Analysis</h2>
    ${
      report.insights.length > 0
        ? `<h3>What the figures show</h3><ul class="insights">${report.insights.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
        : ""
    }
    ${report.charts
      .map(
        (chart) => `<figure class="chart"><h3>${esc(chart.title)}</h3><p class="cap">${esc(chart.caption)}</p><div class="plot">${chartSvg(chart)}</div></figure>`,
      )
      .join("")}
  </section>`
      : "";

  const photosHtml =
    report.photos && report.photos.items.length > 0
      ? `<section class="page-start"><h2>${esc(report.photos.title)}</h2><div class="photos">${report.photos.items
          .map(
            (p) =>
              `<figure>${p.src ? `<img src="${esc(p.src)}" alt="${esc(p.caption)}">` : `<div class="noimg">No image</div>`}<figcaption>${esc(p.caption)}</figcaption></figure>`,
          )
          .join("")}</div></section>`
      : "";

  const groups = report.groups
    .map((group, index) => {
      const own = !!group.header;
      const cols = own ? group.header! : head;
      const rows = group.rows
        .map(
          (row, i) =>
            `<tr${i % 2 ? ' class="band"' : ""}>${(own ? row : row.filter(keep))
              .map((cell, c) => `<td${c === 0 ? ' class="b"' : ""}>${esc(cell)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      return `<div class="group${index === 0 ? "" : " keep"}">
        <h2><span class="n">${String(index + 1).padStart(2, "0")}</span>${esc(group.title)}</h2>
        ${group.note ? `<p class="cap">${esc(group.note)}</p>` : ""}
        <table class="grid"><thead><tr>${cols.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    })
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  tr, img { break-inside: avoid; }
  .page-start { break-before: page; }
  .layout > thead { display: table-header-group; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px; }
  .client { height: 52px; display: flex; align-items: center; }
  .client img { max-height: 52px; width: auto; }
  .clientname { font-size: 18px; font-weight: 800; color: ${NAVY}; }
  .right { text-align: right; }
  .proof { font-size: 9px; font-weight: 700; letter-spacing: .08em; color: ${BLUE}; }
  .sub { font-size: 7.5px; color: #64748b; margin-top: 2px; }
  .powered { margin-top: 6px; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .powered span { font-size: 7px; letter-spacing: .14em; color: #64748b; }
  .powered a { display: block; text-decoration: none; }
  .powered img { display: block; }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: ${TEAL}; margin: 0; }
  h1 { font-size: 26px; margin: 4px 0 0; color: ${NAVY}; }
  h2 { font-size: 18px; margin: 18px 0 8px; color: ${NAVY}; display: flex; align-items: baseline; gap: 8px; }
  h2 .n { font-size: 12px; color: ${TEAL}; }
  h3 { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: ${BLUE}; margin: 16px 0 6px; }
  .note { font-size: 9px; color: #64748b; margin: 8px 0 0; }
  .kpis { display: flex; gap: 12px; background: #f8fafc; padding: 10px 12px; margin-top: 10px; border-radius: 4px; }
  .kpis > div { flex: 1; }
  .k { font-size: 8px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #64748b; }
  .v { font-size: 11px; font-weight: 700; margin-top: 3px; }
  .grid th { background: ${NAVY}; color: #fff; text-align: left; font-size: 8px; letter-spacing: .05em; text-transform: uppercase; padding: 6px; }
  .grid td { padding: 6px; vertical-align: top; }
  .band { background: #f8fafc; }
  .b { font-weight: 600; }
  .insights { margin: 0; padding-left: 16px; } .insights li { margin: 0 0 5px; line-height: 1.4; }
  figure.chart { margin: 14px 0 0; break-inside: avoid; }
  .cap { font-size: 9px; color: #64748b; margin: -2px 0 6px; }
  .plot { border: 1px solid #e2e8f0; border-radius: 3px; padding: 6px; }
  .para { margin: 0; line-height: 1.5; font-size: 11px; }
  .callout { margin-top: 10px; padding: 8px 10px; border-radius: 4px; font-size: 10px; }
  .callout.warn { background: #fff4e5; } .callout.warn .k { color: #b45309; }
  .callout.info { background: #eaf4f8; } .callout.info .k { color: ${BLUE}; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 8px 0; }
  figure { margin: 0; break-inside: avoid; }
  figure img { width: 100%; height: auto; max-height: 250px; object-fit: contain; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; }
  figcaption { font-size: 8px; font-weight: 600; text-transform: uppercase; color: #475569; margin-top: 3px; }
  .noimg { width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; color: #94a3b8; font-size: 9px; }
  .details td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; }
  .k2 { width: 33%; font-weight: 600; color: #64748b; }
</style></head><body>
<table class="layout"><thead><tr><td>${letterhead}</td></tr></thead><tbody><tr><td>
  <section>
    <p class="eyebrow">${esc(report.title)}</p>
    <h1>${esc(siteName)}</h1>
    <p class="eyebrow" style="margin-top:10px">${esc(report.period)}</p>
    <div class="kpis" style="margin-top:14px">${report.kpis.map((k) => kpi(k.label, k.value)).join("")}</div>
    ${(report.callouts ?? [])
      .map(
        (c) => `<div class="callout ${c.tone}"><div class="k">${esc(c.title)}</div><div>${esc(c.text)}</div></div>`,
      )
      .join("")}
    <p class="note">${esc(report.note)}</p>
    <h3>Report details</h3>
    <table class="details"><tbody>
      ${detail("Site / branch", siteName)}${detail("Period", report.period)}
      ${detail("Location", siteAddress || "-")}${report.details.map((d) => detail(d.k, d.v)).join("")}${detail("Prepared by", preparedBy || `${clientName} Management`)}
    </tbody></table>
    ${report.summary ? `<h3>${esc(report.summary.title)}</h3><p class="para">${esc(report.summary.text)}</p>` : ""}
  </section>
  ${analysis}
  ${photosHtml}
  <section class="page-start">${groups}</section>
</td></tr></tbody></table>
</body></html>`;
}
