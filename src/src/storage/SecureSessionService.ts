import * as SecureStore from "expo-secure-store";

const ACCESS = "smartclean.accessToken";
const REFRESH = "smartclean.refreshToken";
const EXPIRES = "smartclean.expiresAt";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export const SecureSessionService = {
  async get(): Promise<StoredSession | null> {
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(ACCESS),
      SecureStore.getItemAsync(REFRESH),
      SecureStore.getItemAsync(EXPIRES),
    ]);
    if (!accessToken || !refreshToken || !expiresAt) return null;
    return { accessToken, refreshToken, expiresAt };
  },
  async set(session: StoredSession) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS, session.accessToken),
      SecureStore.setItemAsync(REFRESH, session.refreshToken),
      SecureStore.setItemAsync(EXPIRES, session.expiresAt),
    ]);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS),
      SecureStore.deleteItemAsync(REFRESH),
      SecureStore.deleteItemAsync(EXPIRES),
    ]);
  },
};
