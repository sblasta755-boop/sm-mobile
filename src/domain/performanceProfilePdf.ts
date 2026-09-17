import type { AttendanceDay } from "@/api/client";
import type { CorrectiveAction, DemoUser, Inspection, Site, Task } from "@/types/smartclean";

interface BuildArgs {
  user: DemoUser;
  site: Site | undefined;
  tenantName: string;
  primaryColor: string;
  sections: { tasks: boolean; inspections: boolean; correctiveActions: boolean; attendance: boolean };
  tasks: Task[];
  inspections: Inspection[];
  correctiveActions: CorrectiveAction[];
  attendanceDays: AttendanceDay[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatMonthYear(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function formatHours(minutes: number | undefined): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Builds the full HTML document handed to expo-print's
 * printToFileAsync. Kept as plain string templates rather than a
 * component library, the same approach the web app's browser
 * print-to-PDF page (reports.proof-of-service.$jobId.tsx) uses via
 * window.print() - HTML+CSS is the one rendering surface both a
 * browser and a native PDF engine (WebKit under the hood on both
 * platforms expo-print supports) agree on. */
export function buildPerformanceProfileHtml(args: BuildArgs): string {
  const { user, site, tenantName, primaryColor, sections, tasks, inspections, correctiveActions, attendanceDays } = args;

  const approvedTasks = tasks.filter((t) => ["approved", "closed"].includes(t.status));
  const reworkedTasks = tasks.filter((t) => ["rework_required", "resubmitted"].includes(t.status));
  const totalConsidered = approvedTasks.length + reworkedTasks.length;
  const approvalRate = totalConsidered > 0 ? Math.round((approvedTasks.length / totalConsidered) * 100) : null;

  const scoredInspections = inspections.filter((i) => typeof i.score === "number");
  const avgInspectionScore =
    scoredInspections.length > 0
      ? Math.round(scoredInspections.reduce((sum, i) => sum + (i.score ?? 0), 0) / scoredInspections.length)
      : null;

  const closedActions = correctiveActions.filter((c) => c.status === "closed");

  const totalWorkedMinutes = attendanceDays.reduce((sum, d) => sum + (d.workedMinutes ?? 0), 0);
  const daysWorked = attendanceDays.filter((d) => d.clockInAt).length;

  const memberSince = user.createdAt ? formatMonthYear(user.createdAt) : null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px 36px; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #182531;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid ${primaryColor};
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .eyebrow {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #6f7b87;
    margin: 0 0 4px;
  }
  .name {
    font-size: 26px;
    font-weight: 800;
    margin: 0;
    color: #182531;
  }
  .role {
    font-size: 13px;
    font-weight: 600;
    color: ${primaryColor};
    text-transform: capitalize;
    margin: 2px 0 0;
  }
  .meta {
    font-size: 11px;
    color: #6f7b87;
    margin: 6px 0 0;
  }
  .brand {
    text-align: right;
    font-size: 11px;
    color: #6f7b87;
  }
  .brand strong {
    display: block;
    font-size: 13px;
    color: #182531;
  }
  .stats {
    display: flex;
    gap: 10px;
    margin-bottom: 24px;
  }
  .stat {
    flex: 1;
    background: #f8fbfc;
    border: 1px solid #dfe8ec;
    border-radius: 10px;
    padding: 12px;
    text-align: center;
  }
  .stat .value {
    font-size: 22px;
    font-weight: 800;
    color: ${primaryColor};
  }
  .stat .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #6f7b87;
    margin-top: 2px;
  }
  section {
    margin-bottom: 22px;
    break-inside: avoid;
  }
  h2 {
    font-size: 14px;
    font-weight: 700;
    border-bottom: 1px solid #dfe8ec;
    padding-bottom: 6px;
    margin: 0 0 10px;
    color: #182531;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  th {
    text-align: left;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #6f7b87;
    padding: 5px 8px;
    border-bottom: 1px solid #dfe8ec;
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid #eef3f5;
    vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .badge-good { background: #e4f6ee; color: #209c68; }
  .badge-warn { background: #fff4d8; color: #4b3400; }
  .badge-bad { background: #fde8e6; color: #d3382c; }
  .empty {
    font-size: 11px;
    color: #6f7b87;
    font-style: italic;
  }
  .comment {
    font-size: 10px;
    color: #6f7b87;
    font-style: italic;
  }
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #dfe8ec;
    font-size: 9px;
    color: #9aa6ad;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="eyebrow">Performance profile</p>
      <p class="name">${escapeHtml(user.name)}</p>
      <p class="role">${escapeHtml(user.role.replace(/_/g, " "))}</p>
      <p class="meta">
        ${site ? escapeHtml(site.name) : ""}${memberSince ? ` &middot; With ${escapeHtml(tenantName)} since ${memberSince}` : ""}
      </p>
    </div>
    <div class="brand">
      <strong>${escapeHtml(tenantName)}</strong>
      Generated ${formatDate(new Date().toISOString())}
    </div>
  </div>

  <div class="stats">
    ${approvalRate !== null ? statTile(`${approvalRate}%`, "Approval rate") : ""}
    ${avgInspectionScore !== null ? statTile(`${avgInspectionScore}`, "Avg. inspection score") : ""}
    ${sections.tasks ? statTile(`${approvedTasks.length}`, "Tasks completed") : ""}
    ${sections.attendance && daysWorked > 0 ? statTile(`${daysWorked}`, "Days worked (90d)") : ""}
  </div>

  ${sections.tasks ? taskSection(tasks) : ""}
  ${sections.inspections ? inspectionSection(inspections) : ""}
  ${sections.correctiveActions ? correctiveActionSection(correctiveActions, closedActions.length) : ""}
  ${sections.attendance ? attendanceSection(attendanceDays, totalWorkedMinutes) : ""}

  <div class="footer">
    This document was generated from ${escapeHtml(tenantName)}'s Šoma360 records and reflects the
    data on file at the time it was created.
  </div>
</body>
</html>`;
}

function statTile(value: string, label: string): string {
  return `<div class="stat"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></div>`;
}

function statusBadge(text: string, tone: "good" | "warn" | "bad"): string {
  return `<span class="badge badge-${tone}">${escapeHtml(text.replace(/_/g, " "))}</span>`;
}

function taskToneFor(status: Task["status"]): "good" | "warn" | "bad" {
  if (["approved", "closed"].includes(status)) return "good";
  if (["rework_required", "resubmitted", "cancelled"].includes(status)) return "bad";
  return "warn";
}

function taskSection(tasks: Task[]): string {
  const rows = tasks
    .slice(0, 60)
    .map(
      (t) => `<tr>
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(t.locationName)}</td>
        <td>${formatDate(t.approvedAt ?? t.submittedAt ?? t.scheduledAt)}</td>
        <td>${t.score != null ? t.score : "—"}</td>
        <td>${statusBadge(t.status, taskToneFor(t.status))}</td>
      </tr>`,
    )
    .join("");
  return `<section>
    <h2>Task history${tasks.length > 60 ? ` (most recent 60 of ${tasks.length})` : ""}</h2>
    ${
      tasks.length === 0
        ? `<p class="empty">No completed tasks on record yet.</p>`
        : `<table>
      <thead><tr><th>Task</th><th>Location</th><th>Date</th><th>Score</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </section>`;
}

function inspectionToneFor(score: number | undefined): "good" | "warn" | "bad" {
  if (score == null) return "warn";
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

function inspectionSection(inspections: Inspection[]): string {
  const rows = inspections
    .slice(0, 40)
    .map(
      (i) => `<tr>
        <td>${formatDate(i.decidedAt ?? i.createdAt)}</td>
        <td>${i.score != null ? statusBadge(String(i.score), inspectionToneFor(i.score)) : "—"}</td>
        <td>${escapeHtml(i.status.replace(/_/g, " "))}</td>
        <td>${i.comments ? `<span class="comment">"${escapeHtml(i.comments)}"</span>` : ""}</td>
      </tr>`,
    )
    .join("");
  return `<section>
    <h2>Inspection results${inspections.length > 40 ? ` (most recent 40 of ${inspections.length})` : ""}</h2>
    ${
      inspections.length === 0
        ? `<p class="empty">No inspections recorded yet.</p>`
        : `<table>
      <thead><tr><th>Date</th><th>Score</th><th>Result</th><th>Comments</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </section>`;
}

function caToneFor(status: CorrectiveAction["status"]): "good" | "warn" | "bad" {
  if (status === "closed") return "good";
  if (status === "overdue") return "bad";
  return "warn";
}

function correctiveActionSection(actions: CorrectiveAction[], closedCount: number): string {
  const rows = actions
    .slice(0, 40)
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.reason)}</td>
        <td>${formatDate(c.createdAt)}</td>
        <td>${formatDate(c.closedAt)}</td>
        <td>${statusBadge(c.status, caToneFor(c.status))}</td>
      </tr>`,
    )
    .join("");
  return `<section>
    <h2>Corrective actions ${actions.length > 0 ? `(${closedCount}/${actions.length} closed)` : ""}</h2>
    ${
      actions.length === 0
        ? `<p class="empty">No corrective actions have been raised against your work.</p>`
        : `<table>
      <thead><tr><th>Reason</th><th>Raised</th><th>Closed</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </section>`;
}

function attendanceSection(days: AttendanceDay[], totalMinutes: number): string {
  const worked = days.filter((d) => d.clockInAt);
  const rows = worked
    .slice(0, 60)
    .map(
      (d) => `<tr>
        <td>${formatDate(d.workDate)}</td>
        <td>${d.clockInAt ? new Date(d.clockInAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        <td>${d.clockOutAt ? new Date(d.clockOutAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        <td>${formatHours(d.workedMinutes)}</td>
        <td>${d.exceptions.length > 0 ? statusBadge(d.exceptions.join(", "), "warn") : ""}</td>
      </tr>`,
    )
    .join("");
  return `<section>
    <h2>Attendance (last 90 days${worked.length > 0 ? ` &middot; ${formatHours(totalMinutes)} total` : ""})</h2>
    ${
      worked.length === 0
        ? `<p class="empty">No attendance records in this window.</p>`
        : `<table>
      <thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </section>`;
}
