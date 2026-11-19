import { flattenDoc } from "./reportDoc";
import { buildMaintenanceReport, rand, type McJob, type MaintenanceReportInput } from "./maintenanceReports";

const job = (over: Partial<McJob>): McJob => ({
  id: "job_aaaaaa111111",
  siteId: "s1",
  locationId: "l1",
  assetLabel: "Handwash basin",
  title: "Basement flood",
  description: "Water under the basin",
  severity: "high",
  reporterId: "u1",
  handlerId: "u2",
  path: "contractor",
  state: "awaiting_approval",
  contractorId: "c1",
  approvedAmount: null,
  visitAt: null,
  finalCost: null,
  evidence: [],
  createdAt: "2026-11-06T20:10:00Z",
  updatedAt: "2026-11-06T22:00:00Z",
  closedAt: null,
  approval: "pending",
  activeHolds: 0,
  ...over,
});

const base: MaintenanceReportInput = {
  kind: "register",
  siteName: "Drama Bar",
  today: "2026-11-18",
  nowIso: "2026-11-18T10:00:00Z",
  start: "2026-11-01",
  end: "2026-11-30",
  jobs: [],
  people: { u1: "Wesley", u2: "Naledi" },
  locations: { l1: "Main bar" },
  contractors: { c1: "Ian the plumber", c2: "Spark Electrical" },
};

describe("rand", () => {
  it("formats rand with spaces and cents", () => {
    expect(rand(13723.6)).toBe("R13 723.60");
    expect(rand(0)).toBe("R0.00");
    expect(rand(null)).toBe("");
  });
});

describe("work-order report", () => {
  const full = job({
    state: "awaiting_verification",
    approvedAmount: 3400,
    finalCost: 3700,
    evidence: [{ filePath: "images/a.jpg", label: "Before" }],
    events: [
      { kind: "reported", actorName: "Wesley", message: "Basement flood", createdAt: "2026-11-06T20:10:00Z" },
      { kind: "state", actorName: "Naledi", message: "", createdAt: "2026-11-06T20:13:00Z", data: { to: "investigating" } },
      { kind: "quote_submitted", actorName: "Naledi", message: "Ian 3400", createdAt: "2026-11-06T20:30:00Z" },
      { kind: "quote_approved", actorName: "Boss", message: "", createdAt: "2026-11-06T20:40:00Z" },
      { kind: "state", actorName: "Naledi", message: "", createdAt: "2026-11-06T20:50:00Z", data: { to: "scheduled" } },
      { kind: "state", actorName: "Ian", message: "", createdAt: "2026-11-06T21:25:00Z", data: { to: "in_progress" } },
      { kind: "state", actorName: "Ian", message: "", createdAt: "2026-11-06T22:10:00Z", data: { to: "awaiting_verification" } },
    ],
    quotes: [{ contractorName: "Ian the plumber", reference: "Q1", amount: 3400, depositAmount: 0, revision: 1, status: "approved", createdAt: "2026-11-06T20:30:00Z" }],
    invoices: [{ contractorName: "Ian the plumber", kind: "invoice", number: "INV-1", amount: 3700, paidAmount: 0, balance: 3700, dueDate: "2026-11-10", state: "unpaid", popPendingAmount: 0 }],
  });
  const r = buildMaintenanceReport({ ...base, kind: "workorder", job: full, photoSrc: (p) => `/f/${p}` });

  it("builds the template sections", () => {
    expect(r.details.find((d) => d.k === "Priority")?.v).toBe("High");
    expect(r.details.find((d) => d.k === "Reported by")?.v).toContain("Wesley");
    expect(r.summary?.text).toBe("Water under the basin");
    expect(r.groups.map((g) => g.title)).toEqual(["Event timeline", "Quotations", "Invoices and payments", "Verification chain", "Outstanding actions"]);
    expect(r.groups[0].rows).toHaveLength(7);
    expect(r.groups[0].rows[1][1]).toBe("Looking into it");
    expect(r.photos?.items[0]).toEqual({ src: "/f/images/a.jpg", caption: "Before" });
    expect(r.callouts?.[0].title).toBe("Management decision");
  });
  it("measures response times and the money position", () => {
    expect(r.kpis[1]).toEqual({ label: "First response", value: "3 min" });
    expect(r.insights.join(" ")).toContain("R300.00 over the approved R3 400.00");
    expect(r.insights.join(" ")).toContain("R3 700.00 is outstanding");
    const todo = r.groups[4].rows.map((x) => x[0]).join("|");
    expect(todo).toContain("Inspect, accept and close the job");
    expect(todo).toContain("Pay invoice INV-1");
    expect(r.charts.map((c) => c.title)).toEqual(["Where the time went", "Cost position"]);
  });
  it("flattens mixed tables with a Section column", () => {
    const flat = flattenDoc(r);
    expect(flat.header[0]).toBe("Section");
    expect(flat.rows[0][0]).toBe("Event timeline");
    expect(flat.rows[0].slice(1, 4)).toEqual(["Date / time", "Event", "Actor / record"]);
  });
  it("without a job there is nothing to print", () => {
    expect(buildMaintenanceReport({ ...base, kind: "workorder", job: null }).groups).toEqual([]);
  });
});

describe("register", () => {
  const jobs = [
    job({ id: "a1", severity: "low", state: "completed", closedAt: "2026-11-08T10:00:00Z", approvedAmount: 500, finalCost: 450 }),
    job({ id: "a2", severity: "critical", state: "in_progress", createdAt: "2026-11-02T08:00:00Z" }),
    job({ id: "a3", state: "cancelled", path: "internal", contractorId: null }),
    job({ id: "old", createdAt: "2026-10-01T08:00:00Z" }),
  ];
  it("groups open, completed and closed, most urgent first, and leaves out other periods", () => {
    const r = buildMaintenanceReport({ ...base, jobs });
    expect(r.groups.map((g) => g.title)).toEqual(["Open jobs (1)", "Completed (1)", "Closed without repair (1)"]);
    expect(r.groups[0].rows[0][4]).toBe("Critical");
    expect(r.groups[0].rows[0][7]).toBe("16");
    expect(r.kpis[0].value).toBe("3");
    expect(r.insights.join(" ")).toContain("open more than 7 days");
    expect(r.charts.map((c) => c.title)).toContain("Jobs by status");
  });
  it("flags repeat trouble spots", () => {
    const many = [1, 2, 3].map((n) => job({ id: `r${n}` }));
    expect(buildMaintenanceReport({ ...base, jobs: many }).insights.join(" ")).toContain("Repeat trouble spots: Main bar / Handwash basin (3 jobs)");
  });
  it("empty period has no analysis", () => {
    const r = buildMaintenanceReport(base);
    expect(r.groups).toEqual([]);
    expect(r.charts).toEqual([]);
  });
});

describe("contractors", () => {
  it("totals jobs, speed and overruns per contractor", () => {
    const jobs = [
      job({ id: "1", state: "completed", closedAt: "2026-11-08T20:10:00Z", approvedAmount: 1000, finalCost: 1200 }),
      job({ id: "2", state: "completed", contractorId: "c2", closedAt: "2026-11-07T20:10:00Z", approvedAmount: 500, finalCost: 500 }),
      job({ id: "3", state: "in_progress" }),
      job({ id: "4", path: "internal", contractorId: null, state: "completed", closedAt: "2026-11-06T20:10:00Z" }),
    ];
    const r = buildMaintenanceReport({ ...base, kind: "contractors", jobs });
    const rows = r.groups[0].rows;
    expect(rows[0].slice(0, 5)).toEqual(["Ian the plumber", "2", "1", "1", "0"]);
    expect(rows[0][9]).toBe("1");
    expect(rows.map((x) => x[0])).toContain("Internal team");
    expect(r.insights.join(" ")).toContain("finished above the approved amount");
  });
});

describe("cost", () => {
  it("sorts by what is owed and flags overdue invoices", () => {
    const owing = job({ id: "o1", approvedAmount: 3400, finalCost: 3400 });
    const paid = job({ id: "p1", approvedAmount: 1000, finalCost: 1000, contractorId: "c2" });
    const details = [
      { ...owing, invoices: [{ contractorName: "Ian", kind: "invoice", number: "I1", amount: 3400, paidAmount: 0, balance: 3400, dueDate: "2026-11-10", state: "unpaid", popPendingAmount: 0 }] },
      { ...paid, invoices: [{ contractorName: "Spark", kind: "invoice", number: "I2", amount: 1000, paidAmount: 1000, balance: 0, dueDate: null, state: "paid", popPendingAmount: 0 }] },
    ];
    const r = buildMaintenanceReport({ ...base, kind: "cost", jobs: [owing, paid], details });
    expect(r.groups.map((g) => g.title)).toEqual(["Overdue (1)", "Settled (1)"]);
    expect(r.kpis[3].value).toBe("R3 400.00");
    expect(r.insights.join(" ")).toContain("past due");
    expect(r.charts.map((c) => c.title)).toContain("Money position");
  });
  it("says when details could not be read", () => {
    const r = buildMaintenanceReport({ ...base, kind: "cost", jobs: [job({ approvedAmount: 100 })], details: [] });
    expect(r.insights.join(" ")).toContain("could not be read in detail");
  });
});
