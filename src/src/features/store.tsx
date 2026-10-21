import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  applyAttendance,
  applyCorrectiveUpdates,
  applyInspectionDecisions,
  applyMutations,
} from "@/domain/outbox";
import { loadOutbox, useOutbox } from "@/features/outbox";
import { loadTaskFilters, resetTaskFilters } from "@/features/taskFilters";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import {
  loadBackendBootstrap,
  loginToBackend,
  logoutFromBackend,
  markWelcomeSeen as markWelcomeSeenOnBackend,
  setSessionHandlers,
  type BackendBootstrap,
  type BackendSession,
} from "@/api/client";
import type {
  AirbnbTurnover,
  Asset,
  Connectivity,
  CorrectiveAction,
  DemoUser,
  Evidence,
  Incident,
  Inspection,
  Notification,
  QrCode,
  Site,
  Location,
  StaffRole,
  StockItem,
  SubscriptionState,
  Task,
  Tenant,
} from "@/types/smartclean";
import { SecureSessionService, type StoredSession } from "@/storage/SecureSessionService";
import { getCapability, isLockEnabled } from "@/services/biometrics";

interface State {
  currentUserId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  authExpiresAt: string | null;
  sessionRestored: boolean;
  loading: boolean;
  error: string | null;
  connectivity: Connectivity;
  tenant: Tenant | null;
  users: DemoUser[];
  sites: Site[];
  locations: Location[];
  qrCodes: QrCode[];
  tasks: Task[];
  inspections: Inspection[];
  correctiveActions: CorrectiveAction[];
  incidents: Incident[];
  notifications: Notification[];
  turnovers: AirbnbTurnover[];
  stock: StockItem[];
  assets: Asset[];
  attendance: Record<string, { clockedInAt?: string; siteId?: string; locationCapturedAt?: string }>;
  /** The organisation's plan and unlocked modules. Null until bootstrap
   * lands; consumers treat that as "not yet known" and fail open, since
   * the server enforces the real answer. */
  subscription: SubscriptionState | null;
  /** Colours the organisation chose for task tags (lower-cased tag to colour name). */
  tagColors: Record<string, string>;
  /** Field-staff role definitions (label, template, home image...). Empty until bootstrap lands; see features/roles.ts for the fallbacks. */
  staffRoles: StaffRole[];
  /** A restored session that is being withheld until the user passes a
   * Face ID / fingerprint prompt.
   *
   * Only ever true for a session restored from SecureStore on launch,
   * and only when the user turned the lock on for this device (see
   * services/biometrics.ts). A fresh sign-in is never locked - they just
   * proved who they are.
   *
   * Deliberately NOT persisted: it is derived on every launch from the
   * stored preference, so a killed app cannot come back unlocked, and
   * the persist effect below strips it along with the tokens. */
  locked: boolean;
  /** This session cannot do anything until a password is chosen.
   *
   * Set by the backend on every session-issuing response (login,
   * refresh, and the QR onboarding collect - see AuthResponse there).
   * True today only for accounts onboarded by QR approval, which hold a
   * random password nobody has ever seen.
   *
   * Persisted with the rest of the state so quitting the app mid-flow
   * and reopening it lands back on the password screen rather than in a
   * half-onboarded app. The server re-asserts it on the next login or
   * refresh regardless, so a tampered local value buys nothing. */
  mustChangePassword: boolean;
  /** Whether this account still owes the one-time welcome screen shown
   * right after finishing QR onboarding.
   *
   * Set by the backend on every session-issuing response, same as
   * mustChangePassword - but inverted: true (nothing to show) for every
   * account except one a QR onboarding controller just started fresh,
   * so shipping this feature does not retroactively surface the screen
   * for existing users. See AuthResponse.hasSeenWelcome on the backend.
   *
   * Persisted with the rest of the state for the same reason
   * mustChangePassword is - quitting mid-flow and reopening the app
   * must not skip the screen. The server re-asserts it on the next
   * login or refresh regardless. */
  hasSeenWelcome: boolean;
}

type Action =
  | { type: "RESTORE"; state: Partial<State> | null; session: StoredSession | null }
  | { type: "SET_LOADING"; loading: boolean; error?: string | null }
  | {
      type: "SET_AUTH";
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      bootstrap: BackendBootstrap;
      /** Omitted by ordinary sign-in, which has no opinion; the reducer
       * defaults it to false. The onboarding collect path passes true. */
      mustChangePassword?: boolean;
      /** Omitted by ordinary sign-in, which has no opinion; the reducer
       * defaults it to true (nothing to show). The onboarding collect
       * path passes false. */
      hasSeenWelcome?: boolean;
    }
  | { type: "LOCK" }
  | { type: "UNLOCK" }
  | { type: "PASSWORD_CHANGED" }
  | { type: "WELCOME_SEEN" }
  | { type: "SET_SESSION"; accessToken: string; refreshToken: string; expiresAt: string }
  | { type: "HYDRATE"; bootstrap: BackendBootstrap }
  | { type: "SET_CONNECTIVITY"; value: Connectivity }
  | { type: "CLOCK_IN"; userId: string; siteId: string }
  | { type: "CLOCK_OUT"; userId: string }
  | { type: "UPDATE_TASK"; taskId: string; patch: Partial<Task> }
  | { type: "ADD_EVIDENCE"; taskId: string; evidence: Evidence }
  | { type: "CREATE_INSPECTION"; inspection: Inspection }
  | { type: "UPDATE_INSPECTION"; id: string; patch: Partial<Inspection> }
  | { type: "UPDATE_CA"; id: string; patch: Partial<CorrectiveAction> }
  | { type: "APPEND_CA_TIMELINE"; id: string; entry: { at: string; actor: string; text: string } }
  | { type: "CREATE_INCIDENT"; incident: Incident }
  | { type: "UPDATE_USER"; userId: string; patch: Partial<DemoUser> }
  | { type: "MARK_NOTIFICATION_READ"; id: string; all?: boolean }
  | { type: "SIGN_OUT" };

const STORAGE_KEY = "smartclean.mobile.state.v1";

function initial(): State {
  return {
    currentUserId: null,
    accessToken: null,
    refreshToken: null,
    authExpiresAt: null,
    sessionRestored: false,
    loading: false,
    error: null,
    connectivity: "online",
    tenant: null,
    users: [],
    sites: [],
    locations: [],
    qrCodes: [],
    tasks: [],
    inspections: [],
    correctiveActions: [],
    incidents: [],
    notifications: [],
    turnovers: [],
    stock: [],
    assets: [],
    attendance: {},
    subscription: null,
    tagColors: {},
    staffRoles: [],
    locked: false,
    mustChangePassword: false,
    hasSeenWelcome: true,
  };
}

function bootstrapState(bootstrap: BackendBootstrap): Partial<State> {
  return {
    // Every read is defensive against a missing key, not only the
    // module-gated ones: a partial payload should degrade to an empty
    // screen, never to a TypeError that takes the provider down and
    // leaves a cleaner staring at a blank app mid-shift.
    tenant: bootstrap.tenants?.[0] ?? null,
    users: bootstrap.users?.length ? bootstrap.users : [bootstrap.user],
    sites: bootstrap.sites ?? [],
    locations: bootstrap.locations ?? [],
    qrCodes: bootstrap.qrCodes ?? [],
    tasks: bootstrap.tasks ?? [],
    inspections: bootstrap.inspections ?? [],
    correctiveActions: bootstrap.correctiveActions ?? [],
    incidents: bootstrap.incidents ?? [],
    notifications: bootstrap.notifications ?? [],
    // Previously never sourced from the backend - state.attendance only
    // changed via local-only CLOCK_IN/CLOCK_OUT reducer actions that
    // nothing dispatched (the scan screen only calls clockIn() +
    // refreshBackendData()), so a real clock-in never showed up as
    // "Clocked in" on Home. Now backed by AttendanceController.today_status
    // via bootstrap.attendance - same fix already applied on web.
    attendance: bootstrap.attendance ?? {},
    turnovers: bootstrap.turnovers ?? [],
    stock: bootstrap.stock ?? [],
    assets: bootstrap.assets ?? [],
    subscription: bootstrap.subscription ?? null,
    tagColors: bootstrap.tagColors ?? {},
    staffRoles: bootstrap.staffRoles ?? [],
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESTORE":
      return {
        ...state,
        ...(action.state ?? {}),
        currentUserId: action.state?.currentUserId ?? state.currentUserId,
        sessionRestored: true,
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading, error: action.error ?? null };
    case "SET_AUTH":
      return {
        ...state,
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
        authExpiresAt: action.expiresAt,
        currentUserId: action.bootstrap.user.id,
        loading: false,
        error: null,
        sessionRestored: true,
        // A sign-in just proved who this is - there is nothing left for
        // a biometric prompt to establish, so never start a fresh
        // session locked.
        locked: false,
        // Explicitly reset on every sign-in rather than left alone: a
        // previous session's outstanding obligation must not leak onto
        // whoever signs in next on the same device.
        mustChangePassword: action.mustChangePassword ?? false,
        // Same reset-on-every-sign-in reasoning as mustChangePassword,
        // just the opposite default: no opinion means nothing to show.
        hasSeenWelcome: action.hasSeenWelcome ?? true,
        ...bootstrapState(action.bootstrap),
      };
    case "LOCK":
      return { ...state, locked: true };
    case "UNLOCK":
      return { ...state, locked: false };
    case "PASSWORD_CHANGED":
      // The obligation is discharged. Only this flag changes - the
      // session stays exactly as it is, because set_initial_password
      // deliberately does NOT revoke refresh tokens (doing so would log
      // out the very device being onboarded, mid-flow).
      return { ...state, mustChangePassword: false };
    case "WELCOME_SEEN":
      return { ...state, hasSeenWelcome: true };
    case "SET_SESSION":
      // From request()'s transparent refresh-and-retry in api/client.ts
      // - only the tokens change here, not bootstrap data, since a
      // background refresh happens mid-action on whatever screen the
      // user is already on.
      return {
        ...state,
        accessToken: action.accessToken,
        refreshToken: action.refreshToken,
        authExpiresAt: action.expiresAt,
      };
    case "HYDRATE":
      return { ...state, loading: false, error: null, ...bootstrapState(action.bootstrap) };
    case "SET_CONNECTIVITY":
      return { ...state, connectivity: action.value };
    case "CLOCK_IN":
      return {
        ...state,
        attendance: {
          ...state.attendance,
          [action.userId]: {
            clockedInAt: new Date().toISOString(),
            siteId: action.siteId,
            locationCapturedAt: new Date().toISOString(),
          },
        },
      };
    case "CLOCK_OUT":
      return { ...state, attendance: { ...state.attendance, [action.userId]: {} } };
    case "UPDATE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.taskId ? { ...task, ...action.patch } : task)),
      };
    case "ADD_EVIDENCE":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, evidence: [...task.evidence, action.evidence] } : task,
        ),
      };
    case "CREATE_INSPECTION":
      return { ...state, inspections: [action.inspection, ...state.inspections] };
    case "UPDATE_INSPECTION":
      return {
        ...state,
        inspections: state.inspections.map((inspection) =>
          inspection.id === action.id ? { ...inspection, ...action.patch } : inspection,
        ),
      };
    case "UPDATE_CA":
      return {
        ...state,
        correctiveActions: state.correctiveActions.map((ca) => (ca.id === action.id ? { ...ca, ...action.patch } : ca)),
      };
    case "APPEND_CA_TIMELINE":
      return {
        ...state,
        correctiveActions: state.correctiveActions.map((ca) =>
          ca.id === action.id ? { ...ca, timeline: [...ca.timeline, action.entry] } : ca,
        ),
      };
    case "CREATE_INCIDENT":
      return { ...state, incidents: [action.incident, ...state.incidents] };
    case "UPDATE_USER":
      return {
        ...state,
        users: state.users.map((user) => (user.id === action.userId ? { ...user, ...action.patch } : user)),
      };
    case "MARK_NOTIFICATION_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          action.all || n.id === action.id ? { ...n, read: true } : n,
        ),
      };
    case "SIGN_OUT":
      return { ...initial(), sessionRestored: true };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: State;
  currentUser: DemoUser | undefined;
  dispatch: React.Dispatch<Action>;
  signIn: (username: string, password: string) => Promise<void>;
  /** For sessions obtained without credentials - see the QR onboarding
   * collect path in app/(onboard)/waiting.tsx. */
  signInWithSession: (
    session: BackendSession,
    bootstrap: BackendBootstrap,
    options?: { mustChangePassword?: boolean; hasSeenWelcome?: boolean },
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /** Reveal a session that was restored locked - called by app/lock.tsx
   * once the Face ID / fingerprint prompt succeeds. */
  unlock: () => void;
  refreshBackendData: () => Promise<void>;
  /** Discharges the one-time post-onboarding welcome screen, on the
   * backend and locally, so it never shows again on any device. Called
   * by the welcome screen itself once the user dismisses it. */
  markWelcomeSeen: () => Promise<void>;
} | null>(null);

export function SmartCleanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  // api/client.ts's request() calls these on a 401 to transparently
  // refresh-and-retry - registered once below via a ref rather than
  // closing over `state` directly, since client.ts's module-level
  // handlers are set once but need the *current* refresh token, not
  // whatever it was at registration time.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Tracks whether this mount has already fetched fresh backend data
  // once - either via the restore-on-mount effect below, or because
  // signIn() already delivered a fresh bootstrap directly. Mirrors the
  // fix already applied to the web app's store.tsx for the exact same
  // bug: gating the restore-fetch on `state.users.length === 0` looks
  // right for a brand-new session, but a *returning* session's
  // AsyncStorage snapshot almost always has non-empty `users` already -
  // so that guard skipped the refetch entirely and every restored
  // field (tasks, corrective actions, incidents, attendance) kept
  // showing whatever was true when the app was last closed, with
  // nothing to correct it until some unrelated action happened to call
  // refreshBackendData().
  const didRestoreFetch = useRef(false);

  useEffect(() => {
    setSessionHandlers({
      getRefreshToken: () => stateRef.current.refreshToken,
      onRefreshed: (session) => {
        void SecureSessionService.set(session);
        dispatch({
          type: "SET_SESSION",
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        });
      },
      onRefreshFailed: () => {
        // The refresh token itself is invalid/expired too - nothing left
        // to try. Clear the session so the user gets a clean re-login
        // prompt instead of every subsequent request silently 401ing.
        void SecureSessionService.clear();
        dispatch({ type: "SIGN_OUT" });
      },
      onSubscriptionBlocked: () => {
        // A 402 means this app's idea of the plan is out of date - a tier
        // changed, or the subscription lapsed, since the last bootstrap.
        // Refetch so the tab bar and screens match what the server will
        // actually serve.
        //
        // Deliberately NOT a sign-out: the session is valid, it is the
        // organisation's plan that changed, and dropping a cleaner to a
        // login screen mid-shift would be both wrong and alarming.
        const accessToken = stateRef.current.accessToken;
        if (!accessToken) return;
        void loadBackendBootstrap(accessToken)
          .then((bootstrap) => dispatch({ type: "HYDRATE", bootstrap }))
          // Bootstrap is ungated so this should not itself 402; if it
          // fails there is nothing useful to do beyond leaving the stale
          // module list in place. The original 402 still reaches the
          // caller as a SubscriptionError.
          .catch(() => undefined);
      },
    });
    return () => setSessionHandlers(null);
  }, []);

  const refreshBackendData = async () => {
    if (!state.accessToken) return;
    try {
      const bootstrap = await loadBackendBootstrap(state.accessToken);
      dispatch({ type: "HYDRATE", bootstrap });
    } catch (error) {
      dispatch({ type: "SET_LOADING", loading: false, error: error instanceof Error ? error.message : "Backend refresh failed" });
    }
  };

  const signIn = async (username: string, password: string) => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const { session, bootstrap, mustChangePassword, hasSeenWelcome } = await loginToBackend(username, password);
      await SecureSessionService.set(session);
      // SET_AUTH below already carries a fresh bootstrap - mark the
      // restore-on-mount effect as satisfied so it doesn't immediately
      // fire a second, redundant refreshBackendData() once accessToken
      // transitions from null to set.
      didRestoreFetch.current = true;
      dispatch({
        type: "SET_AUTH",
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        bootstrap,
        mustChangePassword,
        hasSeenWelcome,
      });
    } catch (error) {
      dispatch({ type: "SET_LOADING", loading: false, error: error instanceof Error ? error.message : "Login failed" });
      throw error;
    }
  };

  /** Adopt a session this app did not obtain by username and password.
   *
   * The QR onboarding collect path already holds tokens and a bootstrap
   * by the time it gets here - the platform admin's approval minted
   * them - so it cannot go through signIn(), which starts from
   * credentials the onboarded admin does not have.
   *
   * Kept on the store rather than done with a bare dispatch at the call
   * site so the SecureStore write and the didRestoreFetch guard are not
   * forgotten: both are easy to miss and neither fails loudly. */
  const signInWithSession = async (
    session: BackendSession,
    bootstrap: BackendBootstrap,
    options?: { mustChangePassword?: boolean; hasSeenWelcome?: boolean },
  ) => {
    await SecureSessionService.set(session);
    didRestoreFetch.current = true;
    dispatch({
      type: "SET_AUTH",
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      bootstrap,
      mustChangePassword: options?.mustChangePassword ?? false,
      hasSeenWelcome: options?.hasSeenWelcome ?? true,
    });
  };

  const signOut = async () => {
    const { accessToken, refreshToken } = state;
    // A different person on this phone should not inherit the last one's filters.
    resetTaskFilters();
    await SecureSessionService.clear();
    dispatch({ type: "SIGN_OUT" });
    if (accessToken && refreshToken) {
      try {
        await logoutFromBackend(accessToken, refreshToken);
      } catch {
        // best-effort - local session is already cleared
      }
    }
  };

  const markWelcomeSeen = async () => {
    // Local state flips immediately so the screen cannot be shown twice
    // in the same session even if the request is slow or fails - the
    // next login/refresh re-asserts the server's own answer regardless.
    dispatch({ type: "WELCOME_SEEN" });
    if (!state.accessToken) return;
    try {
      await markWelcomeSeenOnBackend(state.accessToken);
    } catch {
      // best-effort - worst case the next session sees the screen once more
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [raw, session] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), SecureSessionService.get()]);
      if (cancelled) return;
      const persisted = raw ? (JSON.parse(raw) as Partial<State>) : null;
      // Only a session that actually exists can be locked, and only when
      // the user asked for it AND the device can still honour it - a
      // sensor that has been reset or un-enrolled since must not strand
      // them behind a prompt that can never succeed. Checked here rather
      // than on the lock screen so the app never briefly renders the
      // unlocked UI before redirecting.
      const locked = session
        ? (await isLockEnabled()) && (await getCapability()).available
        : false;
      if (cancelled) return;
      dispatch({
        type: "RESTORE",
        state: session
          ? { ...persisted, accessToken: session.accessToken, refreshToken: session.refreshToken, authExpiresAt: session.expiresAt, locked }
          : null,
        session,
      });
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((net) => {
      dispatch({ type: "SET_CONNECTIVITY", value: net.isConnected === false ? "offline" : "online" });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (state.sessionRestored && state.accessToken && !didRestoreFetch.current) {
      didRestoreFetch.current = true;
      void refreshBackendData();
    }
  }, [state.sessionRestored, state.accessToken]);

  useEffect(() => {
    if (!state.sessionRestored) return;
    const { accessToken: _accessToken, refreshToken: _refreshToken, authExpiresAt: _authExpiresAt, sessionRestored: _sessionRestored, locked: _locked, ...persistable } = state;
    // Serialising every task on each change blocked the JS thread long enough
    // to make a tick on a checklist item feel slow. Wait until changes settle.
    const timer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable)).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [state]);

  const currentUser = state.users.find((user) => user.id === state.currentUserId);

  const unlock = () => dispatch({ type: "UNLOCK" });

  // Changes made on the phone and not yet accepted by the server are shown on
  // top of the tasks it last sent, so the app behaves the same offline.
  const outbox = useOutbox();
  useEffect(() => {
    void loadOutbox();
    void loadTaskFilters();
  }, []);
  const shownState = useMemo(
    () =>
      outbox.length === 0
        ? state
        : {
            ...state,
            tasks: applyMutations(state.tasks, outbox),
            attendance: currentUser ? applyAttendance(state.attendance, outbox, currentUser.id) : state.attendance,
            inspections: applyInspectionDecisions(state.inspections, outbox),
            correctiveActions: applyCorrectiveUpdates(state.correctiveActions, outbox),
          },
    [state, outbox, currentUser],
  );

  const value = useMemo(
    () => ({
      state: shownState,
      currentUser,
      dispatch,
      signIn,
      signInWithSession,
      signOut,
      unlock,
      refreshBackendData,
      markWelcomeSeen,
    }),
    [currentUser, shownState],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSmartClean() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useSmartClean must be used inside SmartCleanProvider");
  return context;
}
