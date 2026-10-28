import { homeTiles, todayRows, type HomeTileInput } from "./homeTiles";

const off: HomeTileInput = {
  hourlyCompliance: false,
  roundsToClaim: 0,
  correctiveActions: false,
  openCorrective: { count: 0 },
  stock: false,
  incidents: false,
  hasQr: false,
  schedule: false,
  progress: false,
};
const keys = (input: HomeTileInput) => homeTiles(input).map((t) => t.key);

test("with every feature off, no tiles are offered", () => {
  expect(keys(off)).toEqual([]);
});

test("with every feature on, the tiles come in a stable order", () => {
  const all: HomeTileInput = {
    hourlyCompliance: true,
    roundsToClaim: 2,
    correctiveActions: true,
    openCorrective: { count: 3 },
    stock: true,
    incidents: true,
    hasQr: true,
    schedule: true,
    progress: true,
  };
  expect(keys(all)).toEqual(["rounds", "corrective", "stock", "incident", "schedule", "progress"]);
});

test("a feature that is off never appears, and an open-action count of zero hides that tile", () => {
  expect(keys({ ...off, correctiveActions: true })).toEqual([]);
  expect(keys({ ...off, correctiveActions: false, openCorrective: { count: 4 } })).toEqual([]);
  expect(keys({ ...off, schedule: true })).toEqual(["schedule"]);
});

test("a single open corrective action opens it directly; several open the list", () => {
  const one = homeTiles({ ...off, correctiveActions: true, openCorrective: { count: 1, onlyId: "ca_1" } }).find((t) => t.key === "corrective");
  expect(one?.action).toEqual({ kind: "route", path: "/corrective-actions/ca_1" });
  const many = homeTiles({ ...off, correctiveActions: true, openCorrective: { count: 2, onlyId: undefined } }).find((t) => t.key === "corrective");
  expect(many?.action).toEqual({ kind: "toggle", id: "corrective" });
  expect(many?.badge).toBe(2);
});

test("reporting an incident goes to the scanner when QR codes are used, and to the form when not", () => {
  const path = (hasQr: boolean) => (homeTiles({ ...off, incidents: true, hasQr }).find((t) => t.key === "incident")?.action as { path: string }).path;
  expect(path(true)).toBe("/scan");
  expect(path(false)).toBe("/incidents/new");
});

test("hourly rounds flag how many can be claimed", () => {
  const tile = homeTiles({ ...off, hourlyCompliance: true, roundsToClaim: 3 }).find((t) => t.key === "rounds");
  expect(tile?.badge).toBe(3);
  expect(tile?.hint).toBe("3 to claim");
  expect(homeTiles({ ...off, hourlyCompliance: true }).find((t) => t.key === "rounds")?.badge).toBeUndefined();
});

test("the Today card always has the task count, and adds the rows that have something to say", () => {
  expect(todayRows({ hasBooking: false, hasPoints: false })).toEqual(["tasks"]);
  expect(todayRows({ hasBooking: true, hasPoints: true })).toEqual(["booking", "points", "tasks"]);
  expect(todayRows({ hasBooking: false, hasPoints: true })).toEqual(["points", "tasks"]);
});

test("a leave tile shows when the module is on, after the schedule tile", () => {
  expect(keys({ ...off, schedule: true, leave: true })).toEqual(["schedule", "leave"]);
  expect(keys({ ...off, leave: false })).toEqual([]);
});
