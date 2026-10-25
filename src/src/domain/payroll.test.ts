import type { PayPerson, PayRun } from "@/api/client";
import { buildInvoicesHtml, buildSummaryHtml, dayDetailCsv, formatDays, formatHours, formatMoney, summaryCsv } from "./payroll";

const person = {
  userId: "u1",
  name: 'Ann "A" <Cleaner>',
  hasRate: true,
  rate: "13.23",
  daysCounted: "5.5",
  daysExcluded: 1,
  paidHours: "44.00",
  earned: "582.12",
  adjustments: [{ label: "Bonus", amount: "50" }],
  adjustmentTotal: "50.00",
  gross: "632.12",
  days: [
    { dayId: "d1", date: "2026-10-01", clockInAt: null, clockOutAt: null, workedMinutes: null, counted: true, reason: null, fraction: "1", multiplier: "1", baseHours: "8", paidHours: "8" },
    { dayId: "m1", manual: true, label: "Weekend cover", hoursEntered: null, date: null, clockInAt: null, clockOutAt: null, workedMinutes: null, counted: true, reason: null, fraction: "0.5", multiplier: "1", baseHours: "4", paidHours: "4" },
    { dayId: "d2", date: "2026-10-02", clockInAt: null, clockOutAt: null, workedMinutes: null, counted: false, reason: "Not approved in the Timesheet yet", fraction: "0", multiplier: "1", baseHours: "0", paidHours: "0" },
  ],
} as unknown as PayPerson;

const run = {
  id: "pay_1",
  title: "October",
  currency: "ZAR",
  status: "draft",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  siteNames: ["Central Mall"],
  ruleDescription: "Each counted day pays a standard day of 8 hours; approved days only.",
  totals: { people: 1, daysCounted: "5.5", daysExcluded: 1, paidHours: "44.00", earned: "582.12", adjustments: "50.00", gross: "632.12" },
  createdByName: "Naledi",
  finalisedByName: null,
  notes: null,
  people: [person],
} as unknown as PayRun;

describe("pay run wording and documents", () => {
  it("formats money, hours and days", () => {
    expect(formatMoney("1693.44")).toBe("R 1,693.44");
    expect(formatMoney(1234567.5, "USD")).toBe("$ 1,234,567.50");
    expect(formatMoney("abc")).toBe("R 0.00");
    expect(formatHours("7.50")).toBe("7.5 h");
    expect(formatDays("5.00")).toBe("5");
  });
  it("builds the summary CSV with a total row and quoted names", () => {
    const lines = summaryCsv(run).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('"Ann ""A"" <Cleaner>","5.5","1","44","13.23","582.12","50","632.12"');
    expect(lines[2].startsWith('"Total"')).toBe(true);
  });
  it("lists every day, saying why a day was not counted and which were typed in", () => {
    const rows = dayDetailCsv(run).split("\n");
    expect(rows).toHaveLength(4);
    expect(rows[2]).toContain("Entered by hand: Weekend cover");
    expect(rows[3]).toContain("Not approved in the Timesheet yet");
  });
  it("escapes names in the documents and marks a draft", () => {
    const o = { brandName: "Šoma360", logoUrl: null, generatedLabel: "25 OCTOBER 2026" };
    const summary = buildSummaryHtml(run, o);
    expect(summary).toContain("Ann &quot;A&quot; &lt;Cleaner&gt;");
    expect(summary).not.toContain("<Cleaner>");
    expect(summary).toContain("DRAFT - NOT FINAL");
    expect(summary).toContain("R 632.12");
    const invoices = buildInvoicesHtml({ ...run, status: "final" }, [person, { ...person, name: "Bob" }], o);
    expect(invoices.match(/class="page"/g)).toHaveLength(2);
    expect(invoices).not.toContain("DRAFT");
    expect(invoices).toContain("Weekend cover");
  });
});
