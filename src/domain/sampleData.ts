import type {
  CorrectiveAction,
  DemoUser,
  Incident,
  Inspection,
  Location,
  QrCode,
  Site,
  SyncOp,
  Task,
} from "@/types/smartclean";

export const users: DemoUser[] = [
  {
    id: "user_cleaner",
    name: "Amina Jacobs",
    role: "cleaner",
    initials: "AJ",
    siteIds: ["site_sbp"],
    email: "amina@smartclean.local",
  },
  {
    id: "user_supervisor",
    name: "Thandi Ndlovu",
    role: "supervisor",
    initials: "TN",
    siteIds: ["site_sbp"],
    email: "thandi@smartclean.local",
  },
];

export const sites: Site[] = [
  {
    id: "site_sbp",
    name: "Sandton Business Park",
    address: "135 Rivonia Road, Sandton",
    clientId: "client_ice",
    geofenceRadius: 85,
    supervisorId: "user_supervisor",
    active: true,
  },
];

export const locations: Location[] = [
  { id: "loc_bathroom_2", siteId: "site_sbp", name: "Bathroom 2", type: "bathroom", qr: "ROOM-SBP-BTH-02" },
  { id: "loc_reception", siteId: "site_sbp", name: "Reception", type: "reception", qr: "ZONE-SBP-REC-01" },
];

export const qrCodes: QrCode[] = [
  { code: "SITE-SBP-001", kind: "site", targetId: "site_sbp", targetName: "Sandton Business Park", active: true, exceptions: 0 },
  { code: "ROOM-SBP-BTH-02", kind: "room", targetId: "loc_bathroom_2", targetName: "Bathroom 2", active: true, exceptions: 0 },
  { code: "ZONE-SBP-REC-01", kind: "zone", targetId: "loc_reception", targetName: "Reception", active: true, exceptions: 0 },
  { code: "STOCK-SBP-001", kind: "stock", targetId: "stock_towels", targetName: "Bathroom towels", active: true, exceptions: 0 },
];

export const tasks: Task[] = [
  {
    id: "task_bathroom_2",
    siteId: "site_sbp",
    locationId: "loc_bathroom_2",
    locationName: "Bathroom 2",
    title: "Bathroom hygiene reset",
    priority: "high",
    dueTime: "10:30",
    estimatedMinutes: 35,
    status: "assigned",
    assigneeId: "user_cleaner",
    supervisorId: "user_supervisor",
    requiresBeforeAfter: true,
    requiredQr: "ROOM-SBP-BTH-02",
    checklist: [
      { id: "chk_toilets", label: "Clean and disinfect toilets", type: "checkbox", risk: "high" },
      { id: "chk_basins", label: "Wipe basins, taps and mirrors", type: "checkbox", risk: "medium" },
      { id: "chk_supplies", label: "Restock soap, paper and towels", type: "photo_required", requiredEvidence: true },
      { id: "chk_floor", label: "Mop floor and wet-floor sign removed", type: "checkbox" },
      { id: "chk_note", label: "Notes for supervisor", type: "note" },
    ],
    evidence: [],
  },
  {
    id: "task_reception",
    siteId: "site_sbp",
    locationId: "loc_reception",
    locationName: "Reception",
    title: "Reception detail clean",
    priority: "medium",
    dueTime: "12:00",
    estimatedMinutes: 25,
    status: "not_started",
    assigneeId: "user_cleaner",
    supervisorId: "user_supervisor",
    requiresBeforeAfter: false,
    requiredQr: "ZONE-SBP-REC-01",
    checklist: [
      { id: "chk_desk", label: "Disinfect reception counter", type: "checkbox" },
      { id: "chk_glass", label: "Clean entrance glass", type: "checkbox" },
      { id: "chk_bins", label: "Empty bins and replace liners", type: "checkbox" },
    ],
    evidence: [],
  },
];

export const inspections: Inspection[] = [];
export const correctiveActions: CorrectiveAction[] = [];
export const incidents: Incident[] = [];
export const syncQueue: SyncOp[] = [];
