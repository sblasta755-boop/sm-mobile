import { fuzzyFilter, fuzzyScore, normalise } from "./fuzzySearch";

const rows = ["Nkosinathi Ngozo", "Nondumiso Mabena", "Šoma Café", "La Cosa Nostra", "DRAMA Bar & Lounge", "Łukasz Kowalski", "Ngôzo O'Brien-Smith"];
const f = (r: string) => [r];

describe("normalise", () => {
  it("folds accents, case and punctuation", () => {
    expect(normalise("Šoma  Café")).toBe("soma cafe");
    expect(normalise("Łukasz O'Brien-Smith")).toBe("lukasz o brien smith");
  });
});

describe("fuzzyFilter", () => {
  const find = (q: string) => fuzzyFilter(rows, q, f);
  it("returns everything, in order, for an empty query", () => {
    expect(find("  ")).toBe(rows);
  });
  it("ignores accents and case", () => {
    expect(find("soma")).toEqual(["Šoma Café"]);
    expect(find("ngozo")).toEqual(["Nkosinathi Ngozo", "Ngôzo O'Brien-Smith"]);
    expect(find("lukasz")).toEqual(["Łukasz Kowalski"]);
  });
  it("finds words in any order and ignores a leading article", () => {
    expect(find("nostra cosa")).toEqual(["La Cosa Nostra"]);
    expect(find("lounge drama")).toEqual(["DRAMA Bar & Lounge"]);
  });
  it("forgives a small typo, more for longer words", () => {
    expect(find("mabnea")).toEqual(["Nondumiso Mabena"]);
    expect(find("nkosinati")).toEqual(["Nkosinathi Ngozo"]);
    expect(find("kowalsky")).toEqual(["Łukasz Kowalski"]);
  });
  it("stays strict for very short queries", () => {
    expect(find("mx")).toEqual([]);
    expect(find("zzz")).toEqual([]);
    expect(find("nkx")).toEqual([]);
  });
  it("ranks exact and prefix hits above typos", () => {
    const people = ["Mabel Stone", "Mabena Dlamini", "Mabene Khoza"];
    expect(fuzzyFilter(people, "mabena", f)[0]).toBe("Mabena Dlamini");
  });
  it("does not match across field boundaries", () => {
    expect(fuzzyScore("ab cd", ["xa", "bx", "cd"])).toBeNull();
    expect(fuzzyScore("ab", ["xa", "bx"])).toBeNull();
  });
  it("caps the result count", () => {
    expect(fuzzyFilter(["aa1", "aa2", "aa3"], "aa", f, 2)).toHaveLength(2);
  });
  it("stays fast on a big list", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `Person${i} Surname${i % 97} Cleaner Site${i % 13}`);
    fuzzyFilter(big, "surnmae cleaner", f); // warm up the engine
    // Best of three, so one slow moment on a busy machine does not fail it.
    const runs = [0, 1, 2].map(() => {
      const t = Date.now();
      fuzzyFilter(big, "surnmae cleaner", f);
      return Date.now() - t;
    });
    expect(Math.min(...runs)).toBeLessThan(500);
  });
});
