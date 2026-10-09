import type { Evidence } from "@/types/smartclean";
import type { ManagementReport, ReportSection } from "./managementReport";
import { SOMA_LOGO_ASPECT, SOMA_LOGO_DATA_URI } from "./somaLogo";

// The management report as one HTML document, for expo-print to turn into a
// PDF on the phone. Mirrors the web page (reports.management.tsx): letterhead
// on every page, cover, results by area, a section per task with its photos,
// and the approval record. Plain string templates, like the performance
// profile - HTML and CSS are the one surface a browser and a native PDF
// engine agree on. Every dynamic value goes through esc().

const NAVY = "#12293f";
const TEAL = "#0a8f8a";
const BLUE = "#0a6c8a";
const GREEN = "#15803d";
const AMBER = "#b45309";
const RED = "#b91c1c";

export function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ReportHtmlOptions {
  report: ManagementReport;
  /** "Daily Opening Procedure" - the report is titled "<name> Report". */
  reportName: string;
  /** The client's name, shown when it has no logo of its own. */
  clientName: string;
  /** The client's own logo, or null to show the name instead. */
  clientLogoUrl: string | null;
  /** "09 OCTOBER 2026 | 05:35" */
  generatedAtLabel: string;
  /** Who signs the management review, and the date printed beside them. */
  reviewerName: string;
  reviewDateLabel: string;
  /** Turns an evidence photo into an image address, or null when it has none. */
  photoSrc: (photo: Evidence) => string | null;
}

const outcomeColor = (outcome: string) => (outcome === "Passed" ? GREEN : outcome === "Sent back" ? RED : AMBER);

function photos(list: Evidence[], photoSrc: ReportHtmlOptions["photoSrc"]): string {
  if (list.length === 0) return "";
  return `<div class="photos">${list
    .map((photo) => {
      const src = photoSrc(photo);
      const caption = esc(photo.kind === "evidence" ? "Evidence" : photo.kind);
      return `<figure>${
        src ? `<img src="${esc(src)}" alt="${esc(photo.label)}">` : `<div class="noimg">No image</div>`
      }<figcaption>${caption}</figcaption></figure>`;
    })
    .join("")}</div>`;
}

function taskSection(section: ReportSection, number: number, photoSrc: ReportHtmlOptions["photoSrc"]): string {
  const rows = section.checks
    .map((check, i) => {
      const band = i % 2 ? ' class="band"' : "";
      const photoRow =
        check.photos.length > 0 ? `<tr${band}><td colspan="4">${photos(check.photos, photoSrc)}</td></tr>` : "";
      return `<tr${band}><td class="b">${esc(check.section)}</td><td>${esc(check.action)}</td>
        <td style="color:${check.done ? GREEN : RED}">${check.done ? "Complete" : "Not complete"}</td>
        <td style="color:${check.photoStatus === "Not captured" ? RED : "inherit"}">${esc(check.photoStatus)}</td></tr>${photoRow}`;
    })
    .join("");
  const taskPhotos =
    section.taskPhotos.length > 0
      ? `<tr><td class="b">Task photos</td><td colspan="3">${photos(section.taskPhotos, photoSrc)}</td></tr>`
      : "";
  return `<section class="page-start">
    <h2><span class="n">${String(number).padStart(2, "0")}</span>${esc(section.area)}</h2>
    <p class="muted small">Location: ${esc(section.task.locationName ?? "Whole site")} | Done by: ${esc(section.cleaner)}</p>
    <p class="status" style="color:${outcomeColor(section.outcome)}">${esc(section.outcome)}${
      section.score !== null ? ` | Inspection score: ${section.score} / 100` : ""
    }</p>
    <div class="kpis">
      ${kpi("Started", section.started ?? "-")}${kpi("Submitted", section.submitted ?? "-")}${kpi("Approved", section.approved ?? "-")}
    </div>
    <h3>Operational checklist</h3>
    <table class="grid"><thead><tr><th>Section</th><th>Required action</th><th>Result</th><th>Photo status</th></tr></thead>
      <tbody>${rows}${taskPhotos}</tbody></table>
    <h3>Verification chain</h3>
    <table class="grid"><thead><tr>${section.verification.map((v) => `<th>${esc(v.label)}</th>`).join("")}</tr></thead>
      <tbody><tr>${section.verification
        .map((v, i) => `<td${i === 0 ? ' class="b"' : ""}>${esc(v.value)}</td>`)
        .join("")}</tr></tbody></table>
  </section>`;
}

const kpi = (label: string, value: string) =>
  `<div><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;

const detail = (k: string, v: string) => `<tr><td class="k2">${esc(k)}</td><td>${esc(v)}</td></tr>`;

export function buildManagementReportHtml(options: ReportHtmlOptions): string {
  const { report, reportName, clientName, clientLogoUrl, generatedAtLabel, reviewerName, reviewDateLabel, photoSrc } =
    options;
  const title = `${reportName.trim() || "Daily Service"} Report`;
  const logoHeight = 34;
  const logoWidth = Math.round(logoHeight * SOMA_LOGO_ASPECT);
  const mean = report.kpis.meanScore;

  const letterhead = `<div class="letterhead">
    <div class="client">${
      clientLogoUrl ? `<img src="${esc(clientLogoUrl)}" alt="${esc(clientName)}">` : `<span class="clientname">${esc(clientName)}</span>`
    }</div>
    <div class="right">
      <div class="proof">DIGITAL PROOF OF SERVICE</div>
      <div class="sub">MANAGEMENT ${esc(title.toUpperCase())} | ${esc(generatedAtLabel)}</div>
      <div class="powered"><span>POWERED BY</span>
        <img src="${SOMA_LOGO_DATA_URI}" alt="Šoma360" width="${logoWidth}" height="${logoHeight}"></div>
    </div>
  </div>`;

  const areaRows = report.areas
    .map(
      (row, i) => `<tr${i % 2 ? ' class="band"' : ""}><td class="b">${esc(row.area)}</td><td>${esc(row.visibleChecks)}</td>
      <td>${esc(row.score)}</td><td style="color:${row.status === "Approved" ? GREEN : AMBER}">${esc(row.status)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  tr, figure, img { break-inside: avoid; }
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
  .powered img { display: block; }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: ${TEAL}; margin: 0; }
  h1 { font-size: 26px; margin: 4px 0 0; color: ${NAVY}; }
  h2 { font-size: 20px; margin: 0 0 8px; color: ${NAVY}; display: flex; align-items: baseline; gap: 8px; }
  h2 .n { font-size: 12px; color: ${TEAL}; }
  h3 { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: ${BLUE}; margin: 16px 0 6px; }
  .muted { color: #64748b; } .small { font-size: 10px; margin: 0; }
  .status { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; margin: 10px 0 0; }
  .kpis { display: flex; gap: 12px; background: #f8fafc; padding: 10px 12px; margin-top: 10px; border-radius: 4px; }
  .kpis > div { flex: 1; }
  .k { font-size: 8px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #64748b; }
  .v { font-size: 11px; font-weight: 700; margin-top: 3px; }
  .grid th { background: ${NAVY}; color: #fff; text-align: left; font-size: 8px; letter-spacing: .05em; text-transform: uppercase; padding: 6px; }
  .grid td { padding: 6px; vertical-align: top; }
  .band { background: #f8fafc; }
  .b { font-weight: 600; }
  .details td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; }
  .k2 { width: 33%; font-weight: 600; color: #64748b; }
  .photos { display: flex; flex-wrap: wrap; gap: 10px; padding: 6px 0; }
  figure { margin: 0; text-align: center; }
  figure img { height: 90px; width: auto; border: 1px solid #e2e8f0; border-radius: 3px; }
  figcaption { font-size: 7px; text-transform: uppercase; color: #64748b; margin-top: 2px; }
  .noimg { width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; color: #94a3b8; font-size: 9px; }
  .totals p { margin: 4px 0; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  .approval { display: flex; gap: 12px; background: #f8fafc; padding: 12px; border-radius: 4px; }
  .approval > div { flex: 1; }
  .approval .name { font-size: 15px; font-weight: 700; margin-top: 6px; }
  .footer { margin-top: 24px; font-size: 7px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
</style></head><body>
<table class="layout"><thead><tr><td>${letterhead}</td></tr></thead><tbody><tr><td>
  <section>
    <p class="eyebrow">${esc(title)}</p>
    <h1>${esc(report.siteName)}</h1>
    <p class="eyebrow" style="margin-top:10px">${esc(report.dateLabel)}</p>
    ${clientLogoUrl ? `<div style="text-align:center;margin:18px 0"><img src="${esc(clientLogoUrl)}" alt="" style="max-height:130px;width:auto"></div>` : ""}
    <div class="kpis" style="margin-top:14px">
      ${kpi("Approved records", String(report.kpis.approved).padStart(2, "0"))}
      ${kpi("Checklist checks", `${report.kpis.checksDone} / ${report.kpis.checksTotal}`)}
      ${kpi("Mean of scores", mean === null ? "Not scored" : `${mean} / 100`)}
    </div>
    <h3>Inspection details</h3>
    <table class="details"><tbody>
      ${detail("Site / branch", report.siteName)}${detail("Service date", report.dateLabel)}${detail("Time", report.timeLabel)}
      ${detail("Inspector", report.inspectors.join(", ") || "Not yet inspected")}${detail("Supervisor", report.supervisors.join(", ") || "-")}
      ${detail("Prepared by", `${clientName} Management`)}${detail("Location", report.siteAddress || "-")}
    </tbody></table>
  </section>

  <section class="page-start">
    <h2><span class="n">01</span>Overview Results</h2>
    <h3>Area outcomes</h3>
    <table class="grid"><thead><tr><th>Area / task</th><th>Visible checks</th><th>Score</th><th>Record status</th></tr></thead>
      <tbody>${areaRows}</tbody></table>
    <div class="totals" style="margin-top:12px">
      <p>Total checks completed: ${report.totals.checksDone}/${report.totals.checksTotal}</p>
      <p>Total checks outstanding: ${report.totals.outstanding}</p>
      <p>Total areas: ${report.totals.areas}</p>
      <p>Total agg score: ${report.totals.meanScore === null ? "Not scored" : report.totals.meanScore}</p>
    </div>
  </section>

  ${report.sections.map((section, index) => taskSection(section, index + 2, photoSrc)).join("\n")}

  <section class="page-start">
    <h3>Approval &amp; completion record</h3>
    <div class="approval">
      <div><div class="k" style="color:${GREEN}">Inspector</div><div class="name">${esc(report.inspectors.join(", ") || "-")}</div></div>
      <div><div class="k" style="color:${AMBER}">Supervisor</div><div class="name">${esc(report.supervisors.join(", ") || "-")}</div></div>
    </div>
    <h3>Management review</h3>
    <table class="grid"><thead><tr><th>Reviewed by / designation</th><th>Signature &amp; date</th></tr></thead>
      <tbody><tr><td>MANAGEMENT</td><td>${esc(reviewerName)} (${esc(reviewDateLabel)})</td></tr></tbody></table>
    <p class="footer">${esc(report.siteName)} | ${esc(reportName.trim() || "Daily Service")} | Management report</p>
  </section>
</td></tr></tbody></table>
</body></html>`;
}
