/**
 * The counts behind the operations cards, and the rules for the phone's copy of them. /home/summary is asked only for
 * the blocks the visible cards need. The last answer is kept on the phone so a card draws instantly and refreshes behind
 * it; a card whose block the server left out (module off, no access) draws nothing rather than a made-up zero.
 *
 * Pure: no React, no storage. Mirrors the web console's lib/smartclean/homeSummary.ts; keep the two in step.
 */
import type { ScheduledBooking } from "@/domain/onShiftSchedule";

export interface ApprovalsBlock {
  overtime?: number;
  leave?: number;
  onboarding?: number;
  maintenance?: number;
}
export interface MaintenanceBlock {
  open: number;
  critical: number;
  needQuote: number;
  awaitingApproval: number;
  verify: number;
  onHold: number;
  scheduled: number;
  paymentsOverdue?: number;
  paymentsOwing?: number;
}
export interface StockBlock {
  outOfStock: number;
  atReorder: number;
  restockOpen: number;
}
export interface ScheduleBlock {
  today: string;
  bookings: ScheduledBooking[];
}

export interface LeaveBlock {
  awayToday: number;
  away: { userName: string; siteId?: string | null; typeName: string; endDate?: string | null }[];
}
export interface ComplianceBlock {
  reviewsWaiting: number;
  withFailures: number;
  disputed: number;
}
export interface NoticeboardBlock {
  unread: number;
}
export interface DevicesBlock {
  reporting: number;
  lowBattery: number;
  notReporting: number;
  lowest: { userName: string; batteryLevel: number }[];
}

export interface HomeSummaryData {
  approvals?: ApprovalsBlock;
  maintenance?: MaintenanceBlock;
  stock?: StockBlock;
  schedule?: ScheduleBlock;
  leave?: LeaveBlock;
  compliance?: ComplianceBlock;
  noticeboard?: NoticeboardBlock;
  devices?: DevicesBlock;
}

export type BlockName = keyof HomeSummaryData;

/** What each card needs from the server. Cards not listed (site_pulse) are drawn from /bootstrap alone. */
export const BLOCKS_FOR_CARD: Record<string, BlockName[]> = {
  attendance_now: ["schedule"],
  approvals: ["approvals"],
  maintenance: ["maintenance"],
  stock_alerts: ["stock"],
  leave_today: ["leave"],
  compliance_reviews: ["compliance"],
  noticeboard: ["noticeboard"],
  device_battery: ["devices"],
};

export const OPERATIONS_IDS = [
  "attendance_now",
  "approvals",
  "site_pulse",
  "maintenance",
  "stock_alerts",
  "leave_today",
  "compliance_reviews",
  "noticeboard",
  "device_battery",
] as const;
export const isOperationsCard = (id: string) => (OPERATIONS_IDS as readonly string[]).includes(id);

/** The blocks to ask for, given the ids of the cards on screen. */
export function blocksNeeded(cardIds: string[]): BlockName[] {
  return [...new Set(cardIds.flatMap((id) => BLOCKS_FOR_CARD[id] ?? []))];
}

/** What the phone keeps. `asked` are the blocks the server has been asked for at least once. */
export interface SummaryState {
  data: HomeSummaryData;
  asked: BlockName[];
  /** Epoch ms of the last successful answer; null before the first one. */
  fetchedAt: number | null;
}

export const EMPTY_SUMMARY: SummaryState = { data: {}, asked: [], fetchedAt: null };

/** The answer from the server folded into what is kept: a block that was asked for and is absent is "left out". */
export function applyAnswer(prev: SummaryState, asked: BlockName[], answer: Partial<HomeSummaryData>, now: number): SummaryState {
  const data: HomeSummaryData = { ...prev.data };
  for (const block of asked) {
    if (answer[block] !== undefined) (data as Record<string, unknown>)[block] = answer[block];
    else delete data[block];
  }
  return { data, asked: [...new Set([...prev.asked, ...asked])], fetchedAt: now };
}

export type BlockStatus = "loading" | "omitted" | "ready";

/** loading: never asked yet. omitted: the server left it out, so the card hides. ready: draw it. */
export function blockStatus(state: SummaryState, block: BlockName): BlockStatus {
  if (!state.asked.includes(block)) return "loading";
  return state.data[block] === undefined ? "omitted" : "ready";
}

/** An answer older than this is shown with a muted "updated ... ago". */
export const STALE_AFTER_MS = 3 * 60_000;

export const isStale = (state: SummaryState, now: number): boolean => state.fetchedAt === null || now - state.fetchedAt > STALE_AFTER_MS;

/** "just now", "5m ago", "2h ago", "3d ago". */
export function agoText(fetchedAt: number | null, now: number): string {
  if (fetchedAt === null) return "";
  const minutes = Math.floor((now - fetchedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

/** Whether a stored value is a copy this build can use. Anything else counts as nothing kept. */
export function parseSummaryState(raw: string | null | undefined): SummaryState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SummaryState> | null;
    if (v && typeof v === "object" && v.data && typeof v.data === "object" && Array.isArray(v.asked) && (v.fetchedAt === null || typeof v.fetchedAt === "number")) {
      return v as SummaryState;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Whether the card has anything to show: its module is on and the server did not leave its data out. */
const BLOCK_OF: Record<string, BlockName | undefined> = {
  approvals: "approvals",
  maintenance: "maintenance",
  stock_alerts: "stock",
  leave_today: "leave",
  compliance_reviews: "compliance",
  noticeboard: "noticeboard",
  device_battery: "devices",
};

export function operationsAvailable(id: string, status: (block: BlockName) => BlockStatus, attendanceOn: boolean): boolean {
  if (!isOperationsCard(id)) return false;
  const block = BLOCK_OF[id];
  if (block && status(block) === "omitted") return false;
  if (id === "attendance_now" && !attendanceOn) return false;
  return true;
}
