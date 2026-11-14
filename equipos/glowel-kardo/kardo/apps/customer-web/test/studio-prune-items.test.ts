import type { ExperienceContent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { pruneEmptyItems } from "../src/features/studio/model/prune-items.js";

function menuContent(
  items: { id: string; name: string; price?: number }[],
): ExperienceContent {
  return {
    title: "Menú",
    currency: "MXN",
    sections: [{ id: "s1", name: "Sección 1", items }],
  } as unknown as ExperienceContent;
}

function catalogContent(
  items: { id: string; name: string; price?: number }[],
): ExperienceContent {
  return {
    title: "Catálogo",
    currency: "MXN",
    items,
  } as unknown as ExperienceContent;
}

describe("pruneEmptyItems (relevo 37, C5c)", () => {
  it("removes a trailing empty menu item (no name, no price)", () => {
    const content = menuContent([
      { id: "a", name: "Tacos", price: 20 },
      { id: "b", name: "" },
    ]);
    const result = pruneEmptyItems("menu", content);
    expect(result.removed).toBe(1);
    const sections = (result.content as { sections: { items: unknown[] }[] })
      .sections;
    const items = sections[0]?.items ?? [];
    expect(items).toHaveLength(1);
    expect((items[0] as { id: string }).id).toBe("a");
  });

  it("keeps an item that has a price but no name (a real, unnamed product)", () => {
    const content = menuContent([{ id: "a", name: "", price: 45 }]);
    const result = pruneEmptyItems("menu", content);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(content);
  });

  it("never empties a section below its required one item", () => {
    const content = menuContent([{ id: "a", name: "" }]);
    const result = pruneEmptyItems("menu", content);
    expect(result.removed).toBe(0);
    const sections = (result.content as { sections: { items: unknown[] }[] })
      .sections;
    expect(sections[0]?.items).toHaveLength(1);
  });

  it("removes several empty catalog items at once", () => {
    const content = catalogContent([
      { id: "a", name: "Playera", price: 199 },
      { id: "b", name: "" },
      { id: "c", name: "" },
    ]);
    const result = pruneEmptyItems("catalog", content);
    expect(result.removed).toBe(2);
    const items = (result.content as { items: { id: string }[] }).items;
    expect(items.map((item) => item.id)).toEqual(["a"]);
  });

  it("does nothing for a type with no products (e.g. a form)", () => {
    const content = { title: "x" } as unknown as ExperienceContent;
    const result = pruneEmptyItems("form", content);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(content);
  });

  it("does nothing when there is nothing empty to remove", () => {
    const content = menuContent([{ id: "a", name: "Tacos", price: 20 }]);
    const result = pruneEmptyItems("menu", content);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(content);
  });
});
