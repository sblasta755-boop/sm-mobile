// Whether a failed token refresh means the session is over (so the person must sign in again), as opposed to a
// blip where the stored refresh token is still good. Same rule as the web app's isDefinitiveRefreshRejection.
//
// The server answers a dead refresh token (already used, revoked, expired) with 409 Conflict, not 401, so this
// is any 4xx the server sent, except "try again later" (408 timeout, 429 too many requests). Network errors and
// 5xx carry no status or a 5xx, and must never sign anyone out: a phone in a lift would lose its session.

export function isDefinitiveRefreshRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  if (name !== "ApiError" || typeof status !== "number") return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
