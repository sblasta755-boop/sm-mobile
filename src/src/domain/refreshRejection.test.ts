import { isDefinitiveRefreshRejection } from "./refreshRejection";

const apiError = (status?: number) => Object.assign(new Error("x"), { name: "ApiError", status });

describe("isDefinitiveRefreshRejection", () => {
  it("ends the session when the server says the refresh token is dead", () => {
    // 409 is what the backend sends for a used, revoked or expired refresh token.
    for (const status of [409, 401, 403, 400, 422]) expect(isDefinitiveRefreshRejection(apiError(status))).toBe(true);
  });

  it("does not end the session for blips", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) expect(isDefinitiveRefreshRejection(apiError(status))).toBe(false);
  });

  it("does not end the session when nothing reached the server", () => {
    expect(isDefinitiveRefreshRejection(new TypeError("Network request failed"))).toBe(false);
    expect(isDefinitiveRefreshRejection(new Error("timeout"))).toBe(false);
    expect(isDefinitiveRefreshRejection(apiError(undefined))).toBe(false);
    expect(isDefinitiveRefreshRejection(null)).toBe(false);
    expect(isDefinitiveRefreshRejection("409")).toBe(false);
  });
});
