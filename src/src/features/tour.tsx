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

function isProfile(tab: RoleTab) {
  return /profile$/.test(tab.to);
}

export function buildSteps(
  user: { name?: string; role: string },
  tabs: RoleTab[],
  roleName: string | undefined,
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

const seenKey = (userId: string) => `soma.tour.seen.v1.${userId}`;

export function startTour(replay: boolean) {
  set({ active: true, replay, index: 0 });
}
export function goToStep(index: number) {
  set({ index });
}
export function closeTour() {
  set({ active: false, index: 0 });
}
export async function markTourSeen(userId: string) {
  try {
    await AsyncStorage.setItem(seenKey(userId), "1");
  } catch {
    // Not remembered: the tour may show once more. Better than blocking the app.
  }
}

// ---- Targets ----

const registry = new Map<string, View[]>();

/** Makes a control a spotlight target: `<View {...useTourTarget("profile:tutorial")}>`. */
export function useTourTarget(id: string) {
  const ref = useRef<View | null>(null);
  const setRef = useCallback(
    (node: View | null) => {
      const list = registry.get(id) ?? [];
      if (ref.current) registry.set(id, list.filter((n) => n !== ref.current));
      ref.current = node;
      if (node) registry.set(id, [...(registry.get(id) ?? []), node]);
    },
    [id],
  );
  return { ref: setRef, collapsable: false } as const;
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
    if (!userId || !home || tour.active) return;
    if (!app.sessionRestored || !app.hasSeenWelcome || app.mustChangePassword || app.locked) return;
    if (pathname !== home || checked.current === userId) return;
    checked.current = userId;
    let cancelled = false;
    AsyncStorage.getItem(seenKey(userId))
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
  if (!currentUser) return [];
  const staff = app.staffRoles?.find((r) => r.key === currentUser.role);
  return buildSteps(currentUser, tabs, staff?.label?.toLowerCase());
}

/** Where to leave the person when the tour ends. */
export function leaveTour(role: string | undefined) {
  router.navigate(homePathForRole(role) as never);
}
