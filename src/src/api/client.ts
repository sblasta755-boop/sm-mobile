import Constants from "expo-constants";
import type {
  AirbnbTurnover,
  Asset,
  CorrectiveAction,
  DemoUser,
  Incident,
  Inspection,
  Location,
  LocationLayoutPoint,
  Notification,
  QrCode,
  Site,
  SiteFloorPlanImage,
  StaffRole,
  StockAccess,
  StockConversion,
  StockCountHelper,
  StockCountSession,
  StockHandoverReport,
  StockShift,
  StockItem,
  StockLevel,
  StockLocation,
  StockMovement,
  StockRestockTask,
  StockTransfer,
  StockLoan,
  StockOverview,
  SubscriptionState,
  Task,
  TableRatingSummary,
  TableSession,
  PendingTableOrder,
  TableOrder,
  TableOrderLineDecision,
  TableSessionOrders,
  TableSessionClaimResult,
  Tenant,
  WaiterSessionEndReason,
} from "@/types/smartclean";
import { formatTime } from "@/services/formatDateTime";

const extraUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  extraUrl ||
  "http://10.0.2.2:8000/api/v1"
).replace(/\/$/, "");

// No CUSTOMER_APP_BASE_URL here (removed - was briefly needed while the
// customer QR was session-scoped). The customer QR is now the table's
// own PERMANENT Location.qr - the same physical code the waiter scans to
// claim the table (see tables/index.tsx and scan.tsx's table-claim
// branch) - so the mobile app never needs to know where the customer
// web page is hosted; that's baked into the QR itself once whoever
// prints/sets it up points it at the right host. See
// TableSessionController's "Customer-facing" section docstring on the
// backend for the full reasoning behind this change.

export function fileUrl(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  // Files in object storage (R2) are saved as their full public address; files on
  // the server's own disk as "images/<name>". Both have to work, at any time.
  if (/^https?:\/\//i.test(filePath) || filePath.startsWith("data:")) return filePath;
  return `${API_BASE_URL}/${filePath.replace(/^\/+/, "")}`;
}

/** A resized copy of an uploaded photo, for places that show it small (see the
 * backend's /thumbs). Anything that is not an upload falls back to the original. */
export function thumbUrl(filePath: string | undefined, width = 640): string | undefined {
  if (!filePath) return undefined;
  // Either the server-disk form ("images/<name>") or the bucket's full address;
  // the backend's /thumbs finds the file wherever it is stored.
  const match = /^(?:https?:\/\/[^?#]+)?\/?images\/([^/?#]+)$/.exec(filePath);
  return match ? `${API_BASE_URL}/thumbs/${match[1]}?w=${width}` : fileUrl(filePath);
}

export interface BackendSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface BackendBootstrap {
  user: DemoUser;
  tenants: Tenant[];
  /** The organisation's plan and unlocked modules. Optional so a build
   * running against an older backend still type-checks. */
  subscription?: SubscriptionState;
  /** Organisation-chosen tag colours (lower-cased tag to colour name). */
  tagColors?: Record<string, string>;
  /** Field-staff role definitions. Optional so a build running against an older backend still type-checks. */
  staffRoles?: StaffRole[];
  users: DemoUser[];
  sites: Site[];
  locations: Location[];
  qrCodes: QrCode[];
  tasks: Task[];
  // Module-gated server-side. The backend sends [] for a tier that does
  // not include one of these today and will omit the key entirely once
  // every client handles it - hence optional here, and ?? [] in
  // bootstrapState().
  inspections?: Inspection[];
  correctiveActions?: CorrectiveAction[];
  incidents?: Incident[];
  notifications: Notification[];
  attendance: Record<string, { clockedInAt?: string; siteId?: string }>;
  turnovers?: AirbnbTurnover[];
  stock?: StockItem[];
  assets?: Asset[];
}

export async function loginToBackend(username: string, password: string) {
  const auth = await request<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: Record<string, unknown>;
    mustChangePassword?: boolean;
    hasSeenWelcome?: boolean;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const session: BackendSession = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
  };
  const bootstrap = await loadBackendBootstrap(session.accessToken);
  return {
    session,
    bootstrap,
    mustChangePassword: auth.mustChangePassword ?? false,
    hasSeenWelcome: auth.hasSeenWelcome ?? true,
  };
}

export async function logoutFromBackend(accessToken: string, refreshToken: string) {
  await request("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }, accessToken);
}

export async function loadBackendBootstrap(accessToken: string): Promise<BackendBootstrap> {
  const payload = await request<Record<string, unknown>>("/bootstrap", {}, accessToken);
  return normalizeBootstrap(payload);
}

export async function refreshSession(refreshToken: string): Promise<BackendSession> {
  const auth = await request<{ accessToken: string; refreshToken: string; expiresIn: number }>(
    "/auth/refresh",
    { method: "POST", body: JSON.stringify({ refreshToken }) },
  );
  // The backend rotates the refresh token on every use (one-time-use
  // family, see AuthController.refresh) - the old one is now invalid, so
  // the caller must persist auth.refreshToken, not keep reusing the one
  // passed in here.
  return {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
  };
}

// Every request() call below takes an explicit accessToken rather than
// reading from shared state, so a 401 can't refresh itself in isolation
// - it needs the current refresh token and somewhere to persist the
// rotated session it gets back. SmartCleanProvider registers those once
// via setSessionHandlers() on mount; request() uses them to transparently
// refresh-and-retry once on a 401 instead of surfacing "Backend 401" to
// whichever screen happened to be mid-action. Previously there was no
// refresh call anywhere in the app - POST /auth/refresh existed and
// worked on the backend, but every access-token expiry (well within a
// typical shift, given the token's short TTL) just failed every
// subsequent API call with no recovery and no clear signal to re-login.
let sessionHandlers: {
  getRefreshToken: () => string | null;
  onRefreshed: (session: BackendSession) => void;
  onRefreshFailed: () => void;
  /** Called on any 402 from the subscription gate. The provider refetches
   * bootstrap: a 402 means this app's idea of the plan is stale (a tier
   * changed, or the subscription lapsed, under us). Optional so existing
   * callers keep type-checking. */
  onSubscriptionBlocked?: (code: string | undefined, detail?: Record<string, unknown>) => void;
} | null = null;

export function setSessionHandlers(handlers: typeof sessionHandlers) {
  sessionHandlers = handlers;
}

let refreshInFlight: Promise<string | null> | null = null;

/** Attempts one refresh, de-duplicating concurrent callers so a burst of
 * 401s (several screens' requests failing around the same moment) only
 * triggers a single /auth/refresh call. Returns the new access token, or
 * null if there was nothing to refresh with or the refresh itself
 * failed - callers fall back to surfacing the original 401 in that case. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = sessionHandlers?.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const session = await refreshSession(refreshToken);
      sessionHandlers?.onRefreshed(session);
      return session.accessToken;
    } catch {
      sessionHandlers?.onRefreshFailed();
      return null;
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
  _isRetry = false,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 401 && accessToken && !_isRetry && path !== "/auth/refresh" && path !== "/auth/login") {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<T>(path, init, newAccessToken, true);
    }
  }
  if (!response.ok) {
    await throwForStatus(response);
  }
  // A 204 has no body (deletes, fire-and-forget logs).
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// Backend errors come back as {"error": {"code": <http status>, "message":
// <AppError payload>, "requestId": ...}} - see
// app/core/errors.py:http_exception_handler on the backend, which wraps
// every HTTPException this way (not FastAPI's own default {"detail":
// ...} shape). <AppError payload> is itself either a plain string, or
// {"code": ..., "message": "...", "detail"?: {...}} for the AppError
// subclasses that pass one - see AppError/raise_http. A small number of
// AppErrors (currently just the geofence rejection) carry that
// structured `detail` (distanceMeters, siteLatitude, ... - see
// evaluate_geofence) for callers that want to do more than show a
// toast (e.g. render a map of how far off the device was). Mirrors the
// web client's ApiError/extractError - keep both in sync.
export class ApiError extends Error {
  detail?: Record<string, unknown>;
  constructor(message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.detail = detail;
  }
}

async function extractError(
  response: Response,
): Promise<{ message: string; code?: string; detail?: Record<string, unknown> }> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: { code?: string; message?: string; detail?: Record<string, unknown> } | string;
      };
    };
    const inner = parsed?.error?.message;
    if (typeof inner === "string") return { message: inner };
    if (inner && typeof inner.message === "string") {
      // `code` separates the two 402s - module_locked (the plan lacks
      // this feature) from subscription_inactive (the account is not in
      // good standing) - which need different messages.
      return { message: inner.message, code: inner.code, detail: inner.detail };
    }
  } catch {
    // Not JSON - fall through to the raw body below.
  }
  return { message: `Backend ${response.status}: ${body}` };
}

/** A 402 from the subscription gate. Extends ApiError rather than Error
 * so every existing `instanceof ApiError` catch keeps working. Mirrors
 * the web client's SubscriptionError - keep both in sync. */
export class SubscriptionError extends ApiError {
  /** "module_locked" | "subscription_inactive" */
  code?: string;

  constructor(message: string, code?: string, detail?: Record<string, unknown>) {
    super(message, detail);
    this.name = "SubscriptionError";
    this.code = code;
  }

  get isModuleLocked(): boolean {
    return this.code === "module_locked";
  }
}

/** Shared non-OK handling, so any call site that cannot go through
 * request() (a FormData upload, say) still agrees about what a 402 and
 * an error envelope mean. */
async function throwForStatus(response: Response): Promise<never> {
  const { message, code, detail } = await extractError(response);
  if (response.status === 402) {
    sessionHandlers?.onSubscriptionBlocked?.(code, detail);
    throw new SubscriptionError(message, code, detail);
  }
  throw new ApiError(message, detail);
}

// ---- Tasks ----

export function updateChecklistItem(
  accessToken: string,
  taskId: string,
  itemId: string,
  patch: { done?: boolean; value?: string; note?: string },
) {
  return request<Task>(
    `/tasks/${taskId}/checklist`,
    { method: "PATCH", body: JSON.stringify({ itemId, ...patch }) },
    accessToken,
  );
}

export function addTaskEvidence(
  accessToken: string,
  taskId: string,
  evidence: {
    /** Lets the server recognise a retry of the same photo (it records it once). */
    id?: string;
    kind: string;
    label?: string;
    /** The photo_required checklist item this photo is the proof for. */
    checklistItemId?: string;
    filePath?: string;
    liveCapture?: boolean;
    offlineOriginated?: boolean;
    /** When the photo was actually taken (ISO), which may be well before it uploads. */
    capturedAt?: string;
  },
) {
  return request<Task>(
    `/tasks/${taskId}/evidence`,
    { method: "POST", body: JSON.stringify(evidence) },
    accessToken,
  );
}

/** Start a task without scanning its area - only accepted where the
 * organisation's policy allows manual starts. */
export function startTask(
  accessToken: string,
  taskId: string,
  scan?: { qrValue: string; latitude?: number; longitude?: number },
  /** When the person really started (ISO), for a start made offline and sent later. */
  startedAt?: string,
) {
  return request<Task>(
    `/tasks/${taskId}/start`,
    // With a scan: the site QR for a site-wide task, verified server-side
    // (code match + geofence). Without one: the manual, no-scan start.
    scan
      ? { method: "POST", body: JSON.stringify({ method: "qr", ...scan, startedAt }) }
      : { method: "POST", body: JSON.stringify({ method: "manual", startedAt }) },
    accessToken,
  );
}

export function submitTask(
  accessToken: string,
  taskId: string,
  submittedAt?: string,
  signoff?: {
    signerName?: string;
    signature?: { strokes: number[][][]; width: number; height: number };
    /** A submission replayed from the offline queue. */
    offlineRecorded?: boolean;
  },
) {
  return request<Task>(
    `/tasks/${taskId}/submit`,
    { method: "POST", body: JSON.stringify({ declarationAccepted: true, submittedAt, ...signoff }) },
    accessToken,
  );
}

// ---- Corrective actions ----

export function updateCorrectiveAction(
  accessToken: string,
  actionId: string,
  payload: { status: "in_progress" | "awaiting_reinspection" | "closed"; note?: string },
) {
  return request<CorrectiveAction>(
    `/corrective-actions/${actionId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
}

// ---- Incidents ----

export function createIncident(accessToken: string, payload: Record<string, unknown>) {
  return request<Incident>("/incidents", { method: "POST", body: JSON.stringify(payload) }, accessToken);
}

// ---- Attendance ----

/** `qrValue` is required only for the "qr" method; a manual clock-in sends
 * just the site. The server authorises the method against the
 * organisation's policy. */
export interface ClockPayload {
  siteId: string;
  qrValue?: string;
  /** "geofence_auto" is set by the phone itself when it detects leaving or re-entering the site. */
  method?: "qr" | "manual" | "geofence" | "geofence_auto";
  /** For "geofence_auto": left_site | returned | shift_end. */
  reason?: string;
  latitude?: number;
  longitude?: number;
  /** For a scan made with no signal: when it really happened (ISO) and that it was offline. */
  occurredAt?: string;
  offlineRecorded?: boolean;
}

export function clockIn(accessToken: string, payload: ClockPayload) {
  return request<Record<string, unknown>>("/attendance/clock-in", { method: "POST", body: JSON.stringify(payload) }, accessToken);
}

export function clockOut(accessToken: string, payload: ClockPayload) {
  return request<Record<string, unknown>>("/attendance/clock-out", { method: "POST", body: JSON.stringify(payload) }, accessToken);
}

export interface AttendanceDay {
  id: string;
  userId: string;
  siteId: string;
  siteName?: string;
  workDate: string;
  clockInAt?: string;
  clockOutAt?: string;
  workedMinutes?: number;
  expectedStart?: string;
  expectedEnd?: string;
  exceptions: string[];
  approvalState: string;
}

/** The caller's own computed attendance days ("YYYY-MM-DD" start/end,
 * inclusive, max 62 days) - worked minutes and exceptions per day, for
 * the performance-profile PDF's attendance section. Self-service: the
 * backend always scopes this to whoever the access token belongs to. */
export function getMyAttendanceDays(accessToken: string, start: string, end: string) {
  return request<AttendanceDay[]>(
    `/attendance/my-history?start=${start}&end=${end}`,
    {},
    accessToken,
  );
}

// ---- Device health ----

/** One battery sample from this device - reported at clock-in/out and
 * periodically while the app is open (see useDeviceHealthReporting).
 * Self-service: the backend always writes against whoever the access
 * token belongs to, so there's nothing else to pass. */
export function reportDeviceHealth(
  accessToken: string,
  payload: { batteryLevel: number; isCharging: boolean; deviceModel?: string; osVersion?: string },
) {
  return request<Record<string, unknown>>(
    "/device-health/report",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export interface DeviceHealthTeamEntry {
  userId: string;
  userName: string;
  batteryLevel: number;
  isCharging: boolean;
  deviceModel?: string;
  osVersion?: string;
  reportedAt: string;
}

/** The latest known battery reading for each person on the caller's
 * roster - org_admin/operations_manager/site_manager/supervisor only,
 * same audience as attendance/timesheet. */
export function getDeviceHealthTeam(accessToken: string) {
  return request<DeviceHealthTeamEntry[]>("/device-health/team", {}, accessToken);
}

// ---- Hourly compliance ----

// Mirrors the web client's smartclean/api.ts hourly-compliance section -
// keep both in sync with app/controllers/hourly_compliance.py on the
// backend. Only the two calls a cleaner actually needs on mobile are
// exposed here (list assignments/checks, record a check); verifying,
// disputing, assigning, and reviewing stay supervisor-only desktop
// actions and aren't wired into this app.

export interface HourlyComplianceCheck {
  id: string;
  siteId: string;
  itemId: string;
  checkDate: string;
  timeSlot: string;
  status: "ok" | "warn" | "fail";
  note: string | null;
  checkedBy: string | null;
  checkedAt: string;
  verificationStatus: "pending" | "verified" | "disputed";
  verifiedBy: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
}

export function listHourlyComplianceChecks(accessToken: string, siteId: string, checkDate: string) {
  return request<HourlyComplianceCheck[]>(
    `/hourly-compliance?siteId=${encodeURIComponent(siteId)}&checkDate=${encodeURIComponent(checkDate)}`,
    {},
    accessToken,
  );
}

export function recordHourlyComplianceCheck(
  accessToken: string,
  payload: {
    siteId: string;
    itemId: string;
    checkDate: string;
    timeSlot: string;
    status: "ok" | "warn" | "fail";
    note?: string;
  },
) {
  return request<HourlyComplianceCheck>(
    "/hourly-compliance",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export interface HourlyComplianceAssignment {
  id: string;
  siteId: string;
  itemId: string;
  assignmentDate: string;
  assigneeId: string;
  assignedBy: string;
  assignedAt: string;
}

export function listHourlyComplianceAssignments(accessToken: string, siteId: string, assignmentDate: string) {
  return request<HourlyComplianceAssignment[]>(
    `/hourly-compliance/assignment?siteId=${encodeURIComponent(siteId)}&assignmentDate=${encodeURIComponent(assignmentDate)}`,
    {},
    accessToken,
  );
}

// ---- QR / codes ----

export function resolveQr(
  accessToken: string,
  value: string,
  latitude?: number,
  longitude?: number,
  confirmClaim?: boolean,
) {
  return request<Record<string, unknown>>(
    "/codes/resolve",
    { method: "POST", body: JSON.stringify({ value, latitude, longitude, confirmClaim }) },
    accessToken,
  );
}

// ---- Waiter table sessions ----

export function claimTableSession(
  accessToken: string,
  payload: {
    value: string;
    confirmTakeover?: boolean;
    takeoverReason?: string;
    takeoverNote?: string;
  },
) {
  return request<TableSessionClaimResult>(
    "/table-sessions/claim",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function listTableSessions(accessToken: string, activeOnly = false) {
  return request<TableSession[]>(
    `/table-sessions${activeOnly ? "?activeOnly=true" : ""}`,
    {},
    accessToken,
  );
}

export function getTableSession(accessToken: string, sessionId: string) {
  return request<TableSession>(`/table-sessions/${sessionId}`, {}, accessToken);
}

/** A waiter's own aggregate rating (average + count) from customer
 * post-session ratings - see the Profile screen's "Your rating" stat.
 * Never returns anything finer than the aggregate - see the backend's
 * TableRatingSummaryResponse for why. */
export function getMyRatingSummary(accessToken: string) {
  return request<TableRatingSummary>("/table-sessions/my-rating-summary", {}, accessToken);
}

export function confirmTableSessionClean(accessToken: string, sessionId: string, clean: boolean) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/clean-confirm`,
    { method: "POST", body: JSON.stringify({ clean }) },
    accessToken,
  );
}

export function refreshTableSessionToken(accessToken: string, sessionId: string) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/refresh-token`,
    { method: "POST" },
    accessToken,
  );
}

export function endTableSession(
  accessToken: string,
  sessionId: string,
  payload: { reason: WaiterSessionEndReason; note?: string },
) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/end`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

/** "I have been to this table" - clears the not-attended marker. */
export function attendTableSession(accessToken: string, sessionId: string) {
  return request<TableSession>(`/table-sessions/${sessionId}/attend`, { method: "POST" }, accessToken);
}

/** The waiter brings the bill without the customer asking - starts the
 * same bill-reminder cycle a customer's bill request does. */
export function presentTableSessionBill(accessToken: string, sessionId: string) {
  return request<TableSession>(`/table-sessions/${sessionId}/present-bill`, { method: "POST" }, accessToken);
}

export function confirmTableSessionBillPaid(
  accessToken: string,
  sessionId: string,
  note?: string,
  paymentMethod?: "cash" | "card" | "eft" | "other",
) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/confirm-bill-paid`,
    { method: "POST", body: JSON.stringify({ note, paymentMethod }) },
    accessToken,
  );
}

export function snoozeTableSessionBill(accessToken: string, sessionId: string, note: string) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/snooze-bill`,
    { method: "POST", body: JSON.stringify({ note }) },
    accessToken,
  );
}

export function getPendingTableOrders(accessToken: string) {
  return request<PendingTableOrder[]>("/table-service/orders/pending", {}, accessToken);
}

export function getSessionOrders(accessToken: string, sessionId: string) {
  return request<TableSessionOrders>(`/table-service/sessions/${sessionId}/orders`, {}, accessToken);
}

export function decideTableOrder(
  accessToken: string,
  orderId: string,
  body: { action: "accept_all" | "decline_all" | "review"; reason?: string; lines?: TableOrderLineDecision[] },
) {
  return request<TableOrder>(
    `/table-service/orders/${orderId}/decision`,
    { method: "POST", body: JSON.stringify(body) },
    accessToken,
  );
}

export function voidTableOrderLine(accessToken: string, lineId: string, reason?: string) {
  return request<TableOrder>(
    `/table-service/orders/lines/${lineId}/void`,
    { method: "POST", body: JSON.stringify({ reason }) },
    accessToken,
  );
}

export function acknowledgeTableRequest(
  accessToken: string,
  sessionId: string,
  requestId: string,
  note?: string,
) {
  return request<TableSession>(
    `/table-sessions/${sessionId}/requests/${requestId}/acknowledge`,
    { method: "POST", body: JSON.stringify({ note }) },
    accessToken,
  );
}

// ---- Tenant / branding ----

/** Unauthenticated - for the login/splash screens, which need this
 * deployment's branding before anyone has signed in. See the backend's
 * TenantController.get_public_branding. */
export function getPublicTenantBranding() {
  return request<Tenant>("/tenant/public-branding", {});
}

/** "Forgot password", step 1 - emails a 6-digit code the user types
 * back into the app (see confirmPasswordResetOtp), rather than the web
 * login screen's emailed link: a mobile app has no clean way to open a
 * deep link back into itself mid-flow the way a browser tab can. Same
 * deliberately-vague response either way - see AuthController.
 * request_password_reset_otp, which never reveals whether the email
 * matched an account. */
export function requestPasswordResetOtp(email: string) {
  return request<{ success: boolean; message: string }>("/auth/password-reset/otp/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** "Forgot password", step 2 - verifies the emailed code and sets the
 * new password in one call. The code is short-lived (10 min), single-use
 * and locks out after 5 wrong guesses - see AuthController.
 * confirm_password_reset_otp. A wrong email and a wrong/expired code
 * come back as the same error, so the UI shouldn't try to tell them
 * apart either. */
export function confirmPasswordResetOtp(email: string, code: string, password: string) {
  return request<{ success: boolean }>("/auth/password-reset/otp/verify", {
    method: "POST",
    body: JSON.stringify({ email, code, password }),
  });
}

export function getTenant(accessToken: string) {
  return request<Tenant>("/tenant", {}, accessToken);
}

// ---- Users ----

export function updateUser(accessToken: string, userId: string, payload: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) }, accessToken);
}

/** Builds a backend UserRecord payload from a DemoUser plus any overrides, filling required
 * fields the mobile app doesn't track (username, status) with sensible defaults. */
export function toUserRecord(user: DemoUser, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: user.id,
    username: user.email ?? user.id,
    displayName: user.name,
    email: user.email ?? `${user.id}@smartclean.local`,
    role: user.role,
    // Must match the backend's exact status string (case-sensitive - see
    // UserController.update_user's self-service check, and
    // AuthController.login, which both compare against "Active" exactly).
    // This was "active" (lowercase) until now, which meant every
    // self-service update from this app - including the profile photo
    // upload above - silently 403'd: is_self_service compares
    // str(record["status"]) != target.status, and "active" != "Active"
    // unconditionally.
    status: "Active",
    profilePhotoDataUrl: user.profilePhotoDataUrl,
    phone: user.phone,
    siteIds: user.siteIds,
    // The backend replaces the whole stored profile on every save, so a save
    // that leaves this out (a photo upload, say) would wipe the alert choices.
    notificationPrefs: user.notificationPrefs,
    ...overrides,
  };
}

// ---- Uploads ----

export async function uploadImage(accessToken: string, uri: string, filename: string, mimeType = "image/jpeg"): Promise<string> {
  const form = new FormData();
  // React Native's fetch/FormData accepts { uri, name, type } file parts.
  form.append("file", { uri, name: filename, type: mimeType } as unknown as Blob);
  const response = await fetch(`${API_BASE_URL}/upload/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  // FormData body, so this cannot go through request() (which forces
  // application/json). /upload/images is a core module, so a 402 here
  // means the subscription itself is inactive rather than a locked
  // feature - either way it must not surface as "Backend 402".
  if (!response.ok) {
    await throwForStatus(response);
  }
  const data = (await response.json()) as { filePath: string };
  return data.filePath;
}

// ---- Site layout (Enterprise-only "site_layout" module) ----

/** Whole-site PATCH. Note update_site does a SHALLOW merge at the
 * `geofence` key on the backend (see SiteController.update_site) - a
 * `spaceProfile` patch REPLACES the entire spaceProfile object, it does
 * not deep-merge per floor. Callers that want to change one floor must
 * send back the complete `floors` array (every floor, not just the
 * changed one) - see updateFloorPlanImage below, which does exactly
 * that. */
export function updateSite(accessToken: string, siteId: string, payload: Record<string, unknown>) {
  return request<Site>(`/sites/${siteId}`, { method: "PATCH", body: JSON.stringify(payload) }, accessToken);
}

/** Sets (or replaces) one floor's backdrop image, preserving every other
 * floor's data - the read-modify-write the shallow-merge gotcha above
 * requires. `site` must be the caller's current, already-loaded Site
 * (from state.sites), not refetched here, since there is no GET
 * /sites/{id} single-site endpoint on this app's surface. */
export function updateFloorPlanImage(
  accessToken: string,
  site: Site,
  floorId: string,
  planImage: SiteFloorPlanImage,
) {
  const floors = (site.profile?.floors ?? []).map((floor) =>
    floor.id === floorId ? { ...floor, planImage } : floor,
  );
  return updateSite(accessToken, site.id, {
    geofence: { spaceProfile: { floors, updatedAt: new Date().toISOString() } },
  });
}

export function updateLocationPosition(
  accessToken: string,
  locationId: string,
  payload: {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    points?: LocationLayoutPoint[];
  },
) {
  return request<Location>(
    `/site-layout/locations/${locationId}/position`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
}

function normalizeBootstrap(payload: Record<string, unknown>): BackendBootstrap {
  return {
    user: normalizeUser(payload.user as Record<string, unknown>),
    tenants: list(payload.tenants) as unknown as Tenant[],
    // Passed through as-is: the server already sends camelCase and the
    // RESOLVED module list, so there is nothing to derive here.
    subscription: payload.subscription as SubscriptionState | undefined,
    tagColors: (payload.tagColors as Record<string, string> | undefined) ?? {},
    staffRoles: list(payload.staffRoles) as unknown as StaffRole[],
    users: list(payload.users).map(normalizeUser),
    sites: list(payload.sites).map((site) => ({
      clientId: "",
      geofenceRadius: Number((site.geofence as { radiusMeters?: unknown } | undefined)?.radiusMeters ?? 0),
      ...site,
    })) as unknown as Site[],
    locations: list(payload.locations) as unknown as Location[],
    qrCodes: list(payload.qrCodes) as unknown as QrCode[],
    tasks: list(payload.tasks).map((task) => ({
      // Formatted here rather than at each "Due {dueTime}" render site:
      // this used to be String(...) of a raw ISO timestamp, which is
      // exactly what Home/Shifts/task detail then printed. Time only -
      // a task list is already grouped by day.
      // A task with a work window reads "08:00 - 10:00"; otherwise its deadline.
      dueTime: task.hasTimeRange
        ? `${formatTime(task.scheduledAt as string | undefined)} - ${formatTime(task.dueAt as string | undefined)}`
        : formatTime((task.dueTime ?? task.dueAt ?? task.scheduledAt) as string | undefined),
      estimatedMinutes: Number(task.estimatedMinutes ?? 30),
      ...task,
      evidence: list(task.evidence).map((evidence) => ({ imgSeed: 0, ...evidence })),
    })) as unknown as Task[],
    inspections: list(payload.inspections) as unknown as Inspection[],
    correctiveActions: list(payload.correctiveActions) as unknown as CorrectiveAction[],
    incidents: list(payload.incidents) as unknown as Incident[],
    notifications: list(payload.notifications).map((notification) => ({
      kind: String(notification.kind ?? notification.category ?? "system"),
      text: String(notification.text ?? notification.message ?? ""),
      channel: "in_app",
      ...notification,
    })) as unknown as Notification[],
    attendance:
      (payload.attendance as Record<string, { clockedInAt?: string; siteId?: string }>) ?? {},
    turnovers: list(payload.turnovers) as unknown as AirbnbTurnover[],
    stock: list(payload.stock) as unknown as StockItem[],
    assets: list(payload.assets).map((asset) => ({
      id: String(asset.id ?? asset.uid ?? asset.tag ?? ""),
      tag: String(asset.tag ?? asset.uid ?? ""),
      siteId: String(asset.siteId ?? ""),
      location: String(asset.location ?? asset.locationId ?? ""),
      condition: "good",
      available: true,
      history: [],
      ...asset,
    })) as unknown as Asset[],
  };
}

function normalizeUser(raw: Record<string, unknown>): DemoUser {
  const name = String(raw.name ?? raw.displayName ?? raw.username ?? "Team member");
  return {
    // Spread raw first so fields this function doesn't explicitly list
    // (e.g. phone) survive - previously this only picked 6 known fields
    // and silently dropped everything else the backend sent, the same
    // gap the web client's normalizeUser had before it was fixed.
    ...(raw as unknown as Partial<DemoUser>),
    id: String(raw.id),
    name,
    role: String(raw.role ?? "cleaner") as DemoUser["role"],
    initials: String(raw.initials ?? initials(name)),
    siteIds: Array.isArray(raw.siteIds) ? raw.siteIds.map(String) : [],
    email: raw.email ? String(raw.email) : undefined,
    profilePhotoDataUrl: raw.profilePhotoDataUrl ? String(raw.profilePhotoDataUrl) : undefined,
  };
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "S3";
}

// ---- Notifications ----

export function markNotificationRead(accessToken: string, notificationId: string) {
  return request<Record<string, unknown>>(
    `/notifications/${notificationId}/read`,
    { method: "PATCH" },
    accessToken,
  );
}

// ---- Push notifications ----
// Mirrors app.api.v1.push / app.controllers.push on the backend.

export function registerPushToken(accessToken: string, token: string, platform: string) {
  return request<{ registered: boolean }>(
    "/push-tokens",
    { method: "POST", body: JSON.stringify({ token, platform }) },
    accessToken,
  );
}

export function unregisterPushToken(accessToken: string, token: string) {
  return request<{ unregistered: boolean }>(
    "/push-tokens",
    { method: "DELETE", body: JSON.stringify({ token }) },
    accessToken,
  );
}

// ---- Platform console ----
//
// Mirrors app.api.v1.platform on the backend, which is gated by
// get_platform_owner: the system_admin role AND membership of the
// platform tenant. Only Šoma360's own operator staff can call any of
// these; a customer's org_admin gets a 403 whatever their plan.
//
// These screens read from here and NEVER from store bootstrap state.
// Bootstrap is tenant-scoped, and a platform admin's own tenant has no
// customer sites, tasks or users - so anything sourced from the store
// would render convincingly empty rather than wrong-and-obvious.

export interface PlatformOrganisation {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string | null;
  userCount: number;
  subscription: {
    tier: string;
    tierLabel: string | null;
    status: string;
    seats: number | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    billingEmail: string | null;
    modules: string[];
  } | null;
}

export interface PlatformSummary {
  totalOrganisations: number;
  totalActiveUsers: number;
  byTier: Record<string, number>;
  byStatus: Record<string, number>;
  signupsLast30Days: Record<string, number>;
  recentActivity: {
    id: string;
    tenantId: string;
    tenantName: string;
    action: string;
    actorEmail: string | null;
    occurredAt: string;
  }[];
}

/** One onboarding grant, as the operator's console sees it.
 *
 * Deliberately carries no claimId/claimSecret - those belong to the
 * scanning device alone. `matchWord` is the point of the approval
 * screen: the operator reads it against what the customer says. */
export interface OnboardingGrant {
  id: string;
  tenantId: string;
  organisationName: string | null;
  adminUserId: string;
  status: "pending" | "scanned" | "approved" | "rejected" | "revoked";
  attempt: number;
  matchWord: string | null;
  deviceLabel: string | null;
  scanIp: string | null;
  scannedAt: string | null;
  activatesAt: string | null;
  expiresAt: string | null;
  rejectedReason: string | null;
  collectedAt: string | null;
  isLive: boolean;
  /** Only present while the grant is still claimable - a spent code
   * cannot be re-rendered from a stale screen. */
  signedValue: string | null;
  createdAt: string | null;
}

export function getPlatformSummary(accessToken: string) {
  return request<PlatformSummary>("/platform/organisations/summary", {}, accessToken);
}

export function listPlatformOrganisations(accessToken: string, page = 1, pageSize = 25) {
  return request<{ items: PlatformOrganisation[]; total: number }>(
    `/platform/organisations?page=${page}&pageSize=${pageSize}`,
    {},
    accessToken,
  );
}

export function getPlatformOrganisation(accessToken: string, tenantId: string) {
  return request<PlatformOrganisation>(`/platform/organisations/${tenantId}`, {}, accessToken);
}

export interface PlatformSite {
  id: string;
  name: string;
  address: string;
  active: boolean;
  tenantId: string;
  tenantName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number | null;
}

/** Every customer site with real coordinates, across every organisation
 * - a site with no geofence configured is silently excluded server-side
 * (see PlatformController.list_all_sites), same as the web console's
 * Sites map. No pagination - the organisation detail screen's own Sites
 * section filters this down to one tenantId client-side, same pattern
 * as web's PlatformSitesTab. */
export function listPlatformSites(accessToken: string) {
  return request<PlatformSite[]>("/platform/organisations/sites", {}, accessToken);
}

export function setPlatformOrganisationState(
  accessToken: string,
  tenantId: string,
  action: "suspend" | "reactivate" | "cancel",
) {
  return request<PlatformOrganisation>(
    `/platform/organisations/${tenantId}/${action}`,
    { method: "POST" },
    accessToken,
  );
}

export function updatePlatformSubscription(
  accessToken: string,
  tenantId: string,
  payload: { tier?: string; seats?: number | null },
) {
  return request<PlatformOrganisation>(
    `/platform/organisations/${tenantId}/subscription`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
}

/** Create an organisation. deliveryMethod "qr" suppresses the invite
 * email and mints an onboarding grant instead - the two are mutually
 * exclusive server-side, since two live ways into one account means the
 * unwatched one is the liability. */
export function provisionOrganisation(
  accessToken: string,
  payload: {
    organisationName: string;
    adminDisplayName: string;
    adminEmail: string;
    tier: string;
    seats?: number | null;
    deliveryMethod?: "email" | "qr";
  },
) {
  return request<PlatformOrganisation & { adminUserId: string; adminEmail: string; deliveryMethod: string }>(
    "/platform/organisations",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

// ---- QR onboarding, operator side ----

export function getOnboardingStatus(accessToken: string, tenantId: string) {
  return request<{ grant: OnboardingGrant | null }>(
    `/platform/organisations/${tenantId}/onboarding`,
    {},
    accessToken,
  );
}

/** Opens the 15-minute live window. This - not provisioning - is when
 * the code becomes scannable, which is what makes a screenshot taken
 * earlier useless. */
export function revealOnboardingCode(accessToken: string, tenantId: string) {
  return request<OnboardingGrant>(
    `/platform/organisations/${tenantId}/onboarding/reveal`,
    { method: "POST" },
    accessToken,
  );
}

export function reopenOnboardingCode(accessToken: string, tenantId: string) {
  return request<OnboardingGrant>(
    `/platform/organisations/${tenantId}/onboarding/reopen`,
    { method: "POST" },
    accessToken,
  );
}

export function revokeOnboardingCode(accessToken: string, tenantId: string) {
  return request<OnboardingGrant>(
    `/platform/organisations/${tenantId}/onboarding/revoke`,
    { method: "POST" },
    accessToken,
  );
}

export function listPendingOnboarding(accessToken: string) {
  return request<OnboardingGrant[]>("/platform/onboarding/pending", {}, accessToken);
}

export function approveOnboarding(accessToken: string, grantId: string) {
  return request<OnboardingGrant>(
    `/platform/onboarding/${grantId}/approve`,
    { method: "POST" },
    accessToken,
  );
}

export function rejectOnboarding(accessToken: string, grantId: string, reason?: string) {
  return request<OnboardingGrant>(
    `/platform/onboarding/${grantId}/reject`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    accessToken,
  );
}

/** The QR image URL. Authenticated, unlike /codes/render/qr.svg - this
 * code is a claim on an account that doesn't exist yet, so it's served
 * only to the operator who owns it. Fetched rather than used as an
 * <Image src>, since RN can't attach an Authorization header to one. */
export async function fetchOnboardingQrSvg(
  accessToken: string,
  tenantId: string,
): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/platform/organisations/${tenantId}/onboarding/qr.svg`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    await throwForStatus(response);
  }
  return response.text();
}

// ---- QR onboarding, customer side ----
//
// Unauthenticated by necessity: the device calling these has no account
// yet. None returns a credential except collectOnboarding, and only
// after a platform admin approved the scan AND this device proves it
// holds the claim secret it generated locally.

export function scanOnboardingCode(value: string, deviceLabel?: string) {
  return request<{
    claimId: string;
    claimSecret: string;
    matchWord: string;
    organisationName: string | null;
    status: string;
    expiresAt: string | null;
  }>("/auth/onboarding/scan", {
    method: "POST",
    body: JSON.stringify({ value, deviceLabel: deviceLabel ?? null }),
  });
}

export function pollOnboarding(claimId: string, claimSecret: string) {
  return request<{
    status: string;
    organisationName: string | null;
    matchWord: string | null;
    rejectedReason: string | null;
    ready: boolean;
    expiresAt: string | null;
  }>("/auth/onboarding/poll", {
    method: "POST",
    body: JSON.stringify({ claimId, claimSecret }),
  });
}

export async function collectOnboarding(claimId: string, claimSecret: string) {
  const auth = await request<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: Record<string, unknown>;
    mustChangePassword: boolean;
    hasSeenWelcome?: boolean;
  }>("/auth/onboarding/collect", {
    method: "POST",
    body: JSON.stringify({ claimId, claimSecret }),
  });
  const session: BackendSession = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
  };
  const bootstrap = await loadBackendBootstrap(session.accessToken);
  return {
    session,
    bootstrap,
    mustChangePassword: auth.mustChangePassword,
    hasSeenWelcome: auth.hasSeenWelcome ?? false,
  };
}

/** Sets the first password for an account flagged mustChangePassword.
 * Takes no current password - see AuthController.set_initial_password
 * for why /auth/change-password cannot serve these accounts. */
export function setInitialPassword(accessToken: string, password: string) {
  return request<{ success: boolean }>(
    "/auth/set-initial-password",
    { method: "POST", body: JSON.stringify({ password }) },
    accessToken,
  );
}

/** Discharges the one-time post-onboarding welcome screen so it never
 * shows again for this account, on any device. */
export function markWelcomeSeen(accessToken: string) {
  return request<{ success: boolean }>(
    "/auth/welcome-seen",
    { method: "POST", body: JSON.stringify({}) },
    accessToken,
  );
}

// ---- QR staff onboarding ----
//
// Mirrors app.api.v1.users' /staff-onboarding routes (manager side) and
// app.api.v1.auth's (the new starter's side). The same handshake the
// platform console uses for whole organisations, issued here by an
// organisation's own managers for people they may already add via
// POST /users - see StaffOnboardingController's docstring for why this
// is a delivery channel rather than a new power.

/** One staff grant, as a manager's screen sees it. No claim pair: that
 * belongs to the scanning device alone. */
export interface StaffGrant {
  id: string;
  staffUserId: string;
  staffName: string | null;
  staffEmail: string | null;
  role: string | null;
  siteName: string | null;
  status: "pending" | "scanned" | "approved" | "rejected" | "revoked";
  attempt: number;
  matchWord: string | null;
  deviceLabel: string | null;
  scanIp: string | null;
  scannedAt: string | null;
  expiresAt: string | null;
  rejectedReason: string | null;
  collectedAt: string | null;
  isLive: boolean;
  signedValue: string | null;
  createdAt: string | null;
}

export function createStaffOnboarding(
  accessToken: string,
  payload: { displayName: string; email: string; role: string; siteId?: string | null },
) {
  return request<StaffGrant>(
    "/users/staff-onboarding",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function listPendingStaffOnboarding(accessToken: string) {
  return request<StaffGrant[]>("/users/staff-onboarding/pending", {}, accessToken);
}

export function approveStaffOnboarding(accessToken: string, grantId: string) {
  return request<StaffGrant>(
    `/users/staff-onboarding/${grantId}/approve`,
    { method: "POST" },
    accessToken,
  );
}

export function rejectStaffOnboarding(accessToken: string, grantId: string, reason?: string) {
  return request<StaffGrant>(
    `/users/staff-onboarding/${grantId}/reject`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    accessToken,
  );
}

export function getStaffOnboardingStatus(accessToken: string, staffUserId: string) {
  return request<{ grant: StaffGrant | null }>(
    `/users/${staffUserId}/staff-onboarding`,
    {},
    accessToken,
  );
}

/** Opens the 15-minute live window. A POST, not a side effect of
 * fetching the image: the QR endpoint is a GET that may be refetched at
 * any time, and revealing on each fetch would mean the window never
 * actually expired. */
export function revealStaffOnboardingCode(accessToken: string, staffUserId: string) {
  return request<StaffGrant>(
    `/users/${staffUserId}/staff-onboarding/reveal`,
    { method: "POST" },
    accessToken,
  );
}

export function reopenStaffOnboardingCode(accessToken: string, staffUserId: string) {
  return request<StaffGrant>(
    `/users/${staffUserId}/staff-onboarding/reopen`,
    { method: "POST" },
    accessToken,
  );
}

/** The QR image. Authenticated, so fetched rather than used as an
 * <Image src> - RN cannot attach an Authorization header to one. */
export async function fetchStaffOnboardingQrSvg(
  accessToken: string,
  staffUserId: string,
): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/users/${staffUserId}/staff-onboarding/qr.svg`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    await throwForStatus(response);
  }
  return response.text();
}

// ---- QR staff onboarding, the new starter's side ----
//
// Unauthenticated: the person calling these has an account that is not
// usable yet. Nothing returns a credential except collect, and only
// after a manager approved the scan AND this device proves it holds the
// claim secret it generated locally.

export function scanStaffOnboardingCode(value: string, deviceLabel?: string) {
  return request<{
    claimId: string;
    claimSecret: string;
    matchWord: string;
    organisationName: string | null;
    staffFirstName: string | null;
    status: string;
    expiresAt: string | null;
  }>("/auth/staff-onboarding/scan", {
    method: "POST",
    body: JSON.stringify({ value, deviceLabel: deviceLabel ?? null }),
  });
}

export function pollStaffOnboarding(claimId: string, claimSecret: string) {
  return request<{
    status: string;
    organisationName: string | null;
    matchWord: string | null;
    rejectedReason: string | null;
    ready: boolean;
    expiresAt: string | null;
  }>("/auth/staff-onboarding/poll", {
    method: "POST",
    body: JSON.stringify({ claimId, claimSecret }),
  });
}

export async function collectStaffOnboarding(claimId: string, claimSecret: string) {
  const auth = await request<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: Record<string, unknown>;
    mustChangePassword: boolean;
    hasSeenWelcome?: boolean;
  }>("/auth/staff-onboarding/collect", {
    method: "POST",
    body: JSON.stringify({ claimId, claimSecret }),
  });
  const session: BackendSession = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    expiresAt: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
  };
  const bootstrap = await loadBackendBootstrap(session.accessToken);
  return {
    session,
    bootstrap,
    mustChangePassword: auth.mustChangePassword,
    hasSeenWelcome: auth.hasSeenWelcome ?? false,
  };
}

// ---- Inspections ----

/** Approve (score >= 80) or send a task back (with a reason, which also
 * creates a corrective action). Same endpoint the web inspector uses. */
export function decideInspection(
  accessToken: string,
  inspectionId: string,
  payload: {
    decision: "approve" | "reject";
    score: number;
    scores?: Record<string, number>;
    comments?: string;
    reason?: string;
  },
) {
  return request<Record<string, unknown>>(
    `/inspections/${inspectionId}/decision`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

// ---- Visitor wayfinding (staff installing beacons) ----

export interface WayfindingBeaconRecord {
  id: string;
  code: string;
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
  safePoint: boolean;
  active: boolean;
  edgeCount: number;
}

export function listWayfindingBeacons(accessToken: string, siteId: string) {
  return request<WayfindingBeaconRecord[]>(
    `/wayfinding/beacons?siteId=${encodeURIComponent(siteId)}`,
    {},
    accessToken,
  );
}

/** Installs a beacon at the phone's current position; the server links it
 * to the nearest existing beacons automatically. */
export function installWayfindingBeacon(
  accessToken: string,
  payload: {
    siteId: string;
    name: string;
    kind: string;
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    safePoint: boolean;
  },
) {
  return request<WayfindingBeaconRecord>(
    "/wayfinding/beacons",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

/** A staff walk between two beacons: trusted on its own, marks the path
 * verified and completes any open "walk this path" task. `blocked` closes it. */
export function recordWayfindingPatrol(
  accessToken: string,
  payload: {
    aBeaconId: string;
    bBeaconId: string;
    seconds?: number;
    blocked?: boolean;
    note?: string;
    /** The GPS track as walked, [[lat, lng], ...]; the server keeps it (simplified) as the path's shape. */
    trail?: number[][];
  },
) {
  return request<{ tasksCompleted: number; walkSeconds: number; shapeSource?: string | null }>(
    "/wayfinding/patrol",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

/** Marks many notifications read in one request (the server takes a list of ids). */
export function markNotificationsRead(accessToken: string, ids: string[]) {
  return request<{ updated: number }>(
    "/notifications/read",
    { method: "PATCH", body: JSON.stringify({ ids }) },
    accessToken,
  );
}

/** The optional note the person doing a task leaves for the reviewer. An empty note clears it. */
export function saveTaskNote(accessToken: string, taskId: string, note: string) {
  return request<Task>(`/tasks/${taskId}/note`, { method: "PUT", body: JSON.stringify({ note }) }, accessToken);
}

export interface WayfindingEdgeRecord {
  id: string;
  aBeaconId: string;
  bBeaconId: string;
  status: "open" | "closed" | "hazard";
  source: "geometry" | "observed" | "manual";
  confidence: number;
  verifiedAt: string | null;
  /** The points between the two signs, from a to b; empty means a straight line (a guess). */
  polyline?: number[][];
  shapeSource?: "walked" | "drawn" | null;
}

/** The walkable links between a site's signs (for drawing the map). */
export function listWayfindingEdges(accessToken: string, siteId: string) {
  return request<WayfindingEdgeRecord[]>(
    `/wayfinding/edges?siteId=${encodeURIComponent(siteId)}`,
    {},
    accessToken,
  );
}

// ---- Feedback ----

export interface FeedbackPayload {
  category: "bug" | "idea" | "question" | "other";
  message: string;
  /** Paths from uploadImage, at most five. */
  filePaths: string[];
  appVersion?: string;
  platform?: string;
}

/** Emails the platform operators (server side: ADMIN_ALERT_EMAILS). */
export function sendFeedback(accessToken: string, payload: FeedbackPayload) {
  return request<{ sent: boolean; photosAttached: number; photosSkipped: number }>(
    "/feedback",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}


// ---- Stock ----
// The server decides who may do what (role, and the organisation's stock
// policy); these only carry the request.

const stockRequest = <T,>(accessToken: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
  request<T>(`/stock${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken);

export const getStockAccess = (accessToken: string) => stockRequest<StockAccess>(accessToken, "/access");

export const listStockLocations = (accessToken: string, siteId: string) =>
  stockRequest<StockLocation[]>(accessToken, `/locations?siteId=${encodeURIComponent(siteId)}`);

export const listStockLevels = (accessToken: string, siteId: string) =>
  stockRequest<StockLevel[]>(accessToken, `/levels?siteId=${encodeURIComponent(siteId)}`);

export const listStockRestockTasks = (accessToken: string, siteId: string) =>
  stockRequest<StockRestockTask[]>(accessToken, `/restock-tasks?siteId=${encodeURIComponent(siteId)}`);

export const listStockTransfersInTransit = (accessToken: string, siteId: string) =>
  stockRequest<StockTransfer[]>(accessToken, `/transfers?status=in_transit&siteId=${encodeURIComponent(siteId)}`);

/** A site's stock at a glance. siteId "all" is every site together: organisation admins and operations managers only. */
export const getStockOverview = (accessToken: string, siteId: string, days = 30) =>
  stockRequest<StockOverview>(accessToken, `/overview?siteId=${encodeURIComponent(siteId)}&days=${days}`);

/** Stock lent to other sites and not yet back, and stock this site has borrowed. */
export const listStockLoans = (accessToken: string, siteId: string) =>
  stockRequest<{ toBeReturned: StockLoan[]; weOwe: StockLoan[] }>(accessToken, `/loans?siteId=${encodeURIComponent(siteId)}`);

/** The borrower sends (part of) a loan back; the lender confirms it on arrival like any transfer. */
export const returnStockLoan = (accessToken: string, loanId: string, qty: number) =>
  stockRequest<StockTransfer>(accessToken, `/loans/${encodeURIComponent(loanId)}/return`, { qty });

export const issueStock = (
  accessToken: string,
  payload: {
    itemId: string;
    locationId: string;
    qty: number;
    referenceType: "task" | "round" | "location";
    referenceId: string;
    /** Set on a queued request: a replay returns the first result instead of booking twice. */
    clientRef?: string;
    /** When it really happened (a request queued offline). */
    occurredAt?: string;
  },
) => stockRequest<StockMovement>(accessToken, "/issue", payload);

export const logStockWaste = (
  accessToken: string,
  payload: { itemId: string; locationId: string; qty: number; reasonCode: string; clientRef?: string; occurredAt?: string },
) => stockRequest<StockMovement>(accessToken, "/waste", payload);

export const receiveStockDelivery = (
  accessToken: string,
  payload: {
    locationId: string;
    supplier: string;
    deliveryRef?: string;
    /** unit: "base", "pack", or the name of one of the item's units. */
    lines: { itemId: string; qty: number; unit: string; ordered?: number }[];
  },
) => stockRequest<StockMovement[]>(accessToken, "/receive", payload);

export const receiveStockTransfer = (accessToken: string, id: string) =>
  stockRequest<StockTransfer>(accessToken, `/transfers/${id}/receive`, {});

export const completeStockRestockTask = (accessToken: string, id: string) =>
  stockRequest<StockRestockTask>(accessToken, `/restock-tasks/${id}/complete`, {});

// Cycle counts: blind until submitted (the server withholds the expected figure).
export const startStockCount = (
  accessToken: string,
  siteId: string,
  options: { kind?: "handover" | "cycle"; shiftId?: string } = {},
) => stockRequest<StockCountSession>(accessToken, "/counts", { siteId, ...options });

export const assignStockCountLines = (accessToken: string, countId: string, assigneeId: string | null, lineIds: string[]) =>
  stockRequest<StockCountSession>(accessToken, `/counts/${countId}/assign`, { assigneeId, lineIds });

export const listStockCountHelpers = (accessToken: string, siteId: string, countId?: string) =>
  stockRequest<StockCountHelper[]>(
    accessToken,
    `/sites/${encodeURIComponent(siteId)}/counters${countId ? `?countId=${encodeURIComponent(countId)}` : ""}`,
  );

export const listStockShifts = (accessToken: string, siteId: string) =>
  stockRequest<StockShift[]>(accessToken, `/sites/${encodeURIComponent(siteId)}/shifts`);

export const getStockHandoverReport = (accessToken: string, siteId: string, start?: string, end?: string) => {
  const params = new URLSearchParams({ siteId });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  return stockRequest<StockHandoverReport>(accessToken, `/report/handovers?${params}`);
};

export const enterStockCount = (accessToken: string, countId: string, lineId: string, counted: number) =>
  stockRequest<StockCountSession>(accessToken, `/counts/${countId}/lines/${lineId}`, { counted }, "PUT");

export const submitStockCount = (accessToken: string, countId: string) =>
  stockRequest<StockCountSession>(accessToken, `/counts/${countId}/submit`, {});

export const giveStockCountReason = (accessToken: string, countId: string, lineId: string, reasonCode: string) =>
  stockRequest<StockCountSession>(accessToken, `/counts/${countId}/lines/${lineId}/reason`, { reasonCode });

export const decideStockCountLine = (accessToken: string, countId: string, lineId: string, approve: boolean) =>
  stockRequest<StockCountSession>(accessToken, `/counts/${countId}/lines/${lineId}/decision`, { approve });

export const listStockConversions = (accessToken: string, siteId: string) =>
  stockRequest<StockConversion[]>(accessToken, `/conversions?siteId=${encodeURIComponent(siteId)}`);

// ---- Gamification ----

export type GamificationPeriod = "week" | "month";

export interface PointsBreakdownLine {
  label: string;
  count: number | null;
  points: number;
}

export interface GamificationBadge {
  key: string;
  label: string;
  description: string;
  earnedAt: string;
}

export type MyProgress =
  | { enabled: false }
  | {
      enabled: true;
      period: GamificationPeriod;
      siteId: string;
      siteName: string;
      rank: number | null;
      of: number;
      streak: number;
      longestStreak: number;
      badges: GamificationBadge[];
      points: number;
      tasks: number;
      onTime: number;
      punctualShifts: number;
      breakdown: PointsBreakdownLine[];
    };

/** The caller's own points, position, streak and badges. Self-service: the server only ever
 * returns the signed-in person's own numbers - never another person's name or points. */
export function getMyProgress(accessToken: string, period: GamificationPeriod) {
  return request<MyProgress>(`/gamification/me?period=${period}`, {}, accessToken);
}


// ---- Pay runs (organisation administrators and operations managers only) ----

export interface PayRuleRecord {
  id: string;
  name: string;
  description: string;
}

export interface PayAdjustment {
  label: string;
  amount: string;
}

export interface PayDay {
  manual?: boolean;
  label?: string;
  hoursEntered?: string | null;
  dayId: string;
  date: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  workedMinutes: number | null;
  counted: boolean;
  reason: string | null;
  fraction: string;
  multiplier: string;
  baseHours: string;
  paidHours: string;
}

export interface PayPerson {
  /** False for someone deliberately left out of this run. */
  included?: boolean;
  userId: string;
  name: string;
  hasRate: boolean;
  rate: string;
  daysCounted: string;
  daysExcluded: number;
  unapprovedDays?: number;
  paidHours: string;
  earned: string;
  adjustments: PayAdjustment[];
  adjustmentTotal: string;
  gross: string;
  days: PayDay[];
}

export interface PayTotals {
  people: number;
  daysCounted: string;
  daysExcluded: number;
  paidHours: string;
  earned: string;
  adjustments: string;
  gross: string;
}

export interface PayManualEntry {
  label: string;
  date: string | null;
  days: string;
  hours: string | null;
}

export interface PayHoliday {
  date: string;
  multiplier: string;
  label?: string;
}

export interface PayRunInput {
  title: string;
  siteIds: string[];
  start: string;
  end: string;
  ruleId: string | null;
  rule: Record<string, never> | null;
  holidays: PayHoliday[];
  rates: Record<string, string | null>;
  adjustments: Record<string, PayAdjustment[]>;
  manual: Record<string, PayManualEntry[]>;
  includeUserIds: string[];
  /** Left out on purpose, for a run covering one person or a chosen few. */
  excludeUserIds: string[];
  notes: string | null;
}

export interface PayPreview {
  ruleName: string;
  ruleDescription: string;
  people: PayPerson[];
  totals: PayTotals;
  lastRates: Record<string, string>;
  candidates: { userId: string; name: string; role: string }[];
}

export interface PayRun {
  id: string;
  title: string;
  siteIds: string[];
  siteNames: string[];
  periodStart: string;
  periodEnd: string;
  ruleId: string | null;
  excludedUserIds: string[];
  ruleName: string;
  ruleDescription: string;
  holidays: PayHoliday[];
  currency: string;
  status: "draft" | "final" | "void";
  totals: PayTotals;
  notes: string | null;
  createdByName: string;
  finalisedByName: string | null;
  finalisedAt: string | null;
  voidReason: string | null;
  people?: PayPerson[];
}

export const listPayRules = (t: string) => request<PayRuleRecord[]>("/payroll/rules", {}, t);
export const previewPayRun = (t: string, input: PayRunInput) =>
  request<PayPreview>("/payroll/runs/preview", { method: "POST", body: JSON.stringify(input) }, t);
export const listPayRuns = (t: string) => request<PayRun[]>("/payroll/runs", {}, t);
export const getPayRun = (t: string, id: string) => request<PayRun>(`/payroll/runs/${id}`, {}, t);
export const createPayRun = (t: string, input: PayRunInput) =>
  request<PayRun>("/payroll/runs", { method: "POST", body: JSON.stringify(input) }, t);
export const updatePayRun = (t: string, id: string, input: PayRunInput) =>
  request<PayRun>(`/payroll/runs/${id}`, { method: "PUT", body: JSON.stringify(input) }, t);
export const finalisePayRun = (t: string, id: string) =>
  request<PayRun>(`/payroll/runs/${id}/finalise`, { method: "POST" }, t);
export const voidPayRun = (t: string, id: string, reason: string) =>
  request<PayRun>(`/payroll/runs/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }, t);
export const deletePayRunDraft = (t: string, id: string) =>
  request<void>(`/payroll/runs/${id}`, { method: "DELETE" }, t);
export const logPayRunExport = (t: string, id: string, document: string, person?: string) =>
  request<void>(
    `/payroll/runs/${id}/exports`,
    { method: "POST", body: JSON.stringify({ document, person: person ?? null }) },
    t,
  );

// ---- Staff scheduling ----
export type BookingSite = { id: string; name: string; address: string; latitude: number | null; longitude: number | null };
export type StaffBooking = {
  id: string;
  siteId: string;
  site: BookingSite;
  userId: string;
  userName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** The shifts the booking covers (a double shift names both). Empty for custom hours or all day. */
  shiftIds: string[];
  shiftNames: string[];
  instructions: string;
  status: "booked" | "cancelled";
  notified: string[];
  bookedBy: string;
  tasks: { id: string; title: string; status: string }[];
};
export type BookStaffInput = {
  siteId: string;
  userIds: string[];
  dates: string[];
  /** Shifts to book onto, or leave empty and give times. Times typed by hand win. */
  shiftIds?: string[];
  startTime: string | null;
  endTime: string | null;
  instructions: string;
};
export const listMyBookings = (t: string, start: string, end: string) =>
  request<StaffBooking[]>(`/schedule/mine?start=${start}&end=${end}`, {}, t);
export const listSiteBookings = (t: string, start: string, end: string) =>
  request<StaffBooking[]>(`/schedule/bookings?start=${start}&end=${end}`, {}, t);
export const listBookablePeople = (t: string, siteId: string) =>
  request<{ id: string; name: string; role: string }[]>(`/schedule/people?siteId=${encodeURIComponent(siteId)}`, {}, t);
export const bookStaff = (t: string, input: BookStaffInput) =>
  request<{ created: StaffBooking[]; skipped: { userId: string; userName: string; date: string }[] }>(
    "/schedule/bookings",
    { method: "POST", body: JSON.stringify(input) },
    t,
  );
/** The shifts set up for a site. They belong to Schedule: bookings name them, clock-in takes its
 * expected hours from them, and stock handover counts follow them. */
export const listSiteShifts = (t: string, siteId: string) =>
  request<StockShift[]>(`/schedule/shifts?siteId=${encodeURIComponent(siteId)}`, {}, t);
export const saveSiteShifts = (
  t: string,
  siteId: string,
  shifts: { id?: string; name: string; startTime: string; endTime: string }[],
) =>
  request<StockShift[]>(
    `/schedule/sites/${encodeURIComponent(siteId)}/shifts`,
    { method: "PUT", body: JSON.stringify({ shifts }) },
    t,
  );
export const cancelBooking = (t: string, id: string) =>
  request<StaffBooking>(`/schedule/bookings/${id}/cancel`, { method: "POST" }, t);

// ---- Leave ----
export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";
export type LeaveType = {
  id: string;
  key: string;
  name: string;
  paid: boolean;
  /** Days a person gets each year. Null means no limit (unpaid leave). */
  daysPerYear: number | null;
  /** A medical note is needed when a request is longer than this many days. */
  noteAfterDays: number | null;
  active: boolean;
};
export type LeaveRequest = {
  id: string;
  siteId: string;
  userId: string;
  userName: string;
  typeId: string;
  typeName: string;
  paid: boolean;
  startDate: string;
  endDate: string;
  halfDay: "am" | "pm" | null;
  days: number;
  status: LeaveStatus;
  reason: string;
  noteUrl: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  recordedByManager: boolean;
  /** Set on a decision: bookings taken off and open tasks to reassign. */
  cancelledBookings?: number;
  openTasks?: number;
};
export type LeaveBalance = {
  typeId: string;
  typeName: string;
  paid: boolean;
  allowance: number | null;
  adjusted: number;
  taken: number;
  pending: number;
  remaining: number | null;
};
export type LeaveBalances = { userId: string; userName: string; year: number; balances: LeaveBalance[] };
export type LeaveRequestInput = {
  typeId: string;
  startDate: string;
  endDate: string;
  halfDay?: "am" | "pm" | null;
  reason?: string;
  noteUrl?: string | null;
};

export const listLeaveTypes = (t: string) => request<LeaveType[]>("/leave/types", {}, t);
export const getLeaveBalances = (t: string) => request<LeaveBalances>("/leave/balance", {}, t);
export const listLeaveRequests = (t: string, q: { status?: LeaveStatus; mine?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (q.status) params.set("status", q.status);
  if (q.mine) params.set("mine", "true");
  return request<LeaveRequest[]>(`/leave/requests?${params}`, {}, t);
};
export const requestLeave = (t: string, input: LeaveRequestInput) =>
  request<LeaveRequest>("/leave/requests", { method: "POST", body: JSON.stringify(input) }, t);
export const recordLeave = (t: string, input: LeaveRequestInput & { userId: string }) =>
  request<LeaveRequest>("/leave/requests/record", { method: "POST", body: JSON.stringify(input) }, t);
export const decideLeave = (t: string, id: string, approve: boolean, note?: string) =>
  request<LeaveRequest>(`/leave/requests/${id}/decision`, { method: "POST", body: JSON.stringify({ approve, note: note ?? null }) }, t);
export type OvertimeStatus = "awaiting_approval" | "approved" | "declined" | "expired" | "cancelled";
export interface OvertimeRequest {
  id: string;
  siteId: string;
  userId: string;
  userName: string;
  dayId: string;
  shiftEndAt: string;
  requestedAt: string;
  reason: string;
  status: OvertimeStatus;
  approverTier: "supervisor" | "site_manager" | "operations_manager";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}
/** pending: waiting for me to decide; history: decided at my sites; mine: my own requests. */
export const listOvertime = (t: string, scope: "pending" | "history" | "mine" = "pending") =>
  request<{ requests: OvertimeRequest[] }>(`/attendance/overtime?scope=${scope}`, {}, t).then((r) => r.requests);
export const decideOvertime = (t: string, id: string, approve: boolean, note?: string) =>
  request<OvertimeRequest>(`/attendance/overtime/${id}/decide`, { method: "POST", body: JSON.stringify({ approve, note: note ?? null }) }, t);
export const requestOvertime = (t: string, reason: string, requestedAt?: string) =>
  request<OvertimeRequest>("/attendance/overtime", { method: "POST", body: JSON.stringify({ reason, requestedAt }) }, t);

export const cancelLeave = (t: string, id: string) => request<LeaveRequest>(`/leave/requests/${id}/cancel`, { method: "POST" }, t);
