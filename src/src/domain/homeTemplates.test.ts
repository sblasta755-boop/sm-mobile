import {
  CUSTOM_CARDS,
  defaultCustom,
  isDefaultCustom,
  mergeStored,
  resolveCustom,
} from "./homeLayout";
import {
  matchingTemplate,
  TEMPLATES,
  templateById,
  templateCustom,
  templatePatch,
} from "./homeTemplates";

describe("home templates", () => {
  it("every template uses only known cards and views, with no repeats", () => {
    for (const t of TEMPLATES) {
      const ids = t.cards.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of t.cards) {
        const def = CUSTOM_CARDS.find((d) => d.id === c.id);
        expect(def).toBeTruthy();
        if (c.view) expect(def!.views.map((v) => v.id)).toContain(c.view);
        if (c.period) expect(def!.periods).toBe(true);
      }
    }
  });

  it("template ids are unique, and only the Operations desk is the default Custom home", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES)
      expect(isDefaultCustom(templateCustom(t))).toBe(
        t.id === "operations_desk",
      );
  });

  it("makes its cards visible in its order, with every other card waiting hidden", () => {
    const t = templateById("quality_and_tasks")!;
    const made = templateCustom(t);
    expect(made.cards.map((c) => c.id).sort()).toEqual(
      CUSTOM_CARDS.map((c) => c.id).sort(),
    );
    expect(made.cards.filter((c) => c.visible).map((c) => c.id)).toEqual(
      t.cards.map((c) => c.id),
    );
    expect(made.cards.slice(0, t.cards.length).every((c) => c.visible)).toBe(
      true,
    );
    expect(made.cards.slice(t.cards.length).every((c) => !c.visible)).toBe(
      true,
    );
    expect(made.cards.find((c) => c.id === "completion")?.view).toBe("gauge");
    expect(made.cards.find((c) => c.id === "activity_map")?.period).toBe("90");
  });

  it("falls back to the card's own view when a template names one it cannot draw", () => {
    const made = templateCustom({
      ...TEMPLATES[0],
      cards: [{ id: "noticeboard", view: "gauge" }, { id: "nope" }],
    });
    expect(made.cards[0]).toMatchObject({
      id: "noticeboard",
      view: "number",
      visible: true,
    });
    expect(made.cards.some((c) => c.id === "nope")).toBe(false);
  });

  it("stores as an ordinary layout that reads back the same and opens on Custom", () => {
    for (const t of TEMPLATES) {
      const stored = mergeStored(null, templatePatch(t));
      expect(stored?.active).toBe("custom");
      const back = resolveCustom(stored);
      expect(back).toEqual(templateCustom(t));
      expect(matchingTemplate(back)?.id).toBe(t.id);
    }
  });

  it("only matches a template that is exactly the person's Custom home", () => {
    // Someone who never customised is already on the Operations desk, so it says "In use".
    expect(matchingTemplate(defaultCustom())?.id).toBe("operations_desk");
    const made = templateCustom(TEMPLATES[1]);
    expect(
      matchingTemplate({ ...made, look: { ...made.look, density: "compact" } }),
    ).toBeUndefined();
  });
});
