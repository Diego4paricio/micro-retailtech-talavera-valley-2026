import type {
  AvailabilityExperience,
  AvailabilityItem,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  allAvailableChanges,
  availabilityErrorMessage,
  countItems,
  countsSummary,
  emptyFilterMessage,
  filterSections,
  groupItems,
  hasItemPhotos,
  itemBadge,
  listToolsFrom,
  normalizeSearch,
  parseQuantityInput,
  publicState,
  relativeTime,
  searchEmptyState,
  sectionSummary,
  showsListTools,
  snapshotChanges,
  startCounting,
  stopCounting,
  touchpointsLabel,
  withQuantity,
  withStatus,
} from "../src/features/availability/model.js";
import { ApiRequestError } from "../src/lib/api.js";

function item(
  id: string,
  overrides: Partial<AvailabilityItem> = {},
): AvailabilityItem {
  return {
    id,
    name: id,
    status: "available",
    quantity: null,
    updatedAt: null,
    ...overrides,
  };
}

function menu(): AvailabilityExperience {
  return {
    experienceId: "3f7d2c1a-8b4e-4f6a-9c0d-2e1f3a4b5c61",
    name: "Menú Terraza",
    type: "menu",
    currency: "MXN",
    source: "published",
    hasUnpublishedChanges: false,
    liveTouchpointCount: 2,
    updatedAt: null,
    sections: [
      {
        id: "entradas",
        name: "Entradas",
        items: [
          item("guacamole", { name: "Guacamole de la casa" }),
          item("tostadas", { name: "Tostadas de atún", status: "sold_out" }),
        ],
      },
      {
        id: "fuertes",
        name: "Platos fuertes",
        items: [
          item("arrachera", { name: "Arrachera", quantity: 2 }),
          item("pesca", { name: "Pesca del día", status: "hidden" }),
          item("orquidea", { name: "Orquídea", quantity: 0 }),
        ],
      },
      {
        id: "bebidas",
        name: "Bebidas",
        items: [item("cafe", { name: "Café de olla" })],
      },
    ],
  };
}

describe("what customers see", () => {
  it("reads a counted item with 0 units left as sold out", () => {
    expect(publicState({ status: "available", quantity: null })).toBe(
      "available",
    );
    expect(publicState({ status: "available", quantity: 3 })).toBe("available");
    expect(publicState({ status: "available", quantity: 0 })).toBe("sold_out");
    expect(publicState({ status: "sold_out", quantity: 5 })).toBe("sold_out");
    expect(publicState({ status: "hidden", quantity: 0 })).toBe("hidden");
  });

  it("labels the chip next to the name", () => {
    expect(itemBadge({ status: "available", quantity: null })).toBeNull();
    expect(itemBadge({ status: "available", quantity: 2 })).toEqual({
      label: "Quedan 2",
      tone: "low",
    });
    expect(itemBadge({ status: "available", quantity: 12 })).toEqual({
      label: "Quedan 12",
      tone: "count",
    });
    expect(itemBadge({ status: "available", quantity: 0 })?.label).toBe(
      "Agotado",
    );
    expect(itemBadge({ status: "sold_out", quantity: 4 })?.label).toBe(
      "Agotado",
    );
    expect(itemBadge({ status: "hidden", quantity: 4 })).toEqual({
      label: "Oculto",
      tone: "hidden",
    });
  });
});

describe("gestures", () => {
  it("choosing Disponible on a counted item at 0 stops counting", () => {
    expect(
      withStatus({ status: "available", quantity: 0 }, "available"),
    ).toEqual({ status: "available", quantity: null });
    expect(
      withStatus({ status: "sold_out", quantity: 5 }, "available"),
    ).toEqual({ status: "available", quantity: 5 });
  });

  it("sold out and hidden keep the count for later", () => {
    expect(
      withStatus({ status: "available", quantity: 3 }, "sold_out"),
    ).toEqual({ status: "sold_out", quantity: 3 });
    expect(withStatus({ status: "available", quantity: 3 }, "hidden")).toEqual({
      status: "hidden",
      quantity: 3,
    });
  });

  it("units above 0 bring a sold-out item back; hidden stays hidden", () => {
    expect(withQuantity({ status: "sold_out", quantity: 0 }, 3)).toEqual({
      status: "available",
      quantity: 3,
    });
    expect(withQuantity({ status: "hidden", quantity: 1 }, 3)).toEqual({
      status: "hidden",
      quantity: 3,
    });
    expect(withQuantity({ status: "available", quantity: 1 }, 0)).toEqual({
      status: "available",
      quantity: 0,
    });
  });

  it("clamps units to 0..9999", () => {
    expect(
      withQuantity({ status: "available", quantity: 1 }, -4).quantity,
    ).toBe(0);
    expect(
      withQuantity({ status: "available", quantity: 1 }, 12_000).quantity,
    ).toBe(9_999);
    expect(
      withQuantity({ status: "available", quantity: 1 }, Number.NaN).quantity,
    ).toBe(0);
  });

  it("starts counting at 1, or at 0 for an item already sold out", () => {
    expect(startCounting({ status: "available", quantity: null })).toEqual({
      status: "available",
      quantity: 1,
    });
    expect(startCounting({ status: "sold_out", quantity: null })).toEqual({
      status: "sold_out",
      quantity: 0,
    });
    expect(stopCounting({ status: "hidden", quantity: 7 })).toEqual({
      status: "hidden",
      quantity: null,
    });
  });

  it("reads typed units: digits only, at most four", () => {
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("abc")).toBeNull();
    expect(parseQuantityInput("12a")).toBe(12);
    expect(parseQuantityInput("007")).toBe(7);
    expect(parseQuantityInput("99999")).toBe(9_999);
  });
});

describe("counts and filters", () => {
  it("counts every item by what customers see", () => {
    expect(countItems(menu())).toEqual({
      all: 6,
      available: 3,
      sold_out: 2,
      hidden: 1,
      counted: 1,
    });
  });

  it("filters by status and drops empty sections", () => {
    const sections = filterSections(menu().sections, "sold_out", "");
    expect(sections.map((section) => section.id)).toEqual([
      "entradas",
      "fuertes",
    ]);
    expect(
      sections.flatMap((section) => section.items.map((entry) => entry.id)),
    ).toEqual(["tostadas", "orquidea"]);
    expect(
      filterSections(menu().sections, "counted", "").flatMap((section) =>
        section.items.map((entry) => entry.id),
      ),
    ).toEqual(["arrachera"]);
  });

  it("searches names ignoring case and accents", () => {
    expect(normalizeSearch("  Café   DE Olla ")).toBe("cafe de olla");
    const found = filterSections(menu().sections, "all", "CAFE");
    expect(found).toHaveLength(1);
    expect(found[0]?.items.map((entry) => entry.id)).toEqual(["cafe"]);
    expect(filterSections(menu().sections, "hidden", "cafe")).toEqual([]);
  });

  it("keeps items changed under the current filter in view", () => {
    const sections = filterSections(
      menu().sections,
      "sold_out",
      "",
      new Set(["guacamole"]),
    );
    expect(sections[0]?.items.map((entry) => entry.id)).toEqual([
      "guacamole",
      "tostadas",
    ]);
  });

  it("returns untouched sections as they are", () => {
    const source = menu().sections;
    const all = filterSections(source, "all", "");
    expect(all).toEqual(source);
    expect(all[0]).toBe(source[0]);
    const tostadas = filterSections(source, "all", "tostadas");
    expect(tostadas[0]).not.toBe(source[0]);
  });

  it("summarizes a section and an Experience", () => {
    expect(
      sectionSummary(menu().sections[1] ?? { id: "", name: null, items: [] }),
    ).toBe("3 artículos · 1 agotado");
    expect(countsSummary(countItems(menu()))).toBe("2 agotados · 1 oculto");
    expect(
      countsSummary({
        all: 3,
        available: 3,
        sold_out: 0,
        hidden: 0,
        counted: 0,
      }),
    ).toBe("Todo disponible");
    expect(touchpointsLabel(0)).toBe("Sin QR ni etiquetas en vivo");
    expect(touchpointsLabel(1)).toBe("En vivo en 1 QR o etiqueta");
    expect(touchpointsLabel(4)).toBe("En vivo en 4 QR y etiquetas");
  });

  it("explains an empty filtered list", () => {
    expect(emptyFilterMessage("sold_out", "")).toBe(
      "No hay artículos agotados.",
    );
    expect(emptyFilterMessage("all", " flan ")).toBe(
      "Ningún artículo coincide con «flan».",
    );
    expect(emptyFilterMessage("hidden", "flan")).toBe(
      "Ningún artículo de «Ocultos» coincide con «flan».",
    );
  });
});

describe("Todo disponible", () => {
  it("changes only items not already available and uncounted", () => {
    expect(allAvailableChanges(menu())).toEqual([
      { itemId: "tostadas", status: "available", quantity: null },
      { itemId: "arrachera", status: "available", quantity: null },
      { itemId: "pesca", status: "available", quantity: null },
      { itemId: "orquidea", status: "available", quantity: null },
    ]);
  });

  it("has nothing to change when everything is available", () => {
    const experience = menu();
    experience.sections = [
      { id: "unica", name: null, items: [item("a"), item("b")] },
    ];
    expect(allAvailableChanges(experience)).toEqual([]);
  });

  it("captures the previous states to undo it", () => {
    expect(snapshotChanges(menu(), ["arrachera", "pesca", "missing"])).toEqual([
      { itemId: "arrachera", status: "available", quantity: 2 },
      { itemId: "pesca", status: "hidden", quantity: null },
    ]);
  });
});

describe("labels and errors", () => {
  it("formats the last change relative to now, never in the future", () => {
    const now = Date.parse("2026-09-28T12:00:00.000Z");
    expect(relativeTime("2026-09-28T11:55:00.000Z", now)).toBe(
      "hace 5 minutos",
    );
    expect(relativeTime("2026-09-28T09:00:00.000Z", now)).toBe("hace 3 horas");
    expect(relativeTime("2026-09-28T12:00:20.000Z", now)).toBe(
      "hace un momento",
    );
  });

  it("explains the availability error codes", () => {
    expect(
      availabilityErrorMessage(
        new ApiRequestError("x", 503, "ITEM_AVAILABILITY_UNAVAILABLE"),
      ),
    ).toContain("no se aplicó");
    expect(
      availabilityErrorMessage(
        new ApiRequestError("x", 409, "EXPERIENCE_ARCHIVED"),
      ),
    ).toContain("se archivó");
    expect(
      availabilityErrorMessage(
        new ApiRequestError("Revisa los campos.", 400, null),
      ),
    ).toBe("Revisa los campos.");
    expect(availabilityErrorMessage(new Error("boom"))).toBe(
      "No pudimos completar esta acción. Intenta de nuevo.",
    );
  });
});

// ---------------------------------------------------------------------------
// D1 («Menú del día», relevo 37): Doña Rosa's «Comida corrida» with its
// guisados — nested under it, each sold out on its own, never counted
// twice, and found by search on the guisado's own name.
// ---------------------------------------------------------------------------
function comidaCorrida(): AvailabilityExperience {
  const base = menu();
  return {
    ...base,
    sections: [
      ...base.sections,
      {
        id: "menu-del-dia",
        name: "Menú del día",
        items: [
          item("comida-corrida", { name: "Comida corrida", price: 85 }),
          item("guisado-mole", {
            name: "Mole con pollo",
            choiceOf: "comida-corrida",
          }),
          item("guisado-chicharron", {
            name: "Chicharrón en salsa verde",
            choiceOf: "comida-corrida",
            status: "sold_out",
          }),
          item("guisado-bistec", {
            name: "Bistec a la mexicana",
            choiceOf: "comida-corrida",
          }),
          item("guisado-chiles", {
            name: "Chiles rellenos",
            choiceOf: "comida-corrida",
          }),
        ],
      },
    ],
  };
}

describe("D1 — guisados nest under their dish", () => {
  it("groups a dish with the guisados right after it, in order", () => {
    const section = comidaCorrida().sections[3];
    const groups = groupItems(section?.items ?? []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dish.id).toBe("comida-corrida");
    expect(groups[0]?.choices.map((choice) => choice.id)).toEqual([
      "guisado-mole",
      "guisado-chicharron",
      "guisado-bistec",
      "guisado-chiles",
    ]);
  });

  it("an item with no choiceOf is its own group with no choices", () => {
    expect(groupItems([item("cafe")])).toEqual([
      { dish: item("cafe"), choices: [] },
    ]);
  });

  it("counts the dish once, not once per guisado (no cuentan doble)", () => {
    const section = comidaCorrida().sections[3] ?? {
      id: "",
      name: null,
      items: [],
    };
    // 1 dish, available (its own status; a sold-out guisado doesn't flip
    // it), and the sold-out chicharrón shows in «Agotados» (round 3).
    expect(countItems({ sections: [section] })).toEqual({
      all: 1,
      available: 1,
      sold_out: 1,
      hidden: 0,
      counted: 0,
    });
    expect(sectionSummary(section)).toBe("1 artículo · 1 guisado agotado");
  });

  it("«Agotados» brings the dish whose guisado ran out, with all of them", () => {
    const sections = filterSections(comidaCorrida().sections, "sold_out", "");
    const found = sections.find((section) => section.id === "menu-del-dia");
    expect(found?.items.map((entry) => entry.id)).toEqual([
      "comida-corrida",
      "guisado-mole",
      "guisado-chicharron",
      "guisado-bistec",
      "guisado-chiles",
    ]);
  });

  it("a search for a guisado's name surfaces the whole group, nested", () => {
    // «guacaMOLE» also matches "mole" as a substring — real, expected search
    // behavior, not part of what this test checks.
    const sections = filterSections(comidaCorrida().sections, "all", "mole");
    const found = sections.find((section) => section.id === "menu-del-dia");
    expect(found?.items.map((entry) => entry.id)).toEqual([
      "comida-corrida",
      "guisado-mole",
      "guisado-chicharron",
      "guisado-bistec",
      "guisado-chiles",
    ]);
    expect(sections.map((section) => section.id)).toEqual([
      "entradas",
      "menu-del-dia",
    ]);
  });

  it("a guisado changed while filtering keeps its whole group in view", () => {
    const sections = filterSections(
      comidaCorrida().sections,
      "sold_out",
      "",
      new Set(["guisado-mole"]),
    );
    const found = sections.find((section) => section.id === "menu-del-dia");
    expect(found?.items.map((entry) => entry.id)).toEqual([
      "comida-corrida",
      "guisado-mole",
      "guisado-chicharron",
      "guisado-bistec",
      "guisado-chiles",
    ]);
  });
});

// ---------------------------------------------------------------------------
// S1 (relevo 37): Rosa searched for «mole» before it existed and only got
// «Nada por aquí», with no way to add it from there.
// ---------------------------------------------------------------------------
describe("S1 — searching for something that is not there offers to add it", () => {
  it("offers «Agregarlo» with the exact term searched, when editable", () => {
    const counts = countItems(menu());
    expect(searchEmptyState(counts, "all", "mole", true)).toEqual({
      title: "No hay «mole»",
      message: null,
      offerToAdd: "mole",
    });
  });

  it("never offers to add without permission to edit the items", () => {
    const counts = countItems(menu());
    expect(
      searchEmptyState(counts, "all", "mole", false).offerToAdd,
    ).toBeNull();
  });

  it("keeps the softer message for a filter with no search", () => {
    const counts = countItems(menu());
    expect(searchEmptyState(counts, "sold_out", "", true)).toEqual({
      title: "Nada por aquí",
      message: "No hay artículos agotados.",
      offerToAdd: null,
    });
  });

  it("explains a page with nothing at all", () => {
    const empty = { all: 0, available: 0, sold_out: 0, hidden: 0, counted: 0 };
    expect(searchEmptyState(empty, "all", "", true).title).toBe(
      "Sin artículos",
    );
  });
});

describe("simplified after round 4 (owner, 2026-10-12)", () => {
  it("a short list has no search or filters; a long one does", () => {
    expect(showsListTools(1, "all", "")).toBe(false);
    expect(showsListTools(listToolsFrom - 1, "all", "")).toBe(false);
    expect(showsListTools(listToolsFrom, "all", "")).toBe(true);
  });

  it("keeps them while a search or a filter is on, so it can be cleared", () => {
    expect(showsListTools(3, "sold_out", "")).toBe(true);
    expect(showsListTools(3, "all", "mole")).toBe(true);
    expect(showsListTools(3, "all", "   ")).toBe(false);
  });

  it("shows photo boxes only when some item has a photo", () => {
    const plain = { sections: [{ id: "s", name: null, items: [item("a")] }] };
    const withPhoto = {
      sections: [
        {
          id: "s",
          name: null,
          items: [item("a"), { ...item("b"), imageAssetId: "asset-1" }],
        },
      ],
    };
    expect(hasItemPhotos(plain as never)).toBe(false);
    expect(hasItemPhotos(withPhoto as never)).toBe(true);
  });
});
