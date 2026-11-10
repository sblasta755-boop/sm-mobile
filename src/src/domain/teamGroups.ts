/**
 * How the Team screen groups people: a head count split into managers, supervisors and field staff, and the same people
 * grouped by role or by site. Pure functions, so the phone app and the web console (a copy of this file in
 * smart-property-operations/src/src/lib/smartclean/teamGroups.ts) group a team the same way.
 *
 * Where someone works: an organisation admin covers every site; an operations manager holds sites through Site.ownerId
 * (and sometimes siteIds too); everyone else through siteIds.
 */

export type TeamPerson = { id: string; name: string; role: string; siteIds: string[]; status?: string };
export type TeamSite = { id: string; name: string; ownerId?: string | null; ownerIds?: string[] };

/** Every operations manager who owns a site; the legacy single ownerId is folded in. */
export function siteOwnerIds(site: { ownerId?: string | null; ownerIds?: string[] }): string[] {
  const ids = [...(site.ownerIds ?? [])];
  if (site.ownerId && !ids.includes(site.ownerId)) ids.push(site.ownerId);
  return ids;
}

/** Management roles, top down. Any other role is a field-staff role (cleaner, waiter, kitchen...). */
const MANAGEMENT_ORDER = ["org_admin", "operations_manager", "site_manager", "supervisor", "client_auditor"];

const MANAGEMENT_PLURAL: Record<string, string> = {
  org_admin: "Organisation admins",
  operations_manager: "Operations managers",
  site_manager: "Site managers",
  supervisor: "Supervisors",
  client_auditor: "Client auditors",
};

/** Roles that cover more than one site, shown together above the sites in the By site view. */
const ACROSS_SITES = ["org_admin", "operations_manager"];

export type TeamTier = "managers" | "supervisors" | "field" | "auditors";

export function teamTier(role: string): TeamTier {
  if (role === "supervisor") return "supervisors";
  if (role === "client_auditor") return "auditors";
  if (MANAGEMENT_ORDER.includes(role)) return "managers";
  return "field";
}

export function statusOf(person: { status?: unknown }): string {
  return typeof person.status === "string" && person.status ? person.status : "Active";
}

export function isPending(person: { status?: unknown }): boolean {
  return statusOf(person) === "Pending Activation";
}

export type TeamSummary = Record<TeamTier, number> & { total: number; pending: number; inactive: number };

export function teamSummary(people: TeamPerson[]): TeamSummary {
  const s: TeamSummary = { total: people.length, managers: 0, supervisors: 0, field: 0, auditors: 0, pending: 0, inactive: 0 };
  for (const p of people) {
    s[teamTier(p.role)] += 1;
    const status = statusOf(p);
    if (status === "Pending Activation") s.pending += 1;
    else if (status !== "Active") s.inactive += 1;
  }
  return s;
}

/** "all active", or what is not: "2 waiting to sign in · 1 inactive". */
export function teamStatusLine(s: TeamSummary): string {
  if (s.total === 0) return "nobody yet";
  const parts = [];
  if (s.pending) parts.push(`${s.pending} waiting to sign in`);
  if (s.inactive) parts.push(`${s.inactive} inactive`);
  return parts.length ? parts.join(" · ") : "all active";
}

/** The plural heading for a role group; field roles use their own plural (from the staff role, else role + "s"). */
export function rolePlural(role: string, fieldPlural?: (role: string) => string | undefined): string {
  return MANAGEMENT_PLURAL[role] ?? fieldPlural?.(role) ?? `${role.replace(/_/g, " ")}s`.replace(/^./, (c) => c.toUpperCase());
}

const byName = <P extends TeamPerson>(a: P, b: P) =>
  Number(isPending(b)) - Number(isPending(a)) || a.name.localeCompare(b.name);

export type RoleGroup<P> = { role: string; title: string; people: P[] };

/** One group per role: management top down, then the field roles by name. Waiting-to-sign-in people first in each. */
export function groupByRole<P extends TeamPerson>(people: P[], fieldPlural?: (role: string) => string | undefined): RoleGroup<P>[] {
  const map = new Map<string, P[]>();
  for (const p of people) map.set(p.role, [...(map.get(p.role) ?? []), p]);
  const rank = (role: string) => {
    const i = MANAGEMENT_ORDER.indexOf(role);
    return i === -1 ? MANAGEMENT_ORDER.length : i;
  };
  return [...map.entries()]
    .map(([role, ps]) => ({ role, title: rolePlural(role, fieldPlural), people: [...ps].sort(byName) }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.title.localeCompare(b.title));
}

/** The sites a person works at. Empty for an organisation admin, who covers all of them. */
export function sitesOf(person: TeamPerson, sites: TeamSite[]): TeamSite[] {
  if (person.role === "org_admin") return [];
  return sites.filter(
    (site) => person.siteIds.includes(site.id) || (person.role === "operations_manager" && siteOwnerIds(site).includes(person.id)),
  );
}

/** "All sites", "Nathi HQ", "Nathi HQ, Sandton" or "Nathi HQ and 3 more". */
export function sitesText(person: TeamPerson, sites: TeamSite[]): string {
  if (person.role === "org_admin") return "All sites";
  const names = sitesOf(person, sites).map((s) => s.name);
  if (names.length === 0) return "No site yet";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} and ${names.length - 1} more`;
}

export type SiteSectionKey = "runs" | "supervises" | "floor" | "audits";
export const SITE_SECTION_TITLE: Record<SiteSectionKey, string> = {
  runs: "Runs it",
  supervises: "Supervises",
  floor: "On the floor",
  audits: "Audits",
};

function sectionOf(role: string): SiteSectionKey {
  const tier = teamTier(role);
  if (tier === "supervisors") return "supervises";
  if (tier === "auditors") return "audits";
  if (tier === "field") return "floor";
  return "runs";
}

export type SiteGroup<P> = {
  site: TeamSite;
  people: P[];
  sections: { key: SiteSectionKey; title: string; people: P[] }[];
};

export type BySite<P> = { acrossSites: P[]; sites: SiteGroup<P>[]; noSite: P[] };

/**
 * Admins and operations managers together (they cover several sites), then a group per site with who runs it,
 * supervises it, works on the floor and audits it, then anyone not linked to a site yet. Someone at two sites is in
 * both. Sites with nobody at them are left out.
 */
export function groupBySite<P extends TeamPerson>(people: P[], sites: TeamSite[]): BySite<P> {
  const acrossSites = people.filter((p) => ACROSS_SITES.includes(p.role)).sort(byName);
  const rest = people.filter((p) => !ACROSS_SITES.includes(p.role));
  const groups: SiteGroup<P>[] = [];
  for (const site of [...sites].sort((a, b) => a.name.localeCompare(b.name))) {
    const here = rest.filter((p) => p.siteIds.includes(site.id)).sort(byName);
    if (here.length === 0) continue;
    const sections = (Object.keys(SITE_SECTION_TITLE) as SiteSectionKey[])
      .map((key) => ({ key, title: SITE_SECTION_TITLE[key], people: here.filter((p) => sectionOf(p.role) === key) }))
      .filter((s) => s.people.length > 0);
    groups.push({ site, people: sections.flatMap((x) => x.people), sections });
  }
  const known = new Set(sites.map((s) => s.id));
  const noSite = rest.filter((p) => !p.siteIds.some((id) => known.has(id))).sort(byName);
  return { acrossSites, sites: groups, noSite };
}
