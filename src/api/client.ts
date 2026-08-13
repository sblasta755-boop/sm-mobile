import Constants from "expo-constants";
import type { DemoUser } from "@/types/smartclean";

const extraUrl = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  extraUrl ||
  "http://10.0.2.2:8000/api/v1"
).replace(/\/$/, "");

export interface BackendSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export async function loginToBackend(username: string, password: string) {
  const auth = await request<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: DemoUser;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return {
    session: {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: new Date(Date.now() + auth.expiresIn * 1000).toISOString(),
    },
    user: auth.user,
  };
}

export async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}
