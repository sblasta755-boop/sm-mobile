import Constants from "expo-constants";
import type {
  AirbnbTurnover,
  Asset,
  CorrectiveAction,
  DemoUser,
  Incident,
  Inspection,
  Location,
  Notification,
  QrCode,
  Site,
  StockItem,
  Task,
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
  users: DemoUser[];
  sites: Site[];
  locations: Location[];
  qrCodes: QrCode[];
  tasks: Task[];
  inspections: Inspection[];
  correctiveActions: CorrectiveAction[];
  incidents: Incident[];
  notifications: Notification[];
  attendance: Record<string, { clockedInAt?: string; siteId?: string }>;
  turnovers: AirbnbTurnover[];
  stock: StockItem[];
  assets: Asset[];
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
    const body = await response.text();
    throw new Error(`Backend ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
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

// ---- QR / codes ----

export function resolveQr(accessToken: string, value: string, latitude?: number, longitude?: number) {
  return request<Record<string, unknown>>(
    "/codes/resolve",
    { method: "POST", body: JSON.stringify({ value, latitude, longitude }) },
    accessToken,
  );
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
    status: "active",
    profilePhotoDataUrl: user.profilePhotoDataUrl,
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
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend ${response.status}: ${body}`);
  }
  const data = (await response.json()) as { filePath: string };
  return data.filePath;
}

function normalizeBootstrap(payload: Record<string, unknown>): BackendBootstrap {
  return {
    user: normalizeUser(payload.user as Record<string, unknown>),
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
  const name = String(raw.name ?? raw.displayName ?? raw.username ?? "Šoma360 User");
  return {
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
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SC";
}
