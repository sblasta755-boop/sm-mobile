import {
  buildManagementReport,
  localDayKey,
  longDate,
  recordStatus,
  reportFilterOptions,
  SITE_WIDE_AREA,
  stamp,
} from "./managementReport";
import type { Evidence, Inspection, Task } from "@/types/smartclean";

const DAY = "2026-10-09";
const at = (hhmm: string) => new Date(`2026-10-09T${hhmm}:00`).toISOString();

const task = (over: Partial<Task>): Task =>
  ({
    id: "t1",
    siteId: "s1",
    locationId: "loc",
    title: "Kitchen Area (Opening)",
    status: "approved",
    scheduledAt: at("12:00"),
    assigneeId: "u1",
    supervisorId: "u2",
    checklist: [],
    evidence: [],
    ...over,
  }) as unknown as Task;

const photo = (id: string, itemId: string | null, kind: Evidence["kind"] = "evidence"): Evidence =>
  ({ id, kind, checklistItemId: itemId, label: id, capturedAt: at("06:00"), device: "x", imgSeed: 1 }) as Evidence;

const base = {
  site: { id: "s1", name: "Doppio Zero Hazelwood", address: "567 Grey Drive" },
  date: DAY,
  users: [
    { id: "u1", name: "Kat Hopewell" },
    { id: "u2", name: "Kgaugelo Adams" },
  ],
};

describe("date helpers", () => {
  it("reads the local day and prints long and short stamps", () => {
    expect(localDayKey(at("23:30"))).toBe(DAY);
    expect(longDate(DAY)).toBe("09 October 2026");
    expect(stamp(at("18:56"))).toBe("09 Oct 2026, 18:56");
    expect(stamp(null)).toBeNull();
  });
  it("names record statuses plainly", () => {
    expect(recordStatus("resubmitted")).toBe("Submitted");
    expect(recordStatus("rework_required")).toBe("Rework");
  });
});

describe("buildManagementReport", () => {
  const checklist = [
    { id: "a", label: "Fridge Temperature Check", type: "photo_required", done: true, photoCount: 1, sectionName: "Hot Section" },
    { id: "b", label: "Make Sure Clean & Ready", type: "checkbox", done: true, sectionName: "Prep" },
    { id: "n", label: "Notes", type: "note", done: false },
  ];

  it("only reports this site and this day, never hourly rounds", () => {
    const tasks = [
      task({ id: "keep" }),
      task({ id: "other-site", siteId: "s2" }),
      task({ id: "other-day", scheduledAt: new Date("2026-10-08T12:00:00").toISOString() }),
      task({ id: "round", isHourlyCompliance: true }),
    ];
    expect(buildManagementReport({ ...base, tasks, inspections: [] }).sections.map((s) => s.task.id)).toEqual(["keep"]);
  });

  it("filters by tag, ignoring case, and keeps a task that has any of several tags", () => {
    const tasks = [
      task({ id: "open", title: "A", tags: ["Opening"] }),
      task({ id: "close", title: "B", tags: ["Closing", "Daily"] }),
      task({ id: "none", title: "C" }),
    ];
    const ids = (tags: string[]) =>
      buildManagementReport({ ...base, tasks, inspections: [], tags }).sections.map((s) => s.task.id);
    expect(ids(["opening"])).toEqual(["open"]);
    expect(ids(["Daily"])).toEqual(["close"]);
    expect(ids(["Opening", "Closing"])).toEqual(["open", "close"]); // ordered by task title
    expect(ids([])).toHaveLength(3);
  });

  it("filters by area, including whole-site tasks, and combines with tags", () => {
    const tasks = [
      task({ id: "k", title: "A", locationId: "kitchen", locationName: "Kitchen", tags: ["Opening"] }),
      task({ id: "b", title: "B", locationId: "bar", locationName: "Bar", tags: ["Opening"] }),
      task({ id: "w", title: "C", locationId: null as never, isSiteWide: true, tags: ["Closing"] }),
    ];
    const ids = (areaIds: string[], tags: string[] = []) =>
      buildManagementReport({ ...base, tasks, inspections: [], areaIds, tags }).sections.map((s) => s.task.id);
    expect(ids(["kitchen"])).toEqual(["k"]);
    expect(ids([SITE_WIDE_AREA])).toEqual(["w"]);
    expect(ids(["kitchen", "bar"], ["Opening"])).toEqual(["k", "b"]);
    expect(ids(["bar"], ["Closing"])).toEqual([]);
  });

  it("offers only the tags and areas that have work that day", () => {
    const tasks = [
      task({ id: "k", locationId: "kitchen", locationName: "Kitchen", tags: ["Opening", "opening"] }),
      task({ id: "w", locationId: null as never, isSiteWide: true, tags: ["Closing"] }),
      task({ id: "off", locationId: "x", locationName: "Elsewhere", tags: ["Nope"], siteId: "s2" }),
    ];
    const options = reportFilterOptions(tasks, "s1", DAY);
    expect(options.tags).toEqual(["Closing", "Opening"]);
    expect(options.areas).toEqual([
      { id: "kitchen", label: "Kitchen" },
      { id: SITE_WIDE_AREA, label: "Whole site" },
    ]);
  });

  it("counts checks, ignores notes, and ties photos to their own item", () => {
    const t = task({ checklist: checklist as never, evidence: [photo("p1", "a"), photo("loose", null, "after")] });
    const r = buildManagementReport({ ...base, tasks: [t], inspections: [] });
    expect(r.kpis).toMatchObject({ checksDone: 2, checksTotal: 2 });
    const [fridge, prep] = r.sections[0].checks;
    expect(fridge).toMatchObject({ section: "Hot Section", photoStatus: "Captured in app" });
    expect(fridge.photos.map((p) => p.id)).toEqual(["p1"]);
    expect(prep).toMatchObject({ section: "Prep", photoStatus: "Not required", photos: [] });
    expect(r.sections[0].taskPhotos.map((p) => p.id)).toEqual(["loose"]); // not owned by an item
  });

  it("says a required photo was not captured", () => {
    const t = task({ checklist: checklist as never, evidence: [] });
    expect(buildManagementReport({ ...base, tasks: [t], inspections: [] }).sections[0].checks[0].photoStatus).toBe(
      "Not captured",
    );
  });

  it("scores from the inspection, averages, and lists outstanding work", () => {
    const tasks = [
      task({ id: "a", title: "Bar", checklist: [{ id: "x", label: "x", type: "checkbox", done: true }] as never }),
      task({ id: "b", title: "Back-Office", status: "assigned", checklist: [{ id: "y", label: "y", type: "checkbox", done: false }, { id: "z", label: "z", type: "checkbox", done: false }] as never }),
    ];
    const inspections = [
      { id: "i", taskId: "a", status: "passed", score: 85, createdAt: at("07:00"), inspectorId: "u2" } as Inspection,
    ];
    const r = buildManagementReport({ ...base, tasks, inspections });
    expect(r.areas).toEqual([
      { area: "Back-Office", visibleChecks: "2 not complete", score: "Not scored", status: "Assigned" },
      { area: "Bar", visibleChecks: "1 complete", score: "85 / 100", status: "Approved" },
    ]);
    expect(r.totals).toMatchObject({ checksDone: 1, checksTotal: 3, outstanding: 2, areas: 2, meanScore: 85 });
    expect(r.inspectors).toEqual(["Kgaugelo Adams"]);
    expect(r.sections.find((s) => s.task.id === "a")?.outcome).toBe("Passed");
  });

  it("reports how it started and the location proof it really has", () => {
    const scanned = task({
      qrVerified: true,
      startedAt: at("05:30"),
      metadata: { roomQrVerification: { geofenceVerified: true, distanceMeters: 18.4 } },
    });
    const manual = task({ id: "m", startMethod: "manual", startedAt: at("05:31") });
    const unknown = task({ id: "u", startedAt: at("05:32") });
    const r = buildManagementReport({ ...base, tasks: [scanned, manual, unknown], inspections: [] });
    const byId = (id: string) => r.sections.find((s) => s.task.id === id)!.verification;
    expect(byId("t1")).toContainEqual({ label: "Started by", value: "Room QR scan" });
    expect(byId("t1")).toContainEqual({ label: "Location proof", value: "Within the site boundary (18 m)" });
    expect(byId("m")).toContainEqual({ label: "Location proof", value: "Not required (manual start)" });
    expect(byId("u")).toContainEqual({ label: "Location proof", value: "Not recorded" }); // no reassuring default
  });

  it("gives the time window from first start to last finish", () => {
    const tasks = [
      task({ id: "a", title: "A", startedAt: at("05:30"), approvedAt: at("05:40") }),
      task({ id: "b", title: "B", startedAt: at("05:32"), submittedAt: at("05:35") }),
    ];
    expect(buildManagementReport({ ...base, tasks, inspections: [] }).timeLabel).toBe("05:30 - 05:40");
    expect(buildManagementReport({ ...base, tasks: [], inspections: [] }).timeLabel).toBe("-");
  });
});
