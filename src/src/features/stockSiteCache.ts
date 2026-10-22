import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StockConversion, StockLevel, StockLocation, StockRestockTask, StockTransfer } from "@/types/smartclean";

// One site's stock locations and levels as last fetched, so the Stock screen
// opens and an issue or waste can be recorded with no signal. The numbers can
// be out of date, which is why on-hand is shown with what is waiting to send
// already taken off, and the server is the authority when it syncs.
export interface SiteStockSnapshot {
  locations: StockLocation[];
  levels: StockLevel[];
  restock: StockRestockTask[];
  transfers: StockTransfer[];
  conversions: StockConversion[];
}

const key = (userId: string, siteId: string) => `soma.stocksite.v1.${userId}.${siteId}`;

export async function saveSiteSnapshot(userId: string, siteId: string, snapshot: SiteStockSnapshot) {
  try {
    await AsyncStorage.setItem(key(userId, siteId), JSON.stringify(snapshot));
  } catch {
    /* fine: it just can't be reopened offline */
  }
}

export async function loadSiteSnapshot(userId: string, siteId: string): Promise<SiteStockSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, siteId));
    return raw ? (JSON.parse(raw) as SiteStockSnapshot) : null;
  } catch {
    return null;
  }
}
