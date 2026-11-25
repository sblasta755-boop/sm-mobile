import {
  buildNotificationReportHtml,
  escapeHtml,
  notificationReportName,
  type NotificationReportData,
} from "./notificationReportHtml";

const overview = {
  days: 7,
  since: "2026-11-18",
  bucket: "day",
  totals: {
    total: 1200,
    targeted: 1000,
    broadcast: 200,
    recipients: 40,
    perHour: 7.1,
    readRate: 0.6,
    previous: 1000,
    change: 0.2,
  },
  series: [
    { t: "2026-11-18", count: 100 },
    { t: "2026-11-19", count: 300 },
  ],
  byCategory: [{ category: "table service", count: 800, share: 0.66, readRate: 0.5 }],
  bySeverity: [],
  byOrganisation: [{ tenantId: "t1", name: "Cafe <One>", count: 1200, share: 1 }],
  bursts: [],
  burstThreshold: 10,
  fanOut: [],
  repeats: { groups: 3, notifications: 20, categories: [] },
  channels: {
    push: { sent: 5, failed: 1, suppressed: 2 },
    web_push: { sent: 0, failed: 0, suppressed: 0 },
    email: { sent: 3, failed: 0, suppressed: 0 },
  },
  suppressed: { duplicate: 4, burst: 2 },
  deliveryLogSince: null,
  insights: [
    { id: "a", severity: "info", title: "Quiet", detail: "d", recommendation: "r" },
    { id: "b", severity: "critical", title: "Too many", detail: "d", recommendation: "Lower it" },
  ],
  guard: { enabled: true, dedupeWindowMinutes: 2, pushPerRecipientPerHour: 12, bounds: [] },
} as unknown as NotificationReportData["overview"];

const data: NotificationReportData = {
  overview,
  people: [],
  roles: [],
  templates: [],
  scope: "All organisations",
  generatedAt: new Date("2026-11-25T10:00:00Z"),
};

describe("notification report", () => {
  it("escapes text so a name cannot break the page", () => {
    expect(escapeHtml(`<b>"x" & y</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
    expect(buildNotificationReportHtml(data)).toContain("Cafe &lt;One&gt;");
  });

  it("puts the most severe insight first and says what to do", () => {
    const html = buildNotificationReportHtml(data);
    expect(html.indexOf("Too many")).toBeLessThan(html.indexOf("Quiet"));
    expect(html).toContain("Recommendation: Lower it");
  });

  it("survives empty lists and a quiet period", () => {
    const html = buildNotificationReportHtml({
      ...data,
      overview: { ...overview, series: [], insights: [], byCategory: [] },
    });
    expect(html).toContain("No notifications in this period.");
    expect(html).toContain("Nothing unusual in this period.");
  });

  it("names the file after the scope, the range and the day", () => {
    expect(notificationReportName("Cafe One (Pty) Ltd", 30, new Date("2026-11-25T10:00:00Z"))).toBe(
      "notification-report-cafe-one-pty-ltd-30-days-2026-11-25",
    );
  });
});

describe("report without history", () => {
  it("shows a dash instead of 'new' on every row and caps the insights", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, severity: "info", title: `Insight ${i}`, detail: "d", recommendation: "r" }));
    const html = buildNotificationReportHtml({
      ...data,
      overview: { ...overview, totals: { ...overview.totals, previous: 0, change: null }, insights: many } as NotificationReportData["overview"],
      templates: [{ category: "tasks", title: "Hello", example: "Hello", message: "", count: 5, recipients: 1, organisations: 1, share: 1, readRate: 0, previous: 0, change: null }],
    });
    expect(html).toContain("no earlier period to compare");
    expect(html).not.toContain(">new<");
    expect(html).toContain("4 lower-priority insights not shown");
  });
});
