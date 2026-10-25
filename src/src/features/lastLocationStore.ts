import AsyncStorage from "@react-native-async-storage/async-storage";
import { freshLocation, type SavedLocation } from "@/domain/lastLocation";

// Where the person was (screen and how far they had scrolled), kept on this phone so the
// app can put them back after it locks or is closed. One record, for the signed-in person.
const STORAGE_KEY = "soma.lastLocation.v1";
const WRITE_DELAY_MS = 400;

let current: SavedLocation | null = null;
let loaded: Promise<SavedLocation | null> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleWrite() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const record = current;
    (record
      ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record))
      : AsyncStorage.removeItem(STORAGE_KEY)
    ).catch(() => {});
  }, WRITE_DELAY_MS);
}

/** Reads the saved place once per launch. */
export function loadLastLocation(): Promise<SavedLocation | null> {
  loaded ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SavedLocation>;
      if (typeof parsed.userId !== "string" || typeof parsed.path !== "string")
        return null;
      current = {
        userId: parsed.userId,
        path: parsed.path,
        scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
        savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      };
      return current;
    })
    .catch(() => null);
  return loaded;
}

/** Forget it - on sign-out, so the next person on this phone never inherits a place. */
export function clearLastLocation() {
  current = null;
  loaded = Promise.resolve(null);
  scheduleWrite();
}

// While the app is putting the person back (home first, then the place they were), the home
// screen's own arrival must not overwrite the place being restored.
let hold: SavedLocation | null = null;
const HOLD_MS = 5000;

export function holdRestoredLocation(place: SavedLocation) {
  hold = place;
  current = place;
  setTimeout(() => {
    if (hold === place) hold = null;
  }, HOLD_MS);
}

export function remember(userId: string, path: string) {
  if (hold) {
    // Arrived at the restored place: keep its saved scroll position and carry on as normal.
    if (path.split("?")[0] === hold.path.split("?")[0]) hold = null;
    return;
  }
  if (current && current.userId === userId && current.path === path) return;
  current = { userId, path, scrollY: 0, savedAt: Date.now() };
  scheduleWrite();
}

/** Records how far the screen at `path` is scrolled. */
export function rememberScroll(path: string, scrollY: number) {
  if (!current || current.path.split("?")[0] !== path.split("?")[0]) return;
  current = {
    ...current,
    scrollY: Math.max(0, Math.round(scrollY)),
    savedAt: Date.now(),
  };
  scheduleWrite();
}

/** The scroll position saved for this screen, if the saved place is for it. */
export function savedScrollFor(
  path: string,
  userId: string | undefined,
): number {
  const place = freshLocation(current, userId, Date.now());
  return place && place.path.split("?")[0] === path.split("?")[0]
    ? place.scrollY
    : 0;
}
