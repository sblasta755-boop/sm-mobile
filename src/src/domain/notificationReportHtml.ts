import {
  bucketLabel,
  categoryLabel,
  changeLabel,
  pct,
  roleLabel,
  severityRank,
} from "./notificationInsights";
import type {
  NotificationOverview,
  NotificationPerson,
  NotificationRole,
  NotificationTemplate,
} from "@/api/client";

/**
 * The notification analysis as one self-contained HTML document (A4, fixed colours), which the browser prints
 * to PDF and the phone app turns into a PDF. Pure: the data in, a string out. The web app has the original in
 * smart-property-operations/src/src/lib/smartclean/notificationReportHtml.ts; keep the two in step.
 */

export type NotificationReportData = {
  overview: NotificationOverview;
  people: NotificationPerson[];
  roles: NotificationRole[];
  templates: NotificationTemplate[];
  /** "All organisations" or the one organisation the figures are for. */
  scope: string;
  generatedAt: Date;
};

const NAVY = "#12293f";
const TEAL = "#0a8f8a";
const MAX_INSIGHTS = 8;
const SEV: Record<string, string> = { critical: "#b91c1c", warning: "#b45309", info: "#0a6c8a" };

export function escapeHtml(text: string | number | null | undefined): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const num = (n: number) => n.toLocaleString("en-ZA");

/** A file name for the PDF: "notification-report-all-organisations-7-days-2026-11-25". */
export function notificationReportName(scope: string, days: number, at: Date): string {
  const slug = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `notification-report-${slug || "all"}-${days}-days-${at.toISOString().slice(0, 10)}`;
}

function bars(rows: { label: string; value: number; note?: string }[], color = TEAL): string {
  if (!rows.length) return `<p class="mut">Nothing to show.</p>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .map(
      (r) => `<div class="bar"><div class="bl">${escapeHtml(r.label)}</div>
<div class="bt"><div class="bf" style="width:${Math.max(1, Math.round((r.value / max) * 100))}%;background:${color}"></div></div>
<div class="bv">${num(r.value)}${r.note ? ` <span class="mut">${escapeHtml(r.note)}</span>` : ""}</div></div>`,
    )
    .join("");
}

function table(head: string[], rows: (string | number)[][], empty = "Nothing to show."): string {
  if (!rows.length) return `<p class="mut">${escapeHtml(empty)}</p>`;
  return `<table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/** Column chart of the series, drawn as inline SVG so it prints exactly. */
function columns(series: { t: string; count: number }[], bucket: "hour" | "day"): string {
  if (!series.length) return `<p class="mut">No notifications in this period.</p>`;
  const W = 720;
  const H = 150;
  const max = Math.max(1, ...series.map((s) => s.count));
  const step = W / series.length;
  const every = Math.max(1, Math.ceil(series.length / 12));
  const rects = series
    .map((s, i) => {
      const h = Math.round((s.count / max) * (H - 24));
      const x = i * step + step * 0.12;
      return `<rect x="${x.toFixed(1)}" y="${H - 18 - h}" width="${(step * 0.76).toFixed(1)}" height="${h}" fill="${TEAL}"/>${
        i % every === 0
          ? `<text x="${(i === 0 ? x : x + step * 0.38).toFixed(1)}" y="${H - 4}" font-size="8" text-anchor="${i === 0 ? "start" : "middle"}" fill="#64748b">${escapeHtml(bucketLabel(s.t, bucket))}</text>`
          : ""
      }`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Notifications over time">${rects}</svg>`;
}

export function buildNotificationReportHtml(data: NotificationReportData): string {
  const { overview: o, people, roles, templates } = data;
  const t = o.totals;
  const when = data.generatedAt.toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" });
  const allInsights = [...o.insights].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
  const insights = allInsights.slice(0, MAX_INSIGHTS);
  const hiddenInsights = allInsights.length - insights.length;
  // With no earlier period to compare against, "new" on every row says nothing.
  const hasHistory = t.previous > 0;
  const channels = (["push", "web_push", "email"] as const).map((k) => [
    k === "web_push" ? "Web push" : k === "push" ? "Phone push" : "Email",
    num(o.channels[k]?.sent ?? 0),
    num(o.channels[k]?.failed ?? 0),
    num(o.channels[k]?.suppressed ?? 0),
  ]);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notification report</title>
<style>
@page{size:A4;margin:14mm 12mm 16mm}
*{box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;color:#0f172a;font-size:10px;line-height:1.45;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:20px;margin:0;color:#fff}
h2{font-size:13px;margin:16px 0 6px;color:${NAVY};border-bottom:2px solid ${TEAL};padding-bottom:3px;break-after:avoid}
.head{background:${NAVY};color:#fff;padding:14px 16px;border-radius:6px}
.head p{margin:3px 0 0;color:#cbd5e1}
.kpis{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.kpi{flex:1 1 22%;border:1px solid #e2e8f0;border-radius:6px;padding:7px 9px;break-inside:avoid}
.kpi b{display:block;font-size:16px;color:${NAVY}}
.mut{color:#64748b}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{background:${NAVY};color:#fff;text-align:left;padding:4px 6px;font-size:9px}
td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}
tr{break-inside:avoid}
thead{display:table-header-group}
.bar{display:flex;align-items:center;gap:6px;margin:3px 0;break-inside:avoid}
.bl{width:34%;word-break:break-word}
.bt{flex:1;background:#f1f5f9;height:8px;border-radius:4px}
.bf{height:8px;border-radius:4px}
.bv{width:20%;text-align:right;white-space:nowrap}
.ins{border-left:4px solid #0a6c8a;background:#f8fafc;padding:6px 9px;margin:5px 0;break-inside:avoid}
.ins b{display:block}
.two{display:flex;gap:14px}.two>div{flex:1;min-width:0}
</style></head><body>
<div class="head"><h1>Notification report</h1>
<p>${escapeHtml(data.scope)} &bull; last ${o.days} days &bull; generated ${escapeHtml(when)}</p></div>

<div class="kpis">
<div class="kpi"><b>${num(t.total)}</b>Notifications<br><span class="mut">${escapeHtml(hasHistory ? `${changeLabel(t.change, t.total)} on the period before` : "no earlier period to compare")}</span></div>
<div class="kpi"><b>${num(t.recipients)}</b>People notified<br><span class="mut">${t.perHour.toFixed(1)} an hour</span></div>
<div class="kpi"><b>${escapeHtml(pct(t.readRate))}</b>Read rate<br><span class="mut">${num(t.targeted)} targeted, ${num(t.broadcast)} broadcast</span></div>
<div class="kpi"><b>${num(o.repeats.notifications)}</b>Repeated messages<br><span class="mut">${num(o.repeats.groups)} groups</span></div>
</div>

<h2>Volume over time</h2>
${columns(o.series, o.bucket)}

<h2>Insights and what to do about them</h2>
${
  insights.length
    ? insights
        .map(
          (i) =>
            `<div class="ins" style="border-left-color:${SEV[i.severity] ?? SEV.info}"><b>${escapeHtml(i.title)}</b>${escapeHtml(i.detail)}<br><span class="mut">Recommendation: ${escapeHtml(i.recommendation)}</span></div>`,
        )
        .join("")
    : `<p class="mut">Nothing unusual in this period.</p>`
}
${hiddenInsights > 0 ? `<p class="mut">${hiddenInsights} lower-priority insight${hiddenInsights === 1 ? "" : "s"} not shown. They are on the Overview tab.</p>` : ""}

<div class="two">
<div><h2>By category</h2>${bars(
    o.byCategory
      .slice(0, 10)
      .map((c) => ({ label: categoryLabel(c.category), value: c.count, note: pct(c.share) })),
  )}</div>
<div><h2>By organisation</h2>${bars(
    o.byOrganisation
      .slice(0, 10)
      .map((c) => ({ label: c.name, value: c.count, note: pct(c.share) })),
    "#0a6c8a",
  )}</div>
</div>

<h2>Delivery</h2>
${table(["Channel", "Sent", "Failed", "Held back"], channels)}
<p class="mut">Held back by the guard: ${num(o.suppressed.duplicate)} duplicates, ${num(o.suppressed.burst)} over the hourly limit.</p>

<h2>Who gets the most</h2>
${table(
  ["Person", "Role", "Organisation", "Total", "Per day", "Peak an hour", "Unread"],
  people.map((p) => [
    p.name,
    roleLabel(p.role),
    p.organisation,
    num(p.total),
    p.perDay.toFixed(1),
    p.peakPerHour,
    pct(p.unreadRate),
  ]),
)}

<h2>By role</h2>
${table(
  ["Role", "People", "Total", "Share", "Per person a day", "Busiest person", "Unread"],
  roles.map((r) => [
    roleLabel(r.role),
    num(r.people),
    num(r.total),
    pct(r.share),
    r.perPersonPerDay.toFixed(1),
    num(r.maxPerPerson),
    pct(r.unreadRate),
  ]),
)}

<h2>Most common notifications</h2>
${table(
  ["Message", "Category", "Sent", "People", "Read", "Change"],
  templates.map((m) => [
    m.title || m.example,
    categoryLabel(m.category),
    num(m.count),
    num(m.recipients),
    pct(m.readRate),
    changeLabel(m.change, hasHistory ? m.count : 0),
  ]),
)}
</body></html>`;
}
