import { categoriesInUse, filterContractors, orderContractors, telLink, usageText, whatsappLink } from "./maintenanceContractors";

const c = (over: Record<string, unknown> = {}) => ({
  name: "Spark Electrical", contactPerson: "Thabo", phone: "082 123 4567", categories: ["Electrical"], notes: null,
  preferred: false, active: true, jobs: 0, openJobs: 0, ...over,
});

test("phone links", () => {
  expect(telLink("082 123 4567")).toBe("tel:0821234567");
  expect(telLink("12")).toBeNull();
  expect(whatsappLink("082 123 4567")).toBe("https://wa.me/27821234567");
  expect(whatsappLink("+44 7700 900123")).toBe("https://wa.me/447700900123");
  expect(whatsappLink("abc")).toBeNull();
});

test("search and filter, ignoring case and accents", () => {
  const list = [c(), c({ name: "Pipe Dream", categories: ["Plumbing"], notes: "Weekend callouts" }), c({ name: "Šoma Sound", categories: ["Sound & lighting"] })];
  expect(filterContractors(list, "pipe", null)).toHaveLength(1);
  expect(filterContractors(list, "weekend", null)[0].name).toBe("Pipe Dream");
  expect(filterContractors(list, "soma", null)[0].name).toBe("Šoma Sound");
  expect(filterContractors(list, "", "plumbing")).toHaveLength(1);
});

test("kinds of work in use, most common first; preferred first and archived last", () => {
  expect(categoriesInUse([c(), c({ categories: ["electrical", "Plumbing"] })])).toEqual([{ name: "Electrical", count: 2 }, { name: "Plumbing", count: 1 }]);
  const ordered = orderContractors([c({ name: "Zed" }), c({ name: "Alpha", active: false }), c({ name: "Mid", preferred: true })]);
  expect(ordered.map((x) => x.name)).toEqual(["Mid", "Zed", "Alpha"]);
});

test("usage in words", () => {
  expect(usageText({ jobs: 0, openJobs: 0 })).toBe("Not used yet");
  expect(usageText({ jobs: 4, openJobs: 2 })).toBe("4 jobs · 2 open");
});
