import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import {
  loadBackendBootstrap,
  loginToBackend,
  logoutFromBackend,
  setSessionHandlers,
  type BackendBootstrap,
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
  StockItem,
  Task,
} from "@/types/smartclean";
import { SecureSessionService, type StoredSession } from "@/storage/SecureSessionService";

interface State {
  currentUserId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  authExpiresAt: string | null;
  sessionRestored: boolean;
  loading: boolean;
  error: string | null;
  connectivity: Connectivity;
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
}

type Action =
  | { type: "RESTORE"; state: Partial<State> | null; session: StoredSession | null }
  | { type: "SET_LOADING"; loading: boolean; error?: string | null }
  | { type: "SET_AUTH"; accessToken: string; refreshToken: string; expiresAt: string; bootstrap: BackendBootstrap }
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
  };
}

function bootstrapState(bootstrap: BackendBootstrap): Partial<State> {
  return {
    users: bootstrap.users.length ? bootstrap.users : [bootstrap.user],
    sites: bootstrap.sites,
    locations: bootstrap.locations,
    qrCodes: bootstrap.qrCodes,
    tasks: bootstrap.tasks,
    inspections: bootstrap.inspections,
    correctiveActions: bootstrap.correctiveActions,
    incidents: bootstrap.incidents,
    notifications: bootstrap.notifications,
    // Previously never sourced from the backend — state.attendance only
    // changed via local-only CLOCK_IN/CLOCK_OUT reducer actions that
    // nothing dispatched (the scan screen only calls clockIn() +
    // refreshBackendData()), so a real clock-in never showed up as
    // "Clocked in" on Home. Now backed by AttendanceController.today_status
    // via bootstrap.attendance — same fix already applied on web.
    attendance: bootstrap.attendance,
    turnovers: bootstrap.turnovers,
    stock: bootstrap.stock,
    assets: bootstrap.assets,
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
        ...bootstrapState(action.bootstrap),
      };
    case "SET_SESSION":
      // From request()'s transparent refresh-and-retry in api/client.ts
      // — only the tokens change here, not bootstrap data, since a
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
  signOut: () => Promise<void>;
  refreshBackendData: () => Promise<void>;
} | null>(null);

export function SmartCleanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  // api/client.ts's request() calls these on a 401 to transparently
  // refresh-and-retry — registered once below via a ref rather than
  // closing over `state` directly, since client.ts's module-level
  // handlers are set once but need the *current* refresh token, not
  // whatever it was at registration time.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Tracks whether this mount has already fetched fresh backend data
  // once — either via the restore-on-mount effect below, or because
  // signIn() already delivered a fresh bootstrap directly. Mirrors the
  // fix already applied to the web app's store.tsx for the exact same
  // bug: gating the restore-fetch on `state.users.length === 0` looks
  // right for a brand-new session, but a *returning* session's
  // AsyncStorage snapshot almost always has non-empty `users` already —
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
        // The refresh token itself is invalid/expired too — nothing left
        // to try. Clear the session so the user gets a clean re-login
        // prompt instead of every subsequent request silently 401ing.
        void SecureSessionService.clear();
        dispatch({ type: "SIGN_OUT" });
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
      const { session, bootstrap } = await loginToBackend(username, password);
      await SecureSessionService.set(session);
      // SET_AUTH below already carries a fresh bootstrap — mark the
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
      });
    } catch (error) {
      dispatch({ type: "SET_LOADING", loading: false, error: error instanceof Error ? error.message : "Login failed" });
      throw error;
    }
  };

  const signOut = async () => {
    const { accessToken, refreshToken } = state;
    await SecureSessionService.clear();
    dispatch({ type: "SIGN_OUT" });
    if (accessToken && refreshToken) {
      try {
        await logoutFromBackend(accessToken, refreshToken);
      } catch {
        // best-effort — local session is already cleared
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [raw, session] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), SecureSessionService.get()]);
      if (cancelled) return;
      const persisted = raw ? (JSON.parse(raw) as Partial<State>) : null;
      dispatch({
        type: "RESTORE",
        state: session
          ? { ...persisted, accessToken: session.accessToken, refreshToken: session.refreshToken, authExpiresAt: session.expiresAt }
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
    const { accessToken: _accessToken, refreshToken: _refreshToken, authExpiresAt: _authExpiresAt, sessionRestored: _sessionRestored, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state]);

  const currentUser = state.users.find((user) => user.id === state.currentUserId);

  const value = useMemo(
    () => ({ state, currentUser, dispatch, signIn, signOut, refreshBackendData }),
    [currentUser, state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSmartClean() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useSmartClean must be used inside SmartCleanProvider");
  return context;
}
