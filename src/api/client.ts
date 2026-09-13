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
  StockItem,
  SubscriptionState,
  Task,
  Tenant,
} from "@/types/smartclean";

const extraUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  extraUrl ||
  "http://10.0.2.2:8000/api/v1"
).replace(/\/$/, "");

export function fileUrl(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return `${API_BASE_URL}/${filePath.replace(/^\/+/, "")}`;
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
  return { session, bootstrap };
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
  // family, see AuthController.refresh) — the old one is now invalid, so
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
// — it needs the current refresh token and somewhere to persist the
// rotated session it gets back. SmartCleanProvider registers those once
// via setSessionHandlers() on mount; request() uses them to transparently
// refresh-and-retry once on a 401 instead of surfacing "Backend 401" to
// whichever screen happened to be mid-action. Previously there was no
// refresh call anywhere in the app — POST /auth/refresh existed and
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
 * failed — callers fall back to surfacing the original 401 in that case. */
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
  patch: { done?: boolean; value?: string },
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
  evidence: { kind: string; label?: string; filePath?: string; liveCapture?: boolean; offlineOriginated?: boolean },
) {
  return request<Task>(
    `/tasks/${taskId}/evidence`,
    { method: "POST", body: JSON.stringify(evidence) },
    accessToken,
  );
}

export function submitTask(accessToken: string, taskId: string) {
  return request<Task>(
    `/tasks/${taskId}/submit`,
    { method: "POST", body: JSON.stringify({ declarationAccepted: true }) },
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

export function clockIn(accessToken: string, payload: { siteId: string; qrValue: string; latitude?: number; longitude?: number }) {
  return request<Record<string, unknown>>("/attendance/clock-in", { method: "POST", body: JSON.stringify(payload) }, accessToken);
}

export function clockOut(accessToken: string, payload: { siteId: string; qrValue: string; latitude?: number; longitude?: number }) {
  return request<Record<string, unknown>>("/attendance/clock-out", { method: "POST", body: JSON.stringify(payload) }, accessToken);
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

// ---- Tenant / branding ----

/** Unauthenticated — for the login/splash screens, which need this
 * deployment's branding before anyone has signed in. See the backend's
 * TenantController.get_public_branding. */
export function getPublicTenantBranding() {
  return request<Tenant>("/tenant/public-branding", {});
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
    // Must match the backend's exact status string (case-sensitive — see
    // UserController.update_user's self-service check, and
    // AuthController.login, which both compare against "Active" exactly).
    // This was "active" (lowercase) until now, which meant every
    // self-service update from this app — including the profile photo
    // upload above — silently 403'd: is_self_service compares
    // str(record["status"]) != target.status, and "active" != "Active"
    // unconditionally.
    status: "Active",
    profilePhotoDataUrl: user.profilePhotoDataUrl,
    phone: user.phone,
    siteIds: user.siteIds,
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
    users: list(payload.users).map(normalizeUser),
    sites: list(payload.sites).map((site) => ({
      clientId: "",
      geofenceRadius: Number((site.geofence as { radiusMeters?: unknown } | undefined)?.radiusMeters ?? 0),
      ...site,
    })) as unknown as Site[],
    locations: list(payload.locations) as unknown as Location[],
    qrCodes: list(payload.qrCodes) as unknown as QrCode[],
    tasks: list(payload.tasks).map((task) => ({
      dueTime: String(task.dueTime ?? task.dueAt ?? task.scheduledAt ?? ""),
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
