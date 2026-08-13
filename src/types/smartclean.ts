export type Role =
  | "operations_manager"
  | "site_manager"
  | "supervisor"
  | "cleaner"
  | "client_auditor"
  | "system_admin";

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  initials: string;
  siteIds: string[];
  email?: string;
  profilePhotoDataUrl?: string;
}

export type TaskStatus =
  | "scheduled"
  | "assigned"
  | "not_started"
  | "in_progress"
  | "submitted"
  | "awaiting_inspection"
  | "rework_required"
  | "resubmitted"
  | "approved"
  | "closed"
  | "cancelled";

export type InspectionStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "reinspection_required"
  | "closed";

export type CAStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "resubmitted"
  | "awaiting_reinspection"
  | "closed"
  | "overdue";

export type IncidentPriority = "low" | "medium" | "high" | "critical";
export type Connectivity = "online" | "offline" | "slow";

export interface ChecklistItem {
  id: string;
  label: string;
  type: "checkbox" | "pass_fail" | "photo_required" | "note" | "declaration";
  risk?: "low" | "medium" | "high";
  requiredEvidence?: boolean;
  done?: boolean;
  value?: string;
}

export interface Evidence {
  id: string;
  taskId: string;
  kind: "before" | "after" | "issue" | "signature" | "note";
  label: string;
  capturedAt: string;
  device: string;
  offlineOriginated?: boolean;
  duplicateOf?: string;
  imgSeed: number;
  uri?: string;
}

export interface Task {
  id: string;
  siteId: string;
  locationId: string;
  locationName: string;
  title: string;
  priority: "low" | "medium" | "high";
  dueTime: string;
  estimatedMinutes: number;
  status: TaskStatus;
  assigneeId: string;
  supervisorId: string;
  checklist: ChecklistItem[];
  evidence: Evidence[];
  requiresBeforeAfter: boolean;
  requiredQr: string;
  qrVerified?: boolean;
  startedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  score?: number;
  note?: string;
}

export interface Inspection {
  id: string;
  taskId: string;
  inspectorId?: string;
  status: InspectionStatus;
  score?: number;
  scores?: Record<string, number>;
  comments?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface CorrectiveAction {
  id: string;
  taskId: string;
  inspectionId: string;
  assigneeId: string;
  reason: string;
  priority: "low" | "medium" | "high";
  deadline: string;
  status: CAStatus;
  createdAt: string;
  resubmittedAt?: string;
  closedAt?: string;
  timeline: { at: string; actor: string; text: string }[];
}

export interface Site {
  id: string;
  name: string;
  address: string;
  clientId: string;
  geofenceRadius: number;
  supervisorId: string;
  active: boolean;
}

export interface Location {
  id: string;
  siteId: string;
  name: string;
  type: "reception" | "bathroom" | "boardroom" | "kitchen" | "office" | "stockroom";
  qr: string;
}

export interface QrCode {
  code: string;
  kind: "site" | "room" | "zone" | "asset" | "stock" | "property";
  targetId: string;
  targetName: string;
  active: boolean;
  lastScanAt?: string;
  exceptions: number;
}

export interface Incident {
  id: string;
  siteId: string;
  locationName: string;
  category: string;
  priority: IncidentPriority;
  description: string;
  ownerId: string;
  status: "open" | "assigned" | "investigating" | "awaiting_action" | "resolved" | "closed";
  createdAt: string;
  offlineOriginated?: boolean;
  uri?: string;
}

export interface SyncOp {
  id: string;
  kind: string;
  status: "local" | "queued" | "synchronising" | "synced" | "failed" | "conflict";
  createdAt: string;
  entity?: string;
  conflict?: string;
}
