import { buildManagementReport } from "./managementReport";
import { buildManagementReportHtml, esc } from "./managementReportHtml";
import type { Task } from "@/types/smartclean";

const DAY = "2026-10-09";
const at = (hhmm: string) => new Date(`2026-10-09T${hhmm}:00`).toISOString();

const task = {
  id: "t1",
  siteId: "s1",
  locationId: "loc",
  locationName: "Kitchen",
  title: "Kitchen <Opening> & Prep",
  status: "approved",
  scheduledAt: at("12:00"),
  assigneeId: "u1",
  supervisorId: "u2",
  score: 92,
  checklist: [
    { id: "a", label: "Fridge \"temp\" check", type: "photo_required", done: true, photoCount: 1, sectionName: "Cold" },
  ],
  evidence: [{ id: "p1", kind: "evidence", checklistItemId: "a", label: "Fridge", capturedAt: at("06:00"), device: "x", imgSeed: 1, filePath: "uploads/p1.jpg" }],
} as unknown as Task;

const report = buildManagementReport({
  site: { id: "s1", name: "Doppio <Zero>", address: "567 Grey Drive" },
  date: DAY,
  tasks: [task],
  inspections: [],
  users: [{ id: "u1", name: "Kat" }, { id: "u2", name: "Kgaugelo" }],
});

const render = (over: object = {}) =>
  buildManagementReportHtml({
    report,
    reportName: "Daily Opening Procedure",
    clientName: "Doppio Zero",
    clientLogoUrl: null,
    generatedAtLabel: "09 OCTOBER 2026 | 05:35",
    reviewerName: "Kgaugelo Adams",
    reviewDateLabel: "09 October 2026",
    photoSrc: (photo) => (photo.filePath ? `https://files.example/${photo.filePath}` : null),
    ...over,
  });

describe("buildManagementReportHtml", () => {
  it("escapes everything that came from a person", () => {
    expect(esc(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const html = render();
    expect(html).not.toContain("<Opening>");
    expect(html).toContain("Kitchen &lt;Opening&gt; &amp; Prep");
    expect(html).toContain("Fridge &quot;temp&quot; check");
    expect(html).toContain("Doppio &lt;Zero&gt;");
  });

  it("prints the cover, the overview, the task section and the review", () => {
    const html = render();
    for (const text of [
      "DAILY OPENING PROCEDURE REPORT",
      "Overview Results",
      "Operational checklist",
      "Verification chain",
      "Approval &amp; completion record",
      "Kgaugelo Adams (09 October 2026)",
      "Total areas: 1",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("embeds the photo against its own checklist item", () => {
    expect(render()).toContain('src="https://files.example/uploads/p1.jpg"');
    expect(render({ photoSrc: () => null })).toContain("No image");
  });

  it("shows the client's logo, or its name when it has none", () => {
    expect(render({ clientLogoUrl: "https://files.example/logo.png" })).toContain('src="https://files.example/logo.png"');
    expect(render()).toContain('class="clientname">Doppio Zero');
  });

  it("carries the Šoma360 lockup as one embedded image, never as loose text", () => {
    const html = render();
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain('alt="Šoma360"');
    expect(html).not.toContain("SMART FACILITIES");
  });
});
