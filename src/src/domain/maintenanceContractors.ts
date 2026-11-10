import { fuzzyFilter } from "./fuzzySearch";
/** Contractor list helpers for the phone app. Mirrors the web console's lib/smartclean/maintenanceContractors.ts. */

type C = {
  name: string;
  contactPerson: string | null;
  phone: string | null;
  categories: string[];
  notes: string | null;
  preferred: boolean;
  active: boolean;
  jobs: number;
  openJobs: number;
};

export const CONTRACTOR_SUGGESTIONS = [
  "Electrical",
  "Plumbing",
  "Generator",
  "Kitchen equipment",
  "Sound & lighting",
  "Air conditioning",
  "Carpentry",
  "Painting",
  "Security",
  "General",
];

export function telLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 6 ? `tel:${digits}` : null;
}

/** South African numbers written 082... become 2782...; anything else is used as given. */
export function whatsappLink(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (!raw.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  }
  return `https://wa.me/${digits}`;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterContractors<T extends C>(list: T[], query: string, category: string | null): T[] {
  const inKind = list.filter((c) => !category || c.categories.some((x) => fold(x) === fold(category)));
  return fuzzyFilter(inKind, query, (c) => [c.name, c.contactPerson, c.categories.join(" "), c.notes, c.phone]);
}

export function categoriesInUse(list: C[]): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of list) {
    for (const name of c.categories) {
      const key = fold(name);
      const hit = counts.get(key);
      if (hit) hit.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Preferred first, then by name; archived last. */
export function orderContractors<T extends C>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.active) - Number(a.active) || Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name));
}

export function usageText(c: Pick<C, "jobs" | "openJobs">): string {
  if (c.jobs === 0) return "Not used yet";
  const jobs = `${c.jobs} job${c.jobs === 1 ? "" : "s"}`;
  return c.openJobs > 0 ? `${jobs} · ${c.openJobs} open` : jobs;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
