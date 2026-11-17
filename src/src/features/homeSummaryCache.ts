import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_SUMMARY, parseSummaryState, type SummaryState } from "@/domain/homeSummary";

/**
 * This phone's copy of the operations cards' counts, so a card draws from the phone and never waits on the network.
 * AsyncStorage (SecureStore's 2KB limit is too small for a day of bookings), with an in-memory copy for the first
 * frame once it has been read. No store import, so the session store can clear it on sign-out without a cycle.
 */

const keyOf = (userId: string) => `soma.homeSummary.v1.${userId}`;

const memory = new Map<string, SummaryState>();
const hydrating = new Set<string>();
export const summaryListeners = new Set<() => void>();
const emit = () => summaryListeners.forEach((l) => l());

/** What is kept, or nothing before the first read finishes (callers show a skeleton, not a zero). */
export function readSummary(userId: string): SummaryState {
  return memory.get(keyOf(userId)) ?? EMPTY_SUMMARY;
}

/** Read the saved copy once per person per launch. */
export async function hydrateSummary(userId: string): Promise<void> {
  const key = keyOf(userId);
  if (memory.has(key) || hydrating.has(key)) return;
  hydrating.add(key);
  try {
    const saved = parseSummaryState(await AsyncStorage.getItem(key));
    if (saved && !memory.has(key)) {
      memory.set(key, saved);
      emit();
    }
  } catch {
    // start with nothing kept
  } finally {
    hydrating.delete(key);
  }
}

export function writeSummary(userId: string, state: SummaryState) {
  memory.set(keyOf(userId), state);
  AsyncStorage.setItem(keyOf(userId), JSON.stringify(state)).catch(() => undefined);
  emit();
}

/** Sign-out: the next person on this phone must not inherit this one's counts. */
export function clearHomeSummary(userId: string | null | undefined) {
  if (userId) {
    memory.delete(keyOf(userId));
    AsyncStorage.removeItem(keyOf(userId)).catch(() => undefined);
  }
  emit();
}
