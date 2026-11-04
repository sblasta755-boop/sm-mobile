import { groupByRole, groupBySite, sitesText, teamStatusLine, teamSummary } from "./teamGroups";

const person = (id: string, name: string, role: string, siteIds: string[] = [], status?: string) => ({ id, name, role, siteIds, status });
const sites = [
  { id: "s1", name: "Nathi HQ" },
  { id: "s2", name: "Sandton office", ownerId: "monti" },
  { id: "s3", name: "Empty site" },
];
const team = [
  person("flag", "Flag", "operations_manager"),
  person("monti", "Monti", "operations_manager"),
  person("harold", "Harold", "site_manager", ["s1"]),
  person("wesley", "Wesley", "site_manager", ["s2"]),
  person("drama", "Supervisor Drama", "supervisor", ["s1"]),
  person("tebogo", "Tebogo Nyoni", "kitchen", ["s1", "s2"]),
  person("zane", "Zane", "cleaner", [], "Pending Activation"),
];

test("the head count splits into managers, supervisors and field staff", () => {
  const s = teamSummary(team);
  expect(s).toMatchObject({ total: 7, managers: 4, supervisors: 1, field: 2, auditors: 0, pending: 1, inactive: 0 });
  expect(teamStatusLine(s)).toBe("1 waiting to sign in");
  expect(teamStatusLine(teamSummary(team.slice(0, 2)))).toBe("all active");
});

test("roles come top down, then field roles by name, with their own plural", () => {
  const groups = groupByRole(team, (r) => (r === "kitchen" ? "Kitchen" : undefined));
  expect(groups.map((g) => g.title)).toEqual(["Operations managers", "Site managers", "Supervisors", "Cleaners", "Kitchen"]);
  expect(groups[0].people.map((p) => p.name)).toEqual(["Flag", "Monti"]);
});

test("by site: managers across sites, a group per staffed site, and the unlinked", () => {
  const g = groupBySite(team, sites);
  expect(g.acrossSites.map((p) => p.id)).toEqual(["flag", "monti"]);
  expect(g.sites.map((s) => s.site.name)).toEqual(["Nathi HQ", "Sandton office"]);
  expect(g.sites[0].sections.map((s) => [s.title, s.people.map((p) => p.id)])).toEqual([
    ["Runs it", ["harold"]],
    ["Supervises", ["drama"]],
    ["On the floor", ["tebogo"]],
  ]);
  // Someone at two sites is in both.
  expect(g.sites[1].people.map((p) => p.id)).toEqual(["wesley", "tebogo"]);
  expect(g.noSite.map((p) => p.id)).toEqual(["zane"]);
});

test("an operations manager's sites include the ones they own", () => {
  expect(sitesText(team[1], sites)).toBe("Sandton office");
  expect(sitesText(team[0], sites)).toBe("No site yet");
  expect(sitesText(person("a", "A", "org_admin"), sites)).toBe("All sites");
  expect(sitesText(person("b", "B", "cleaner", ["s1", "s2", "s3"]), sites)).toBe("Nathi HQ and 2 more");
});
