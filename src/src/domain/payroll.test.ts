import type { PayPerson, PayRun } from "@/api/client";
import { buildInvoicesHtml, buildSummaryHtml, dayDetailCsv, formatDays, formatHours, formatMoney, payBreakdown, payeeStatements, buildPayeeStatementsHtml, summaryCsv } from "./payroll";

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

describe("pay runs with flat fees and suppliers", () => {
  const mixed = {
    ...run,
    flatLines: [{ payee: "DJ <A>", group: "Service providers", description: "Friday", amount: "2500.00", fine: "100.00", net: "2400.00" }],
    supplierPayments: [{ payableId: "p1", amount: "500.00", payee: "Ice Co", description: "Ice", popEmail: "ap@ice.co" }],
    totals: {
      ...run.totals,
      gross: "3532.12",
      staffGross: "632.12",
      flat: { lines: 1, gross: "2500.00", fines: "100.00", net: "2400.00", byGroup: { "Service providers": "2400.00" } },
      suppliers: { lines: 1, total: "500.00", byPayee: { "Ice Co": "500.00" } },
    },
  } as unknown as PayRun;

  it("leaves an attendance-only run unchanged", () => {
    expect(payBreakdown(run)).toEqual([]);
    expect(buildSummaryHtml(run, { brandName: "B", logoUrl: null, generatedLabel: "" })).not.toContain("Total payable");
  });
  it("breaks the total down by staff, each fee group and suppliers", () => {
    expect(payBreakdown(mixed).map((b) => b.label)).toEqual([
      "Staff (attendance)", "Service providers", "Suppliers", "Fines already taken off above", "Total payable",
    ]);
    expect(payBreakdown(mixed).at(-1)?.amount).toBe("3532.12");
  });
  it("prints flat fees and suppliers in the summary, escaped, and adds them to the CSV", () => {
    const html = buildSummaryHtml(mixed, { brandName: "B", logoUrl: null, generatedLabel: "" });
    expect(html).toContain("DJ &lt;A&gt;");
    expect(html).toContain("ap@ice.co");
    expect(html).toContain("R 3,532.12");
    const lines = summaryCsv(mixed).split("\n");
    expect(lines).toHaveLength(5); // header, person, DJ, supplier, total
    expect(lines[2]).toContain("DJ <A> (Service providers)");
  });
  it("prints a flat-fee-only run without an empty staff table", () => {
    const html = buildSummaryHtml({ ...mixed, people: [] } as unknown as PayRun, { brandName: "B", logoUrl: null, generatedLabel: "" });
    expect(html).not.toContain("<th>Rate / h</th>");
    expect(html).toContain("Amounts as entered.");
  });
});

describe("flat-fee payee statements", () => {
  const r = {
    ...run,
    flatLines: [
      { id: "a", payee: "DJ <A>", group: "Service providers", description: "Fri", amount: "2500.00", fine: "100.00", net: "2400.00" },
      { id: "b", payee: "dj <a>", group: "Service providers", description: "Sat", amount: "1000.10", fine: "0.00", net: "1000.10" },
      { id: "c", payee: "MC B", group: "Service providers", description: "", amount: "1400.00", fine: "0.00", net: "1400.00" },
    ],
  } as unknown as PayRun;
  it("groups by payee ignoring case and sums exactly in cents", () => {
    const st = payeeStatements(r);
    expect(st.map((s) => s.payee)).toEqual(["DJ <A>", "MC B"]);
    expect(st[0]).toMatchObject({ amount: "3500.10", fine: "100.00", net: "3400.10" });
  });
  it("prints one escaped page per payee, showing fines only when there are some", () => {
    const html = buildPayeeStatementsHtml(r, payeeStatements(r), { brandName: "B", logoUrl: null, generatedLabel: "" });
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html).toContain("DJ &lt;A&gt;");
    expect(html).toContain("R 3,400.10");
    expect(html.split("Fines</span>")).toHaveLength(2);
  });
});
