import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, router } from "expo-router";
import type { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoleTabs, type RoleTab } from "@/components/RoleTabBar";
import { homePathForRole } from "@/features/roles";
import { useSmartClean } from "@/features/store";

/**
 * The interactive guided tour: dims the real screen, cuts a spotlight round a real control, explains it in a
 * bubble and walks the person through their own app, opening each tab in turn. One tour for every role - the
 * steps come from the role's own tab bar (useRoleTabs), so it can never describe a tab the person does not have.
 *
 * This file is the state, the steps and the target registry. The drawing is components/TourOverlay.tsx.
 * The web app has the same tour (smart-property-operations/src/src/lib/smartclean/tour.tsx); keep the wording in step.
 */

// ---- Steps ----

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Spotlight target ids in order of preference. `tab:<n>` is the nth tab of the bar; the rest come from useTourTarget. */
  target?: string[];
  /** The screen this step belongs to. The tour navigates there first when the app is somewhere else. */
  to?: string;
};

const ROLE_LABEL: Record<string, string> = {
  system_admin: "platform operator",
  org_admin: "administrator",
  operations_manager: "operations manager",
  site_manager: "site manager",
  supervisor: "supervisor",
  client_auditor: "auditor",
  waiter: "waiter",
  cleaner: "cleaner",
};

/** What each tab is for, by the path it opens. Anything not listed gets a generic line built from its label. */
const TAB_COPY: Record<string, { title: string; body: string }> = {
  // Platform operator
  "/platform-dashboard": { title: "Overview", body: "The health of the whole platform at a glance: organisations, sites and what needs your attention." },
  "/platform-organisations": { title: "Clients", body: "Every organisation on Šoma360. Open one to see its sites, subscription and people." },
  "/platform-onboard": { title: "Onboard", body: "Bring a new client on board by QR code. Show the code and they set themselves up." },
  "/platform-approvals": { title: "Approvals", body: "Requests that need an operator's decision wait here until you approve or decline them." },
  // Administrator, operations manager, site manager
  "/manage-home": { title: "Overview", body: "Today across your sites: who is on site, task completion and anything that needs you." },
  "/manage-team": { title: "Team", body: "Your people and where they are working. Open someone to see their record." },
  "/manage-add-staff": { title: "Add staff", body: "Add a new team member. They get a QR code and set up their own account." },
  "/manage-maintenance": { title: "Maintenance", body: "Report a fault, get quotes, and follow each job to the end. What needs you comes first." },
  "/manage-approvals": { title: "Approvals", body: "Leave, overtime and other requests waiting for your decision." },
  // Supervisor
  "/supervise-home": { title: "Today", body: "Work waiting for your review and the checks due today, in the order to do them." },
  "/supervise-inspections": { title: "Inspections", body: "Review submitted work and inspect it. You cannot approve work you submitted yourself." },
  "/supervise-actions": { title: "Actions", body: "Corrective actions after a failed inspection, with their deadlines. Overdue ones are flagged for you." },
  // Auditor
  "/audit-home": { title: "Overview", body: "Read-only dashboards for the sites you have been given. Nothing here can be changed." },
  "/audit-quality": { title: "Quality", body: "Inspection results and quality scores for your sites." },
  // Cleaner and waiter
  "/home": { title: "Home", body: "Your day: today's shift, your tasks and anything waiting for you to fix." },
  "/shifts": { title: "Shifts", body: "Your upcoming shifts and the sites you are booked on." },
  "/scan": { title: "Scan", body: "Scan the site's QR code to clock in and again to clock out. This is how your time on site is verified." },
  "/tables": { title: "Tables", body: "Your open tables and what each one needs. Scan a table's code to open a new one." },
  "/corrective-actions": { title: "Actions", body: "Work you need to redo after an inspection, and when it is due." },
};

/**
 * What each home shortcut is for, by its key. A shortcut only exists when its module is switched on for the
 * organisation and the role may use it, so a step here appears only then. A shortcut with no entry (a module added
 * later) still gets a step, built from its own name and hint, so nothing a person can tap is skipped.
 */
const TILE_COPY: Record<string, { title: string; body: string }> = {
  rounds: { title: "Hourly checks", body: "Your hourly compliance rounds: check each item on your list and sign it off." },
  corrective: { title: "Corrective actions", body: "Work to redo after an inspection, with the deadline for each." },
  stock: { title: "Stock", body: "Issue, waste and restock supplies, and count what is on the shelf." },
  incident: { title: "Report an incident", body: "Report a problem at a location, with photos. It goes straight to the people who deal with it." },
  schedule: { title: "Schedule", body: "Where and when people are booked, with a map of the sites." },
  leave: { title: "Leave", body: "Ask for time off, or approve requests, and see the holiday calendar." },
  progress: { title: "My progress", body: "Your score, streak and how you are doing against your goals." },
  report: { title: "Management report", body: "Make a PDF report of how your sites are doing." },
  payruns: { title: "Pay runs", body: "Work out pay from approved attendance, with a PDF and a spreadsheet." },
  overtime: { title: "Overtime", body: "Staff still on site after their shift ask here; you decide." },
  board: { title: "Task board", body: "Every task on one board, by status. Drag work along as it moves." },
  signs: { title: "Wayfinding signs", body: "Install the beacons that guide visitors around the building." },
  walk: { title: "Walk a path", body: "Walk a route with your phone to record the path visitors will be guided along." },
};

export type TourTile = { key: string; label: string; hint?: string };
export type TourTiles = { shown: TourTile[]; rest: TourTile[] };

function tileStep(tile: TourTile, to: string, target: string): TourStep {
  const copy = TILE_COPY[tile.key];
  return {
    id: `tile:${tile.key}`,
    title: copy?.title ?? tile.label,
    body: copy?.body ?? (tile.hint ? `${tile.label}: ${tile.hint}.` : `Opens ${tile.label}.`),
    target: [target],
    to,
  };
}

function isProfile(tab: RoleTab) {
  return /profile$/.test(tab.to);
}

export function buildSteps(
  user: { name?: string; role: string },
  tabs: RoleTab[],
  roleName: string | undefined,
  tiles: TourTiles | null = null,
): TourStep[] {
  if (tabs.length === 0) return [];
  const first = user.name?.trim().split(/\s+/)[0];
  const role = roleName ?? ROLE_LABEL[user.role] ?? user.role.replace(/_/g, " ");
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: first ? `Welcome, ${first}` : "Welcome to Šoma360",
      body: "A quick walk through the app. Tap Next, or tap the highlighted control, to move on.",
      to: tabs[0].to,
    },
    {
      id: "tabbar",
      title: "Navigation bar",
      body: `This is your bar as a ${role}. Every part of your app is one tap away.`,
      target: ["tabbar"],
      to: tabs[0].to,
    },
  ];
  tabs.forEach((tab, index) => {
    if (isProfile(tab)) return;
    const copy = TAB_COPY[tab.to] ?? { title: tab.label, body: `Opens ${tab.label}.` };
    steps.push({ id: `tab:${tab.to}`, title: copy.title, body: copy.body, target: [`tab:${index}`], to: tab.to });
    // The home screen's shortcuts come straight after Home, while the tour is still on it.
    if (index === 0 && tiles) {
      for (const tile of tiles.shown) steps.push(tileStep(tile, tab.to, `tile:${tile.key}`));
      if (tiles.rest.length > 0) {
        steps.push({
          id: "tile:more",
          title: "More shortcuts",
          body: `${tiles.rest.map((t) => TILE_COPY[t.key]?.title ?? t.label).join(", ")}. Tap More to open them.`,
          target: ["tile:more"],
          to: tab.to,
        });
      }
    }
  });
  const profileIndex = tabs.findIndex(isProfile);
  if (profileIndex >= 0) {
    const profile = tabs[profileIndex];
    steps.push({
      id: "profile",
      title: "Profile",
      body: "Your details, settings and sign out all live here.",
      target: [`tab:${profileIndex}`],
      to: profile.to,
    });
    steps.push({
      id: "appearance",
      title: "Light or dark",
      body: "Choose light, dark or follow your phone.",
      target: ["profile:appearance"],
      to: profile.to,
    });
    steps.push({
      id: "replay",
      title: "Replay this tour",
      body: "You can come back to this tour whenever you want from here.",
      target: ["profile:tutorial"],
      to: profile.to,
    });
  }
  return steps;
}

// ---- State ----

type TourState = { active: boolean; replay: boolean; index: number };
let state: TourState = { active: false, replay: false, index: 0 };
const listeners = new Set<() => void>();
function set(next: Partial<TourState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useTourState(): TourState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// One flag per install (not per account), like the other app: a second person on the same phone is not shown it again.
const SEEN_KEY = "soma.tour.seen.v1";
const legacySeenKey = (userId: string) => `soma.tour.seen.v1.${userId}`;
// Set the instant the tour ends, so nothing re-reads a storage write that has not landed yet and restarts it.
let seenInMemory = false;

export function startTour(replay: boolean) {
  set({ active: true, replay, index: 0 });
}
export function goToStep(index: number) {
  set({ index });
}
export function closeTour() {
  set({ active: false, index: 0 });
}
/** Finished or skipped: never auto-start again on this install. */
export async function markTourSeen() {
  seenInMemory = true;
  try {
    await AsyncStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not remembered: the tour may show once more. Better than blocking the app.
  }
}

async function hasSeenTour(userId: string): Promise<boolean> {
  if (seenInMemory) return true;
  try {
    const [seen, legacy] = await Promise.all([
      AsyncStorage.getItem(SEEN_KEY),
      AsyncStorage.getItem(legacySeenKey(userId)),
    ]);
    if (seen || legacy) {
      seenInMemory = true;
      return true;
    }
    return false;
  } catch {
    // Storage unreadable: counts as not seen, as before.
    return false;
  }
}

// ---- Targets ----

const registry = new Map<string, View[]>();

function bind(id: string, getPrevious: () => View | null, setCurrent: (node: View | null) => void) {
  return (node: View | null) => {
    const previous = getPrevious();
    if (previous) registry.set(id, (registry.get(id) ?? []).filter((n) => n !== previous));
    setCurrent(node);
    if (node) registry.set(id, [...(registry.get(id) ?? []), node]);
  };
}

/** Makes a control a spotlight target: `<View {...useTourTarget("profile:tutorial")}>`. */
export function useTourTarget(id: string) {
  const ref = useRef<View | null>(null);
  const setRef = useCallback(
    (node: View | null) => bind(id, () => ref.current, (n) => (ref.current = n))(node),
    [id],
  );
  return { ref: setRef, collapsable: false } as const;
}

// For targets made in a loop, where a hook cannot be called: one stable ref function per id.
const loopRefs = new Map<string, (node: View | null) => void>();
export function tourTargetRef(id: string): (node: View | null) => void {
  let fn = loopRefs.get(id);
  if (!fn) {
    let current: View | null = null;
    fn = bind(id, () => current, (n) => (current = n));
    loopRefs.set(id, fn);
  }
  return fn;
}

// ---- The home screen's shortcuts ----
// ActionTiles reports what it really shows. The shortcuts are built from the organisation's modules, so this is
// what turns "module on" into "tour step", with no list of modules to keep in step here.

let tiles: TourTiles | null = null;
const tileListeners = new Set<() => void>();
export function reportTiles(next: TourTiles | null) {
  tiles = next;
  tileListeners.forEach((l) => l());
}
function useTiles(): TourTiles | null {
  return useSyncExternalStore(
    (l) => {
      tileListeners.add(l);
      return () => {
        tileListeners.delete(l);
      };
    },
    () => tiles,
    () => tiles,
  );
}

export type Rect = { x: number; y: number; width: number; height: number };

/** Newest first: with several screens mounted, the one just opened is the one on top. */
export function measureTarget(id: string, screen: { width: number; height: number }): Promise<Rect | null> {
  const nodes = [...(registry.get(id) ?? [])].reverse();
  const tryNode = (i: number): Promise<Rect | null> => {
    if (i >= nodes.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      nodes[i].measureInWindow((x, y, width, height) => {
        const visible = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < screen.width && y < screen.height;
        if (visible) resolve({ x, y, width, height });
        else tryNode(i + 1).then(resolve);
      });
    });
  };
  return tryNode(0);
}

// ---- Starting ----

/** Starts the first-run tour once, when the person reaches their own home. Nothing else may be on top of it. */
export function useAutoStartTour() {
  const { state: app, currentUser } = useSmartClean();
  const pathname = usePathname();
  const tour = useTourState();
  const userId = currentUser?.id;
  const home = currentUser ? homePathForRole(currentUser.role) : null;
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !home || tour.active || seenInMemory) return;
    if (!app.sessionRestored || !app.hasSeenWelcome || app.mustChangePassword || app.locked) return;
    if (pathname !== home || checked.current === userId) return;
    checked.current = userId;
    let cancelled = false;
    hasSeenTour(userId)
      .then((seen) => {
        if (cancelled || seen) return;
        // Let the home screen finish its first paint, so there is something to point at.
        setTimeout(() => {
          if (!cancelled) startTour(false);
        }, 700);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      // Allow the check again if this ran before the screen settled.
      if (checked.current === userId && !state.active) checked.current = null;
    };
  }, [userId, home, pathname, tour.active, app.sessionRestored, app.hasSeenWelcome, app.mustChangePassword, app.locked]);
}

/** The steps for whoever is signed in. */
export function useTourSteps(): TourStep[] {
  const { currentUser, state: app } = useSmartClean();
  const tabs = useRoleTabs();
  const homeTiles = useTiles();
  if (!currentUser) return [];
  const staff = app.staffRoles?.find((r) => r.key === currentUser.role);
  return buildSteps(currentUser, tabs, staff?.label?.toLowerCase(), homeTiles);
}

/** Where to leave the person when the tour ends. */
export function leaveTour(role: string | undefined) {
  router.navigate(homePathForRole(role) as never);
}
