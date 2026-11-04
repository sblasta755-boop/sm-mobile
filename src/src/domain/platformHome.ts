/**
 * The platform operator's home screen, as plain functions: what needs attention, how activity is grouped and
 * worded, and the numbers behind the charts. Everything is built from what the summary and the organisation list
 * already return - nothing here needs a backend change. The web console has the same rules
 * (smart-property-operations/src/src/lib/smartclean/platformHome.ts); keep them in step.
 */

export type ActivityEntry = {
  id: string;
  tenantId: string;
  tenantName: string;
  action: string;
  actorEmail: string | null;
  occurredAt: string;
};

export type ActivityKind = "signups" | "plans" | "status" | "access" | "onboarding";
export type Tone = "good" | "bad" | "warn" | "neutral";

/** Plain-language gloss for the audit action slugs. */
export const ACTIVITY_VERB: Record<string, string> = {
  organisation_provisioned: "was provisioned",
  organisation_self_provisioned: "signed up",
  organisation_suspended: "was suspended",
  organisation_reactivated: "was reactivated",
  organisation_cancelled: "was cancelled",
  subscription_updated: "had its plan changed",
  impersonation_started: "had a support session started",
  onboarding_code_revealed: "had an onboarding code shown",
  onboarding_code_scanned: "had its code scanned",
  onboarding_approved: "was approved",
  onboarding_rejected: "was rejected",
  onboarding_completed: "finished onboarding",
};

/** Icon (an Ionicons name), tone and filter kind for each action. Unknown actions fall back to a neutral dot. */
export const ACTIVITY_META: Record<string, { icon: string; tone: Tone; kind: ActivityKind }> = {
  organisation_provisioned: { icon: "business-outline", tone: "good", kind: "signups" },
  organisation_self_provisioned: { icon: "person-add-outline", tone: "good", kind: "signups" },
  organisation_suspended: { icon: "pause-circle-outline", tone: "bad", kind: "status" },
  organisation_reactivated: { icon: "play-circle-outline", tone: "good", kind: "status" },
  organisation_cancelled: { icon: "ban-outline", tone: "bad", kind: "status" },
  subscription_updated: { icon: "swap-horizontal-outline", tone: "neutral", kind: "plans" },
  impersonation_started: { icon: "headset-outline", tone: "warn", kind: "access" },
  onboarding_code_revealed: { icon: "key-outline", tone: "neutral", kind: "onboarding" },
  onboarding_code_scanned: { icon: "key-outline", tone: "neutral", kind: "onboarding" },
  onboarding_approved: { icon: "checkmark-circle-outline", tone: "good", kind: "onboarding" },
  onboarding_rejected: { icon: "close-circle-outline", tone: "bad", kind: "onboarding" },
  onboarding_completed: { icon: "checkmark-circle-outline", tone: "good", kind: "onboarding" },
};

export const ACTIVITY_FILTERS: { key: ActivityKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "signups", label: "Sign-ups" },
  { key: "plans", label: "Plans" },
  { key: "status", label: "Status" },
  { key: "access", label: "Access" },
  { key: "onboarding", label: "Onboarding" },
];

export function activityVerb(action: string): string {
  return ACTIVITY_VERB[action] ?? action.replace(/_/g, " ");
}

export function activityMeta(action: string) {
  return ACTIVITY_META[action] ?? { icon: "ellipse-outline", tone: "neutral" as Tone, kind: "status" as ActivityKind };
}

/** "nathi" from "nathi@soma360.co.za"; a person, not an address. */
export function actorName(email: string | null): string {
  return email ? email.split("@")[0] : "self-serve";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Groups newest-first entries under Today, Yesterday and then a dated heading. */
export function groupByDay<T extends { occurredAt: string }>(entries: T[], now = new Date()): { label: string; items: T[] }[] {
  const today = dayStart(now);
  const groups: { label: string; items: T[] }[] = [];
  for (const entry of entries) {
    const at = new Date(entry.occurredAt);
    const diff = Math.round((today - dayStart(at)) / 86_400_000);
    const label =
      diff <= 0
        ? "Today"
        : diff === 1
          ? "Yesterday"
          : at.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

// ---- Needs attention ----

type OrgForAttention = {
  id: string;
  name: string;
  userCount: number;
  subscription: { tier: string; tierLabel: string | null; status: string; trialEndsAt: string | null } | null;
};

function daysRemaining(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/** Why this organisation wants attention, in words a badge cannot carry; null when it does not. Same rule as the console. */
export function attentionReason(org: OrgForAttention, now = Date.now()): string | null {
  const sub = org.subscription;
  if (!sub) return "No subscription on file";
  if (sub.status === "suspended") return "Suspended";
  if (sub.status === "past_due") return "Payment overdue";
  if (sub.status === "trialing") {
    const days = daysRemaining(sub.trialEndsAt, now);
    if (days !== null && days <= 0) return "Trial has ended";
    if (days !== null && days <= 3) return `Trial ends in ${days} day${days === 1 ? "" : "s"}`;
  }
  return null;
}

export type AttentionItem<T> = { org: T; reason: string; tone: Tone };

/** Flagged organisations, worst first: suspended, then payment overdue, then trials running out. */
export function attentionList<T extends OrgForAttention>(orgs: T[], now = Date.now()): AttentionItem<T>[] {
  const rank = (o: T) => (o.subscription?.status === "suspended" ? 0 : o.subscription?.status === "past_due" ? 1 : 2);
  return orgs
    .map((org) => ({ org, reason: attentionReason(org, now) }))
    .filter((x): x is { org: T; reason: string } => x.reason !== null)
    .sort((a, b) => rank(a.org) - rank(b.org))
    .map(({ org, reason }) => ({ org, reason, tone: (rank(org) <= 1 ? "bad" : "warn") as Tone }));
}

// ---- Numbers behind the charts ----

export type SummaryLike = {
  totalOrganisations: number;
  byTier: Record<string, number>;
  byStatus: Record<string, number>;
  signupsLast30Days: Record<string, number>;
};

export function paidCount(s: SummaryLike): number {
  return s.totalOrganisations - (s.byTier.trial ?? 0);
}

export function signupsTotal(s: SummaryLike): number {
  return Object.values(s.signupsLast30Days).reduce((a, b) => a + b, 0);
}

/** Every one of the last 30 days, oldest first, with the running total: a gapped axis would read as a busier month. */
/** What one day on the signups curve means, in words: that day's new organisations and the running total. */
export function signupPointText(p: { count: number; total: number }): string {
  const day = p.count === 0 ? "No signups" : `${p.count} new`;
  return `${day} · ${p.total} in total`;
}

export function signupSeries(s: SummaryLike, now = new Date()): { date: string; count: number; total: number }[] {
  const days: { date: string; count: number; total: number }[] = [];
  let total = 0;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = s.signupsLast30Days[key] ?? 0;
    total += count;
    days.push({ date: key, count, total });
  }
  return days;
}

export const STATUS_ORDER = ["active", "trialing", "past_due", "suspended", "cancelled"] as const;
export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};
export const TIER_ORDER = ["enterprise", "professional", "starter", "trial"] as const;
