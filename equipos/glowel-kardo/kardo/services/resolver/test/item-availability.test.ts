import { describe, expect, it } from "vitest";
import {
  applyCatalogAvailability,
  applyMenuAvailability,
  type ItemAvailabilityOverlay,
  MAX_ITEM_AVAILABILITY_ITEMS,
  parseItemAvailabilityCommand,
} from "../src/item-availability.js";
import type { ExperiencePayload } from "../src/snapshot.js";

const menuExperience: Extract<ExperiencePayload, { type: "menu" }> = {
  type: "menu",
  title: "Carta",
  description: "Nuestra selección",
  currency: "MXN",
  sections: [
    {
      id: "s1",
      name: "Bebidas",
      items: [
        { id: "i1", name: "Café", price: 45 },
        { id: "i2", name: "Té", price: 30 },
      ],
    },
    {
      id: "s2",
      name: "Postres",
      items: [{ id: "i3", name: "Pastel", price: 60 }],
    },
  ],
};

const catalogExperience: Extract<ExperiencePayload, { type: "catalog" }> = {
  type: "catalog",
  title: "Productos",
  currency: "MXN",
  items: [
    { id: "p1", name: "Vela", price: 199 },
    { id: "p2", name: "Jabón", price: 89 },
  ],
};

describe("applyMenuAvailability", () => {
  // «Menú del día» (relevo 37, D1).
  const corrida: Extract<ExperiencePayload, { type: "menu" }> = {
    type: "menu",
    title: "Doña Rosa",
    currency: "MXN",
    sections: [
      {
        id: "s1",
        name: "Comida corrida",
        items: [
          {
            id: "corrida",
            name: "Comida corrida",
            price: 90,
            choicesLabel: "Elige tu guisado",
            choices: [
              { id: "mole", name: "Mole" },
              { id: "chicharron", name: "Chicharrón" },
              { id: "pollo", name: "Pollo" },
            ],
          },
        ],
      },
    ],
  };

  it("sells out one choice and hides another, keeping the dish", () => {
    const data = applyMenuAvailability(corrida, {
      mole: { status: "sold_out", quantity: null },
      pollo: { status: "hidden", quantity: null },
    });
    expect(data.sections[0]?.items[0]).toEqual({
      id: "corrida",
      name: "Comida corrida",
      price: 90,
      choicesLabel: "Elige tu guisado",
      choices: [
        { id: "mole", name: "Mole", soldOut: true },
        { id: "chicharron", name: "Chicharrón" },
      ],
    });
  });

  it("sells out the dish when no choice is left", () => {
    const data = applyMenuAvailability(corrida, {
      mole: { status: "sold_out", quantity: null },
      chicharron: { status: "sold_out", quantity: 0 },
      pollo: { status: "hidden", quantity: null },
    });
    expect(data.sections[0]?.items[0]?.availability).toEqual({
      soldOut: true,
      remaining: null,
    });
  });

  it("returns the experience unchanged (no availability annotations) for an empty overlay", () => {
    const data = applyMenuAvailability(menuExperience, {});
    expect(data.sections).toEqual([
      {
        id: "s1",
        name: "Bebidas",
        items: [
          { id: "i1", name: "Café", price: 45 },
          { id: "i2", name: "Té", price: 30 },
        ],
      },
      {
        id: "s2",
        name: "Postres",
        items: [{ id: "i3", name: "Pastel", price: 60 }],
      },
    ]);
  });

  it("omits a hidden item and drops a section left with no items", () => {
    const overlay: ItemAvailabilityOverlay = {
      i1: { status: "hidden", quantity: null },
      i2: { status: "hidden", quantity: null },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    expect(data.sections.map((section) => section.id)).toEqual(["s2"]);
  });

  it("returns an empty sections array when every item across every section is hidden", () => {
    const overlay: ItemAvailabilityOverlay = {
      i1: { status: "hidden", quantity: null },
      i2: { status: "hidden", quantity: null },
      i3: { status: "hidden", quantity: null },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    expect(data.sections).toEqual([]);
    // Title/description survive so the caller can still render them.
    expect(data.title).toBe("Carta");
    expect(data.description).toBe("Nuestra selección");
  });

  it("marks status sold_out as soldOut with no remaining count", () => {
    const overlay: ItemAvailabilityOverlay = {
      i1: { status: "sold_out", quantity: null },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    const item = data.sections[0]?.items.find((entry) => entry.id === "i1");
    expect(item?.availability).toEqual({ soldOut: true, remaining: null });
  });

  it("treats quantity 0 as sold out even when status is 'available'", () => {
    const overlay: ItemAvailabilityOverlay = {
      i1: { status: "available", quantity: 0 },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    const item = data.sections[0]?.items.find((entry) => entry.id === "i1");
    expect(item?.availability).toEqual({ soldOut: true, remaining: null });
  });

  it("reports a positive quantity as `remaining` when not sold out", () => {
    const overlay: ItemAvailabilityOverlay = {
      i1: { status: "available", quantity: 1 },
      i2: { status: "available", quantity: 3 },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    const items = data.sections[0]?.items ?? [];
    expect(items.find((item) => item.id === "i1")?.availability).toEqual({
      soldOut: false,
      remaining: 1,
    });
    expect(items.find((item) => item.id === "i2")?.availability).toEqual({
      soldOut: false,
      remaining: 3,
    });
  });

  it("ignores an overlay entry for an id that has no matching item", () => {
    const overlay: ItemAvailabilityOverlay = {
      "does-not-exist": { status: "hidden", quantity: null },
    };
    const data = applyMenuAvailability(menuExperience, overlay);
    expect(
      data.sections.flatMap((section) => section.items.map((item) => item.id)),
    ).toEqual(["i1", "i2", "i3"]);
  });

  it("leaves an item with no overlay entry with no `availability` field at all", () => {
    const data = applyMenuAvailability(menuExperience, {
      i1: { status: "sold_out", quantity: null },
    });
    const untouched = data.sections[0]?.items.find((item) => item.id === "i2");
    expect(untouched).toEqual({ id: "i2", name: "Té", price: 30 });
    expect(untouched).not.toHaveProperty("availability");
  });
});

describe("applyCatalogAvailability", () => {
  it("omits a hidden item, leaving the rest untouched", () => {
    const data = applyCatalogAvailability(catalogExperience, {
      p1: { status: "hidden", quantity: null },
    });
    expect(data.items).toEqual([{ id: "p2", name: "Jabón", price: 89 }]);
  });

  it("returns an empty items array when every item is hidden", () => {
    const data = applyCatalogAvailability(catalogExperience, {
      p1: { status: "hidden", quantity: null },
      p2: { status: "hidden", quantity: null },
    });
    expect(data.items).toEqual([]);
    expect(data.title).toBe("Productos");
  });

  it("shows Queda 1 vs Quedan N as a `remaining` count (formatting itself is render.ts's job)", () => {
    const data = applyCatalogAvailability(catalogExperience, {
      p1: { status: "available", quantity: 1 },
      p2: { status: "available", quantity: 12 },
    });
    expect(
      data.items.find((item) => item.id === "p1")?.availability?.remaining,
    ).toBe(1);
    expect(
      data.items.find((item) => item.id === "p2")?.availability?.remaining,
    ).toBe(12);
  });
});

describe("parseItemAvailabilityCommand", () => {
  const experienceId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
  const validBody = () => ({
    experienceId,
    version: 1,
    items: [{ id: "i1", status: "sold_out", quantity: null }],
  });

  it("accepts a well-formed command", () => {
    expect(parseItemAvailabilityCommand(validBody())).toEqual({
      experienceId,
      version: 1,
      items: [{ id: "i1", status: "sold_out", quantity: null }],
    });
  });

  it("defaults a missing quantity to null", () => {
    const command = parseItemAvailabilityCommand({
      experienceId,
      version: 1,
      items: [{ id: "i1", status: "available" }],
    });
    expect(command?.items).toEqual([
      { id: "i1", status: "available", quantity: null },
    ]);
  });

  it("accepts an explicit null quantity and a positive integer quantity", () => {
    expect(
      parseItemAvailabilityCommand({
        experienceId,
        version: 1,
        items: [
          { id: "i1", status: "available", quantity: null },
          { id: "i2", status: "available", quantity: 9_999 },
        ],
      }),
    ).not.toBeNull();
  });

  it.each([
    "not-a-uuid",
    "9F7A4DC0-0BB7-450E-91C6-342045D779E9", // uppercase is not canonical
    "9f7a4dc0-0bb7-450e-91c6-342045d779e", // too short
  ])("rejects a malformed experienceId (%s)", (bad) => {
    expect(
      parseItemAvailabilityCommand({ ...validBody(), experienceId: bad }),
    ).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects an invalid version (%s)",
    (version) => {
      expect(
        parseItemAvailabilityCommand({ ...validBody(), version }),
      ).toBeNull();
    },
  );

  it("accepts Number.MAX_SAFE_INTEGER as a version", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        version: Number.MAX_SAFE_INTEGER,
      }),
    ).not.toBeNull();
  });

  it("accepts an empty items array (everything back to available)", () => {
    expect(parseItemAvailabilityCommand({ ...validBody(), items: [] })).toEqual(
      { ...validBody(), items: [] },
    );
  });

  it("rejects more than the max allowed items", () => {
    const tooMany = Array.from(
      { length: MAX_ITEM_AVAILABILITY_ITEMS + 1 },
      (_, index) => ({ id: `i${index}`, status: "available", quantity: null }),
    );
    expect(
      parseItemAvailabilityCommand({ ...validBody(), items: tooMany }),
    ).toBeNull();
  });

  it("accepts exactly the max allowed items", () => {
    const items = Array.from(
      { length: MAX_ITEM_AVAILABILITY_ITEMS },
      (_, index) => ({
        id: `i${index}`,
        status: "available",
        quantity: null,
      }),
    );
    expect(
      parseItemAvailabilityCommand({ ...validBody(), items }),
    ).not.toBeNull();
  });

  it("rejects an invalid status", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "closed", quantity: null }],
      }),
    ).toBeNull();
  });

  it("rejects a quantity of 10000 (over ITEM_QUANTITY_MAX) but accepts 9999", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: 10_000 }],
      }),
    ).toBeNull();
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: 9_999 }],
      }),
    ).not.toBeNull();
  });

  it("rejects a negative or non-integer quantity", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: -1 }],
      }),
    ).toBeNull();
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: 1.5 }],
      }),
    ).toBeNull();
  });

  it("rejects a duplicate item id", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [
          { id: "i1", status: "available", quantity: null },
          { id: "i1", status: "hidden", quantity: null },
        ],
      }),
    ).toBeNull();
  });

  it("rejects an item id that does not match the id pattern", () => {
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "not an id!", status: "available", quantity: null }],
      }),
    ).toBeNull();
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "a".repeat(65), status: "available", quantity: null }],
      }),
    ).toBeNull();
  });

  it("rejects an unknown top-level key and an unknown item key", () => {
    expect(
      parseItemAvailabilityCommand({ ...validBody(), unexpected: true }),
    ).toBeNull();
    expect(
      parseItemAvailabilityCommand({
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: null, note: "x" }],
      }),
    ).toBeNull();
  });

  it("rejects a non-object body, a string body, and null", () => {
    expect(parseItemAvailabilityCommand("not an object")).toBeNull();
    expect(parseItemAvailabilityCommand(null)).toBeNull();
    expect(parseItemAvailabilityCommand([validBody()])).toBeNull();
  });
});
