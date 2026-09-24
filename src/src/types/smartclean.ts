export type Role =
  | "operations_manager"
  | "site_manager"
  | "supervisor"
  | "cleaner"
  | "client_auditor"
  // The top role inside a customer organisation - was "system_admin"
  // before migration 20260909_0018 renamed it (see the web app's
  // types.ts for the full rationale).
  | "org_admin"
  // Šoma360's own operator staff (was "platform_owner" before the same
  // rename). They administer organisations from the web console and
  // never sign in here, but the union has to cover the value or parsing
  // a user record would narrow wrongly.
  | "system_admin";

export type SubscriptionTier = "trial" | "starter" | "professional" | "enterprise";

/** "none" is not a backend status - it is what the server reports for an
 * organisation with no subscription row at all, which the request gate
 * treats as blocked. Keeping it here means the UI fails closed the same
 * way the API does. */
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

export interface SubscriptionState {
  tier: SubscriptionTier | null;
  tierLabel: string | null;
  status: SubscriptionStatus;
  /** The RESOLVED effective module keys - core plus whatever the tier
   * grants. The server sends the answer rather than the tier so this
   * client never reimplements the matrix and drifts from it. */
  modules: string[];
  seats: number | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
  isTrial: boolean;
  inGrace: boolean;
  billingEmail?: string | null;
}

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  initials: string;
  siteIds: string[];
  email?: string;
  // Free-text, stored in the backend's JSONB profile blob (no dedicated
  // column) - same round-trip as profilePhotoDataUrl. Self-service
  // editable from app/(shared)/profile-edit.tsx, see updateUser +
  // toUserRecord.
  phone?: string;
  profilePhotoDataUrl?: string;
  // ISO timestamp of account creation - always sent by the backend
  // (user_to_record reads it straight off the live User.created_at
  // column) but optional here since older cached state predates this
  // field. Used by the performance-profile PDF's "member since" line.
  createdAt?: string;
}

export type TaskStatus =
  | "scheduled"
  | "assigned"
  | "not_started"
  | "in_progress"
  | "submitted"
  | "awaiting_inspection"
  | "rework_required"
  | "resubmitted"
  | "approved"
  | "closed"
  | "cancelled";

export type InspectionStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "reinspection_required"
  | "closed";

export type CAStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "resubmitted"
  | "awaiting_reinspection"
  | "closed"
  | "overdue";

export type IncidentPriority = "low" | "medium" | "high" | "critical";
export type Connectivity = "online" | "offline" | "slow";

export interface ChecklistItem {
  id: string;
  label: string;
  type:
    | "checkbox"
    | "pass_fail"
    | "photo_required"
    | "note"
    | "declaration"
    // Requires real text in `value` to count as done - see
    // IncidentController.assign_investigation on the backend (the
    // investigation task's "write your proposed steps" item).
    | "steps_required";
  risk?: "low" | "medium" | "high";
  requiredEvidence?: boolean;
  done?: boolean;
  value?: string;
}

export interface Evidence {
  id: string;
  taskId: string;
  kind: "before" | "after" | "issue" | "signature" | "note";
  label: string;
  capturedAt: string;
  device: string;
  offlineOriginated?: boolean;
  duplicateOf?: string;
  imgSeed: number;
  uri?: string;
  filePath?: string;
}

export interface Task {
  id: string;
  siteId: string;
  locationId: string;
  locationName: string;
  title: string;
  priority: "low" | "medium" | "high";
  // The task's calendar date, ISO timestamp - always sent by the
  // backend (camel_task's scheduledAt) but this type never declared it
  // until DateStrip's selectedDate started actually filtering the
  // assigned-tasks list on Home (see app/(app)/home.tsx).
  scheduledAt: string;
  dueTime: string;
  estimatedMinutes: number;
  status: TaskStatus;
  assigneeId: string;
  supervisorId: string;
  checklist: ChecklistItem[];
  evidence: Evidence[];
  requiresBeforeAfter: boolean;
  requiredQr: string;
  qrVerified?: boolean;
  // Whether the assignee is currently clocked in — undefined when the
  // backend didn't compute this for the response. Gates the whole task
  // screen (checklist + evidence), matching the web app.
  clockedIn?: boolean;
  startedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  score?: number;
  note?: string;
  /** Set for a task created from an incident - by either
   * assignInvestigation (send a cleaner to assess first) or assignTask
   * (the fix is already known), tying it back to the Incident it came
   * from. See IncidentController on the backend. */
  incidentId?: string;
  /** True only for a task created by assignInvestigation - assignTask
   * also sets incidentId above, so that alone can't tell "this task IS
   * the investigation" (photo + proposed-steps checklist) apart from
   * "this is normal fix work that happened to originate from an
   * incident" (a plain checkbox checklist of already-known steps). See
   * camel_task's isInvestigation on the backend. */
  isInvestigation?: boolean;
  /** True for a Task generated from a site's recurring hourly-compliance
   * schedule (see app.services.hourly_compliance_schedule on the
   * backend) - tags the task without changing anything about how it
   * flows through the normal Task/Inspection lifecycle. */
  isHourlyCompliance?: boolean;
  /** How this task repeats, set only on a recurring task's own template
   * (the task a supervisor created with "Recurring" ticked on the web
   * Add-task form) - absent on a normal once-off task and on the daily
   * instances the template generates, which carry recurringParentId
   * instead. A generated instance is an ordinary task in every other
   * respect, so nothing on this screen needs to special-case it. See
   * app.services.recurring_tasks on the backend. */
  recurrence?: { pattern: "daily" | "weekdays" | "dates"; dates: string[] };
  /** Whether the template is still generating instances - null for a
   * task that doesn't repeat at all. */
  recurrenceActive?: boolean | null;
  /** The template task this one was generated from - set on every
   * generated daily instance, absent otherwise. */
  recurringParentId?: string | null;
  /** The "HH:MM" slot this hourly-compliance task was generated for -
   * only set alongside isHourlyCompliance. */
  hourlyComplianceSlot?: string | null;
  /** Every cleaner the schedule named eligible for this instance - the
   * task itself only ever has one real assigneeId (above), starting out
   * as the first name on this list. Any other candidate can claim it by
   * scanning the room's QR first, which reassigns assigneeId to them
   * and flips hourlyComplianceClaimed - use both together to show
   * "Taken by <assignee>" (read-only) to every candidate who wasn't
   * first. */
  hourlyComplianceCandidateIds?: string[];
  /** True once someone has actually claimed this instance by scanning
   * first (assigneeId is then who claimed it) - false means assigneeId
   * is still just the placeholder first-candidate from generation. */
  hourlyComplianceClaimed?: boolean;
  /** The real instant this round's time window closes (next slot's
   * start, or local midnight for the day's last slot) - null for a
   * normal task. See hourlyComplianceLocked for the derived check. */
  hourlyComplianceWindowCloseAt?: string | null;
  /** True once hourlyComplianceWindowCloseAt has passed - the round is
   * locked and the backend rejects any further checklist/evidence/
   * submit write for it (TaskController._assert_hourly_compliance_
   * window_open), so the mobile screen shows this state up front
   * instead of letting a cleaner tap around into a rejected request. */
  hourlyComplianceLocked?: boolean;
}

export interface Inspection {
  id: string;
  taskId: string;
  inspectorId?: string;
  status: InspectionStatus;
  score?: number;
  scores?: Record<string, number>;
  comments?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface CorrectiveAction {
  id: string;
  taskId: string;
  inspectionId: string;
  assigneeId: string;
  reason: string;
  priority: "low" | "medium" | "high";
  deadline: string;
  status: CAStatus;
  createdAt: string;
  resubmittedAt?: string;
  closedAt?: string;
  timeline: { at: string; actor: string; text: string }[];
}

export interface Site {
  id: string;
  name: string;
  address: string;
  clientId: string;
  geofenceRadius: number;
  supervisorId: string;
  active: boolean;
  // This site's own branding — takes priority over the tenant-wide
  // default (Tenant.branding) whenever a field here is set. See
  // resolveBranding.
  branding: TenantBranding;
  // Expected shift start/end, "HH:MM" 24-hour local time - undefined
  // until a site_manager/supervisor sets it on the web app's Attendance
  // screen (see updateSiteWorkingHours there); drives Home's shift
  // banner and the backend's late clock-in watchdog
  // (app/services/attendance_watchdog.py).
  workingHours?: { start: string; end: string };
  // Floors + rooms layout (Enterprise-only "site_layout" module) - set
  // and mostly edited on the web app's Organisation setup screen.
  // Undefined for a site with no floors defined yet.
  profile?: SiteSpaceProfile;
}

export interface SiteFloorPlanImage {
  filePath: string;
  width: number;
  height: number;
  uploadedAt: string;
}

export interface SiteFloorProfile {
  id: string;
  name: string;
  // Optional backdrop for the visual layout canvas - undefined means the
  // canvas falls back to a blank drag/resize grid.
  planImage?: SiteFloorPlanImage;
  // Real-world width (meters) this floor's normalized 0-1 canvas
  // represents - see the same field in the web app's types.ts.
  canvasWidthMeters?: number;
}

export interface SiteSpaceProfile {
  floors: SiteFloorProfile[];
  updatedAt?: string;
}

export interface TenantBranding {
  // All optional — an unset field means "use the app default" (Šoma360
  // name/mark/blue), not "render nothing". See useTenantBranding.
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  branding: TenantBranding;
}

export interface LocationLayoutPoint {
  x: number;
  y: number;
}

export interface LocationLayout {
  // Normalized 0-1, relative to the floor's canvas/floor-plan-image
  // bounds - see the same field on the backend model and the web app's
  // FloorPlanCanvas.tsx, which this mirrors.
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  updatedAt?: string;
  // Present for a polygon room (a manual on-screen sketch, from this
  // app's own RoomSketchCanvas) - ordered wall-corner vertices,
  // normalized 0-1. x/y/w/h above are always this polygon's own bounding
  // box either way, computed server-side.
  points?: LocationLayoutPoint[];
}

export interface Location {
  id: string;
  siteId: string;
  name: string;
  type: "reception" | "bathroom" | "boardroom" | "kitchen" | "office" | "stockroom";
  qr: string;
  // Which floor this room belongs to (matches a SiteFloorProfile.name on
  // the site's layout) - undefined for a location whose site has no
  // floors defined, or predates floor tracking.
  floor?: string;
  // This room's placement on its floor's visual layout canvas
  // (Enterprise-only "site_layout" module, see the web app for the full
  // editor). {} means nobody has arranged it yet.
  layout?: LocationLayout;
}

export interface QrCode {
  code: string;
  kind: "site" | "room" | "zone" | "asset" | "stock" | "property";
  targetId: string;
  targetName: string;
  active: boolean;
  lastScanAt?: string;
  exceptions: number;
}

export interface Incident {
  id: string;
  siteId: string;
  locationName: string;
  // A staff-reported incident always has one (see
  // IncidentCreateRequest.locationId on the backend); undefined for a
  // public-QR report, which has no internal room/zone id to reference.
  locationId?: string;
  category: string;
  priority: IncidentPriority;
  description: string;
  ownerId: string;
  status: "open" | "assigned" | "investigating" | "awaiting_action" | "resolved" | "closed";
  createdAt: string;
  offlineOriginated?: boolean;
  uri?: string;
  /** Optional supporting photos uploaded with a staff-reported incident
   * (see IncidentCreateRequest.filePaths on the backend). Always []
   * rather than undefined when there are none. */
  filePaths?: string[];
  /** The task this incident was raised from, if any - set when a
   * cleaner reports it via a task's "Issue" evidence capture (see
   * tasks/[taskId]/evidence.tsx) rather than the standalone "Report
   * incident" flow. See IncidentRecord.sourceTaskId on the backend. */
  sourceTaskId?: string;
}

export interface Notification {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  text: string;
  relatedId?: string;
  createdAt: string;
  read: boolean;
  channel: "in_app" | "email" | "sms" | "whatsapp";
}

export interface AirbnbTurnover {
  id: string;
  propertyId: string;
  propertyName: string;
  checkoutAt: string;
  nextCheckinAt: string;
  status: string;
  cleanerId: string;
  supervisorId: string;
  checks: { area: string; done: boolean; note?: string; blocking?: boolean }[];
  readinessScore?: number;
}

export interface StockItem {
  id: string;
  name: string;
  qty: number;
  reorder: number;
  unit: string;
  siteId: string;
  lastTx?: string;
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  siteId: string;
  location: string;
  condition: "good" | "fair" | "poor";
  available: boolean;
  maintenanceFlag?: boolean;
  history: { at: string; text: string }[];
}
