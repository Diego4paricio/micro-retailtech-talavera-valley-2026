import { describe, expect, it } from "vitest";
import {
  formatPrice,
  mergeSections,
  parsePastedList,
  parsePrice,
  rowPriceError,
} from "../src/features/onboarding/pasted-list.js";

describe("pasted-list, the pure «Pegar mi lista» reader (relevo 37 C5a)", () => {
  it("reads a price however it is written", () => {
    expect(parsePrice("$75")).toBe(75);
    expect(parsePrice("75,50")).toBe(75.5);
    expect(parsePrice("95 pesos")).toBe(95);
    expect(parsePrice("")).toBeUndefined();
    expect(rowPriceError({ id: "a", name: "x", price: "no es numero" })).toBe(
      true,
    );
    expect(formatPrice(18)).toBe("18");
    expect(formatPrice(18.5)).toBe("18.50");
  });

  it("reads Lucía's 10 coffee drinks in one paste, in the three ways owners write a price", () => {
    // Lucía (Café Grano Fino, relevo 37 §4 C5): 10 items, three price
    // styles mixed ("Concha 18", "Concha - $18", "Concha $18.50").
    const pasted = [
      "Café americano 28",
      "Café de olla - $25",
      "Capuchino $38.50",
      "Latte vainilla 42",
      "Moka - $45",
      "Espresso doble $32",
      "Té de manzanilla 22",
      "Chocolate caliente - $40",
      "Frappé de café $48.50",
      "Té chai 35",
    ].join("\n");
    const sections = parsePastedList(pasted, "catalog", "");
    expect(sections).toHaveLength(1);
    const rows = sections[0]?.rows ?? [];
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => [row.name, row.price])).toEqual([
      ["Café americano", "28"],
      ["Café de olla", "25"],
      ["Capuchino", "38.50"],
      ["Latte vainilla", "42"],
      ["Moka", "45"],
      ["Espresso doble", "32"],
      ["Té de manzanilla", "22"],
      ["Chocolate caliente", "40"],
      ["Frappé de café", "48.50"],
      ["Té chai", "35"],
    ]);
  });

  it("reads the three price styles on their own", () => {
    const sections = parsePastedList(
      "Concha 18\nConcha - $18\nConcha $18.50",
      "catalog",
      "",
    );
    expect(sections[0]?.rows.map((row) => row.price)).toEqual([
      "18",
      "18",
      "18.50",
    ]);
  });

  it("starts a new section on a Menú from an unpriced line", () => {
    const sections = parsePastedList(
      "Cafés:\nAmericano 28\nCapuchino 38\nTés\nManzanilla 22",
      "menu",
      "Menú",
    );
    expect(sections.map((section) => section.name)).toEqual(["Cafés", "Tés"]);
    expect(sections[0]?.rows).toHaveLength(2);
    expect(sections[1]?.rows).toHaveLength(1);
  });

  it("adds pasted rows to what is already on screen, merging by section name", () => {
    const merged = mergeSections(
      [{ id: "s", name: "", rows: [{ id: "a", name: "Latte", price: "40" }] }],
      [
        {
          id: "t",
          name: "",
          rows: [{ id: "b", name: "Espresso", price: "30" }],
        },
      ],
    );
    expect(merged[0]?.rows.map((row) => row.name)).toEqual([
      "Latte",
      "Espresso",
      "",
    ]);
  });
});
