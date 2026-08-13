import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import * as sample from "@/domain/sampleData";
import type {
  Connectivity,
  CorrectiveAction,
  DemoUser,
  Evidence,
  Incident,
  Inspection,
  QrCode,
  Site,
  SyncOp,
  Task,
} from "@/types/smartclean";
import { SecureSessionService, type StoredSession } from "@/storage/SecureSessionService";

interface State {
  currentUserId: string | null;
  sessionRestored: boolean;
  connectivity: Connectivity;
  users: DemoUser[];
  sites: Site[];
  qrCodes: QrCode[];
  tasks: Task[];
  inspections: Inspection[];
  correctiveActions: CorrectiveAction[];
  incidents: Incident[];
  syncQueue: SyncOp[];
  attendance: Record<string, { clockedInAt?: string; siteId?: string; locationCapturedAt?: string }>;
  accessTokenPresent: boolean;
}

type Action =
  | { type: "RESTORE"; state: Partial<State> | null; session: StoredSession | null }
  | { type: "SET_USER"; userId: string | null }
  | { type: "SET_CONNECTIVITY"; value: Connectivity }
  | { type: "CLOCK_IN"; userId: string; siteId: string }
  | { type: "CLOCK_OUT"; userId: string }
  | { type: "UPDATE_TASK"; taskId: string; patch: Partial<Task> }
  | { type: "TOGGLE_CHECK"; taskId: string; itemId: string; value?: string | boolean }
  | { type: "ADD_EVIDENCE"; taskId: string; evidence: Evidence }
  | { type: "REMOVE_EVIDENCE"; taskId: string; evidenceId: string }
  | { type: "SUBMIT_TASK"; taskId: string }
  | { type: "CREATE_INSPECTION"; inspection: Inspection }
  | { type: "UPDATE_INSPECTION"; id: string; patch: Partial<Inspection> }
  | { type: "CREATE_CA"; ca: CorrectiveAction }
  | { type: "UPDATE_CA"; id: string; patch: Partial<CorrectiveAction> }
  | { type: "APPEND_CA_TIMELINE"; id: string; entry: { at: string; actor: string; text: string } }
  | { type: "CREATE_INCIDENT"; incident: Incident }
  | { type: "ENQUEUE_SYNC"; op: SyncOp }
  | { type: "UPDATE_SYNC"; id: string; patch: Partial<SyncOp> }
  | { type: "SYNC_ALL" }
  | { type: "UPDATE_USER"; userId: string; patch: Partial<DemoUser> }
  | { type: "SIGN_OUT" };

const STORAGE_KEY = "smartclean.mobile.state.v1";

const initialState: State = {
  currentUserId: null,
  sessionRestored: false,
  connectivity: "online",
  users: sample.users,
  sites: sample.sites,
  qrCodes: sample.qrCodes,
  tasks: sample.tasks,
  inspections: sample.inspections,
  correctiveActions: sample.correctiveActions,
  incidents: sample.incidents,
  syncQueue: sample.syncQueue,
  attendance: {},
  accessTokenPresent: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESTORE":
      return {
        ...state,
        ...(action.state ?? {}),
        currentUserId: action.state?.currentUserId ?? state.currentUserId,
        accessTokenPresent: Boolean(action.session),
        sessionRestored: true,
      };
    case "SET_USER":
      return { ...state, currentUserId: action.userId };
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
    case "TOGGLE_CHECK":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
                ...task,
                status: task.status === "assigned" || task.status === "not_started" ? "in_progress" : task.status,
                startedAt: task.startedAt ?? new Date().toISOString(),
                checklist: task.checklist.map((item) =>
                  item.id === action.itemId
                    ? {
                        ...item,
                        done: typeof action.value === "boolean" ? action.value : item.type === "note" ? item.done : !item.done,
                        value: typeof action.value === "string" ? action.value : item.value,
                      }
                    : item,
                ),
              }
            : task,
        ),
      };
    case "ADD_EVIDENCE":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, evidence: [...task.evidence, action.evidence] } : task,
        ),
      };
    case "REMOVE_EVIDENCE":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? { ...task, evidence: task.evidence.filter((evidence) => evidence.id !== action.evidenceId) }
            : task,
        ),
      };
    case "SUBMIT_TASK":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, status: "submitted", submittedAt: new Date().toISOString() } : task,
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
    case "CREATE_CA":
      return { ...state, correctiveActions: [action.ca, ...state.correctiveActions] };
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
    case "ENQUEUE_SYNC":
      return state.syncQueue.some((op) => op.entity === action.op.entity && op.kind === action.op.kind && op.status !== "synced")
        ? state
        : { ...state, syncQueue: [action.op, ...state.syncQueue] };
    case "UPDATE_SYNC":
      return {
        ...state,
        syncQueue: state.syncQueue.map((op) => (op.id === action.id ? { ...op, ...action.patch } : op)),
      };
    case "SYNC_ALL":
      return {
        ...state,
        syncQueue: state.syncQueue.map((op) =>
          op.status === "queued" || op.status === "failed" ? { ...op, status: "synced" } : op,
        ),
      };
    case "UPDATE_USER":
      return {
        ...state,
        users: state.users.map((user) => (user.id === action.userId ? { ...user, ...action.patch } : user)),
      };
    case "SIGN_OUT":
      return { ...state, currentUserId: null, accessTokenPresent: false };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: State;
  currentUser: DemoUser | undefined;
  dispatch: React.Dispatch<Action>;
  signInAs: (role: "cleaner" | "supervisor") => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);

export function SmartCleanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const [raw, session] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), SecureSessionService.get()]);
      if (!cancelled) {
        dispatch({ type: "RESTORE", state: raw ? (JSON.parse(raw) as Partial<State>) : null, session });
      }
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
    if (!state.sessionRestored) return;
    const { accessTokenPresent: _accessTokenPresent, sessionRestored: _sessionRestored, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state]);

  useEffect(() => {
    if (state.connectivity === "online" && state.syncQueue.some((op) => op.status === "queued")) {
      dispatch({ type: "SYNC_ALL" });
    }
  }, [state.connectivity, state.syncQueue]);

  const currentUser = state.users.find((user) => user.id === state.currentUserId);

  const value = useMemo(
    () => ({
      state,
      currentUser,
      dispatch,
      async signInAs(role: "cleaner" | "supervisor") {
        const user = state.users.find((item) => item.role === role);
        if (!user) return;
        await SecureSessionService.set({
          accessToken: `demo-${role}-access`,
          refreshToken: `demo-${role}-refresh`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        dispatch({ type: "SET_USER", userId: user.id });
      },
      async signOut() {
        await SecureSessionService.clear();
        dispatch({ type: "SIGN_OUT" });
      },
    }),
    [currentUser, state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSmartClean() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useSmartClean must be used inside SmartCleanProvider");
  return context;
}
