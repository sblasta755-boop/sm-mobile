import type { TournamentMatch } from "@/api/client";
import { canPick, matchesByRound, roundName } from "./tournament";

const m = (round: number, position: number, extra: Partial<TournamentMatch> = {}): TournamentMatch => ({
  round,
  position,
  a: "a",
  b: "b",
  winner: null,
  status: "ready",
  tableId: null,
  ...extra,
});

describe("tournament helpers", () => {
  it("names rounds back from the final", () => {
    expect(roundName(3, 3)).toBe("Final");
    expect(roundName(2, 3)).toBe("Semi-finals");
    expect(roundName(1, 3)).toBe("Quarter-finals");
    expect(roundName(1, 4)).toBe("Round 1");
  });

  it("groups matches by round in position order", () => {
    const groups = matchesByRound([m(2, 0), m(1, 1), m(1, 0)]);
    expect(groups.map((g) => g.map((x) => `${x.round}.${x.position}`))).toEqual([["1.0", "1.1"], ["2.0"]]);
  });

  it("only lets a winner be picked when both players are known and it is not a bye", () => {
    expect(canPick(m(1, 0))).toBe(true);
    expect(canPick(m(1, 0, { b: null, status: "pending" }))).toBe(false);
    expect(canPick(m(1, 0, { status: "bye" }))).toBe(false);
  });
});
