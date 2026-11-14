import type { ExperienceContent, PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  isItemsPage,
  itemsNoun,
  itemsSaveMode,
  reconcileItemsDesign,
  withPrefilledRow,
  withReconciledDesign,
} from "../src/features/experiences/edit-items.js";

const style = {
  palette: {
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#111111",
    muted: "#666666",
    accent: "#0a6c78",
  },
  fonts: { heading: "geist", body: "system" },
  radius: 12,
  buttonStyle: "solid",
  buttonShape: "rounded",
  shadow: "none",
  background: { kind: "solid", color: "#ffffff" },
  maxWidth: 640,
} as PageDesign["style"];

function menu(sections: { id: string; items: string[] }[]): ExperienceContent {
  return {
    title: "Menú",
    currency: "MXN",
    sections: sections.map((section) => ({
      id: section.id,
      name: section.id,
      items: section.items.map((id) => ({ id, name: id, price: 10 })),
    })),
  } as ExperienceContent;
}

function design(blocks: PageDesign["sections"][number]): PageDesign {
  return { schema: 1, style, sections: [blocks] };
}

const flow = (columns: unknown[][]) =>
  ({
    id: "s1",
    layout: "1",
    columns,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 12,
    align: "start",
  }) as PageDesign["sections"][number];

describe("itemsSaveMode", () => {
  it("publishes a live page with nothing else pending", () => {
    expect(itemsSaveMode({ liveRevision: 3, liveTouchpointCount: 2 })).toBe(
      "publish",
    );
  });

  it("only saves when the page has other unpublished changes", () => {
    expect(
      itemsSaveMode({
        liveRevision: 3,
        liveTouchpointCount: 2,
        hasUnpublishedChanges: true,
      }),
    ).toBe("save-pending");
  });

  it("only saves a page never published", () => {
    expect(itemsSaveMode({ liveTouchpointCount: 0 })).toBe("save-draft");
    expect(itemsSaveMode({ liveRevision: null })).toBe("save-draft");
  });
});

describe("itemsNoun and isItemsPage", () => {
  it("uses the giro's word, or a plain one for the type", () => {
    expect(
      itemsNoun("catalog", { one: "servicio", many: "servicios" }),
    ).toEqual({ one: "servicio", many: "servicios" });
    expect(
      itemsNoun("menu", {
        one: "platillo o bebida",
        many: "platillos y bebidas",
      }),
    ).toEqual({ one: "platillo", many: "platillos" });
    expect(itemsNoun("catalog", null).many).toBe("productos");
  });

  it("is only for Menú and Catálogo", () => {
    expect(isItemsPage("menu")).toBe(true);
    expect(isItemsPage("catalog")).toBe(true);
    expect(isItemsPage("form")).toBe(false);
  });
});

describe("reconcileItemsDesign", () => {
  const before = menu([
    { id: "desayunos", items: ["chilaquiles", "molletes"] },
    { id: "comidas", items: ["pozole"] },
  ]);

  it("forgets deleted dishes in a highlight, and drops an empty highlight", () => {
    const after = menu([
      { id: "desayunos", items: ["chilaquiles"] },
      { id: "comidas", items: ["pozole"] },
    ]);
    const result = reconcileItemsDesign(
      design(
        flow([
          [
            {
              id: "f1",
              kind: "featuredItems",
              layout: "cards",
              itemIds: ["molletes", "pozole"],
            },
            {
              id: "f2",
              kind: "featuredItems",
              layout: "cards",
              itemIds: ["molletes"],
            },
            { id: "m1", kind: "menu", layout: "list" },
          ],
        ]),
      ),
      "menu",
      after,
      before,
    );
    const blocks = result.sections[0] as { columns: { id: string }[][] };
    expect(blocks.columns[0]?.map((block) => block.id)).toEqual(["f1", "m1"]);
    expect(blocks.columns[0]?.[0]).toMatchObject({ itemIds: ["pozole"] });
  });

  it("keeps a split menu showing what is left, plus the new sections", () => {
    const after = menu([
      { id: "comidas", items: ["pozole"] },
      { id: "bebidas", items: ["agua"] },
    ]);
    const result = reconcileItemsDesign(
      design(
        flow([
          [
            {
              id: "m1",
              kind: "menu",
              layout: "list",
              sectionIds: ["desayunos"],
            },
            {
              id: "m2",
              kind: "menu",
              layout: "list",
              sectionIds: ["comidas"],
            },
          ],
        ]),
      ),
      "menu",
      after,
      before,
    );
    const blocks = result.sections[0] as {
      columns: { id: string; sectionIds?: string[] }[][];
    };
    expect(blocks.columns[0]).toEqual([
      expect.objectContaining({ id: "m2", sectionIds: ["comidas", "bebidas"] }),
    ]);
  });

  it("a single menu block left with no chosen section shows all of them", () => {
    const after = menu([{ id: "comidas", items: ["pozole"] }]);
    const result = reconcileItemsDesign(
      design(
        flow([
          [
            {
              id: "m1",
              kind: "menu",
              layout: "list",
              sectionIds: ["desayunos"],
            },
          ],
        ]),
      ),
      "menu",
      after,
      before,
    );
    const blocks = result.sections[0] as { columns: object[][] };
    expect(blocks.columns[0]?.[0]).not.toHaveProperty("sectionIds");
  });

  it("leaves content without a design untouched", () => {
    const after = menu([{ id: "comidas", items: ["pozole"] }]);
    expect(withReconciledDesign("menu", after, before)).toBe(after);
  });
});

describe("withPrefilledRow (S1, relevo 37)", () => {
  const sections = [
    {
      id: "s1",
      name: "Entradas",
      rows: [
        { id: "a", name: "Guacamole", price: "145" },
        { id: "b", name: "", price: "" },
      ],
    },
    {
      id: "s2",
      name: "Platos fuertes",
      rows: [{ id: "c", name: "", price: "" }],
    },
  ];

  it("types the search term into the empty row of the last section", () => {
    const result = withPrefilledRow(sections, "mole");
    expect(result[0]).toEqual(sections[0]);
    expect(result[1]?.rows).toEqual([{ id: "c", name: "mole", price: "" }]);
  });

  it("does nothing without a name, or with no sections", () => {
    expect(withPrefilledRow(sections, null)).toEqual(sections);
    expect(withPrefilledRow(sections, "   ")).toEqual(sections);
    expect(withPrefilledRow([], "mole")).toEqual([]);
  });

  it("leaves an unexpectedly filled last row alone", () => {
    const filled = [
      {
        id: "s1",
        name: "Entradas",
        rows: [{ id: "a", name: "Ya hay algo", price: "" }],
      },
    ];
    expect(withPrefilledRow(filled, "mole")).toEqual(filled);
  });
});
