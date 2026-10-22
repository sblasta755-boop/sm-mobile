import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StockCountSession } from "@/types/smartclean";

// The last count the phone fetched, kept so a storekeeper can open it and
// count with no signal (the list is built on the server, so it has to be
// fetched once while online). Per person and site; only today's count is of
// any use, so an older one is ignored.
const key = (userId: string, siteId: string) => `soma.stockcount.v1.${userId}.${siteId}`;

export async function saveCachedCount(userId: string, siteId: string, session: StockCountSession) {
  try {
    await AsyncStorage.setItem(key(userId, siteId), JSON.stringify(session));
  } catch {
    /* the count still works online; it just can't be reopened offline */
  }
}

export async function loadCachedCount(userId: string, siteId: string, today: string): Promise<StockCountSession | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, siteId));
    const session = raw ? (JSON.parse(raw) as StockCountSession) : null;
    return session && session.countDate === today ? session : null;
  } catch {
    return null;
  }
}
