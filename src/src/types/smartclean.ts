export type Role =
  | "operations_manager"
  | "site_manager"
  | "supervisor"
  | "cleaner"
  // Identical UI/permissions to "cleaner" for every existing task/
  // checklist/evidence flow, plus the table-session flow below (waiter
  // table-grid, claim/takeover, clean-confirm) - see the backend's
  // services/records.py VALID_ROLES comment. Every has_role(...,
  // "cleaner") gate in the backend was updated alongside "waiter"
  // rather than replaced, so nothing a cleaner could already do is
  // restricted for a waiter.
  | "waiter"
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

export interface WorkflowPolicy {
  attendance: {
    enabled: boolean;
    clockInMethods: string[];
    defaultClockInMethod: string;
    requireSiteSelection: boolean;
    requireGeofence: boolean;
  };
  tasks: {
    enabled: boolean;
    startMethods: string[];
    defaultStartMethod: string;
    requireLocation: boolean;
    requireAreaScan: boolean;
    requireEvidence: boolean;
    /** "before_after" (Before + After photos) or "single" (no Before photo;
     * photos are called Evidence). */
    evidenceMode?: "before_after" | "single";
    /** Who reviews a task a supervisor / site manager did: "site_manager" or "none". */
    supervisorTaskReview?: "site_manager" | "none";
    supervisorTasksRequireClockIn?: boolean;
  };
  qr: { enabled: boolean };
}

export interface SubscriptionState {
  tier: SubscriptionTier | null;
  tierLabel: string | null;
  status: SubscriptionStatus;
  /** The RESOLVED effective module keys - core plus whatever the tier
   * grants. The server sends the answer rather than the tier so this
   * client never reimplements the matrix and drifts from it. */
  modules: string[];
  /** Workflow methods the organisation supports (e.g. "qr_codes",
   * "manual_attendance", "manual_task_start"). Optional so a build talking
   * to an older backend keeps working - absent means "behave as before". */
  capabilities?: string[];
  /** The organisation's resolved workflow rules. */
  policy?: WorkflowPolicy;
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
  /** Section grouping - a snapshot taken when the task was assigned.
   * Absent for an ungrouped item (every task that predates sections). */
  sectionId?: string;
  sectionName?: string;
  sectionOrder?: number;
  /** photo_required items: how many photos prove the item. Absent on tasks
   * from before photos were tied to items (they keep the old rule). */
  photoCount?: number;
}

export interface Evidence {
  id: string;
  taskId: string;
  kind: "before" | "after" | "evidence" | "issue" | "signature" | "note";
  /** Set when the photo proves a specific checklist item. */
  checklistItemId?: string | null;
  label: string;
  capturedAt: string;
  device: string;
  offlineOriginated?: boolean;
  duplicateOf?: string;
  imgSeed: number;
  uri?: string;
  filePath?: string;
}

/** Reference material (a manual, a reference photo) a supervisor
 * attached to a task when assigning it - distinct from Evidence below,
 * which is the cleaner's own live-captured proof the work was done. See
 * the backend's TaskAttachment model docstring. */
export interface TaskAttachment {
  id: string;
  filePath: string;
  fileName: string;
  contentType: string;
  kind: "image" | "document";
  label: string;
  uploadedBy: string;
  createdAt: string;
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
  /** Not returned by every endpoint - see the backend's camel_task,
   * defaults to [] where it wasn't fetched for that response. */
  attachments?: TaskAttachment[];
  requiresBeforeAfter: boolean;
  requiredQr: string;
  qrVerified?: boolean;
  /** How the task was started: "qr", "manual", or absent before it starts. */
  startMethod?: "qr" | "manual" | null;
  // Whether the assignee is currently clocked in - undefined when the
  // backend didn't compute this for the response. Gates the whole task
  // screen (checklist + evidence), matching the web app.
  clockedIn?: boolean;
  startedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  score?: number;
  /** The optional note the person doing the task left for the reviewer. */
  note?: string | null;
  /** Set for a task created from an incident - by either
   * assignInvestigation (send a cleaner to assess first) or assignTask
   * (the fix is already known), tying it back to the Incident it came
   * from. See IncidentController on the backend. */
  incidentId?: string;
  /** The TableSession this cleaning task was auto-generated from (a
   * waiter's "paid"/"walked_out" end, or a "no" answer to the claim
   * flow's "is this table clean?" prompt) - mirrors incidentId/
   * Incident.sourceTaskId's own linking pattern. See the backend's
   * Task.source_session_id and TableSessionController. */
  sourceSessionId?: string;
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
  /** Labels such as "Opening" or "Closing" that group this kind of work. */
  tags?: string[];
  /** The task's raw server-side metadata; only roomQrVerification is read (reports). */
  metadata?: Record<string, unknown>;
  /** Done by a supervisor / site manager rather than a cleaner. */
  isSupervisorTask?: boolean;
  /** Belongs to the whole site (no room); started by scanning the site QR. */
  isSiteWide?: boolean;
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
  // This site's own branding - takes priority over the tenant-wide
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
  // All optional - an unset field means "use the app default" (Šoma360
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
  // Whether the waiter/table-session feature is switched on for this
  // organisation - a business-type toggle ("is this org a restaurant"),
  // set by a Šoma360 platform operator, not something any subscription
  // tier unlocks. Gates the Tables tab/screens client-side; the backend
  // enforces it independently on every table-session request (see
  // require_table_service in app/api/deps.py) so this is a UX nicety,
  // not the actual security boundary.
  tableServiceEnabled: boolean;
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
  // "table" is a restaurant-style seating location a waiter claims via
  // TableSession, added additively alongside the original cleaner-room
  // types rather than replacing any of them - see TableSession.
  type: "reception" | "bathroom" | "boardroom" | "kitchen" | "office" | "stockroom" | "table";
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

// ---- Waiter table sessions ----

export type WaiterSessionStatus = "active" | "bill_requested" | "ended";

export type WaiterSessionEndReason =
  | "paid"
  | "walked_out"
  | "moved_table"
  | "duplicate_or_error"
  | "other";

export interface TableSession {
  id: string;
  siteId: string;
  locationId: string;
  locationName?: string;
  waiterId: string;
  waiterName?: string;
  status: WaiterSessionStatus;
  /** The short-lived signed token currently displayed on the waiter's
   * screen as a QR - see the backend's app.services.
   * table_session_tokens (~2-5 min TTL, rotated on redisplay via
   * refreshTableSessionToken, not on every customer scan). Undefined on
   * a customer-facing response (join/create-request), which never
   * echoes the token back to the very page it authorizes. */
  qrToken?: string;
  qrTokenExpiresAt?: string;
  customerJoinedAt?: string;
  billRequestedAt?: string;
  lastBillReminderAt?: string;
  billReminderCount?: number;
  /** When anyone last attended this table (see attendTableSession). */
  lastAttendedAt?: string;
  /** Walk-out risk marker - a prompt for the waiter, never a verdict.
   * See the backend's app.services.table_risk. */
  riskLevel?: "ok" | "watch" | "at_risk";
  riskReasons?: string[];
  startedAt: string;
  endedAt?: string;
  endReason?: WaiterSessionEndReason;
  endNote?: string;
  previousSessionId?: string;
  /** Set once the claim flow's "is this table clean?" prompt has been
   * answered for this session - true means a cleaning Task was
   * generated (see generatedTaskId), false means the waiter confirmed
   * it was already clean. Undefined only for a session predating this
   * question (never happens going forward). */
  cleaningRequired?: boolean;
  generatedTaskId?: string;
  requests: TableRequest[];
}

export type TableRequestKind = "menu" | "bill" | "complaint" | "compliment" | "assistance";

export interface TableRequest {
  id: string;
  sessionId: string;
  kind: TableRequestKind;
  note?: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/** The three-outcome response from claiming a table's QR - see the
 * backend's TableSessionController.claim. Exactly one of `claimed` /
 * `blocked` / `takeoverOffered` is meaningfully true at once. */
export interface TableSessionClaimResult {
  claimed: boolean;
  session?: TableSession;
  /** True right after a claim/takeover succeeds - the app must show
   * the "is this table clean?" prompt (see confirmTableSessionClean)
   * before treating the table as normal-serving. */
  cleaningConfirmationRequired?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  servedByName?: string;
  takeoverOffered?: boolean;
  staleSignal?: string;
}

/** A waiter's own aggregate customer rating - see GET /table-sessions/
 * my-rating-summary and the Profile screen's "Your rating" stat. Never
 * carries anything finer than the aggregate (no per-rating list) - a
 * waiter can see THAT they're rated, not by whom or which visit. */
export interface TableRatingSummary {
  /** null when ratingCount is 0 - render "No ratings yet", not a
   * misleading zero-star average. */
  averageRating: number | null;
  ratingCount: number;
}
