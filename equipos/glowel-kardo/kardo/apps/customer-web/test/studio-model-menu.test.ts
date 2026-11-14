import {
  DESIGN_LIMITS,
  designBlocks,
  type ExperienceContent,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  alignItems,
  distributeItems,
  fillsItem,
} from "../src/features/studio/model/canvas-items.js";
import { contentItemIds } from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import { splitMenuBlocker } from "../src/features/studio/model/limits.js";
import {
  insertBlock,
  splitMenuBlock,
} from "../src/features/studio/model/operations.js";

/**
 * "Partir el menú" (addendum 3): a `menu` block that shows several sections
 * can be split into two, so a title, an image or another section can go
 * between the parts. Also covers the canvas multi-select geometry helpers
 * (`alignItems`/`distributeItems`) and that `imageMain` fills its box on a
 * canvas like `image` does.
 */

const menuContent: ExperienceContent = {
  title: "Menú",
  currency: "MXN",
  sections: [
    { id: "sec-a", name: "Entradas", items: [{ id: "i1", name: "Uno" }] },
    { id: "sec-b", name: "Fuertes", items: [{ id: "i2", name: "Dos" }] },
    { id: "sec-c", name: "Postres", items: [{ id: "i3", name: "Tres" }] },
  ],
};
const contentIds = contentItemIds(menuContent);
const menuSectionIds = ["sec-a", "sec-b", "sec-c"];

describe("splitMenuBlock", () => {
  it("cannot split a menu block that already shows one section", () => {
    const design = designFromContent("menu", menuContent);
    const menuBlockId =
      designBlocks(design).find((b) => b.kind === "menu")?.id ?? "";
    expect(
      splitMenuBlocker(design, menuBlockId, [menuSectionIds[0] ?? ""]),
    ).toMatch(/una sola sección/);
  });

  it("splits a menu block showing every section into two, halving the sections", () => {
    const design = designFromContent("menu", menuContent);
    const menuBlockId =
      designBlocks(design).find((b) => b.kind === "menu")?.id ?? "";
    expect(splitMenuBlocker(design, menuBlockId, menuSectionIds)).toBeNull();
    const newId = createIdFactory([...contentIds, menuBlockId]);
    const result = splitMenuBlock(design, menuBlockId, menuSectionIds, newId);
    expect(result).not.toBeNull();
    const menus = designBlocks(result?.design ?? design).filter(
      (b) => b.kind === "menu",
    );
    expect(menus).toHaveLength(2);
    expect(menus[0]?.kind === "menu" ? menus[0].sectionIds : null).toEqual([
      "sec-a",
      "sec-b",
    ]);
    expect(menus[1]?.kind === "menu" ? menus[1].sectionIds : null).toEqual([
      "sec-c",
    ]);
    expect(result?.id).toBe(menus[1]?.id);
  });

  it("blocks splitting once the page already has the maximum menu blocks", () => {
    let design = designFromContent("menu", menuContent);
    const sectionId = design.sections[0]?.id ?? "";
    const newId = createIdFactory([...contentIds]);
    const menuBlockId =
      designBlocks(design).find((b) => b.kind === "menu")?.id ?? "";
    design = insertBlock(
      design,
      {
        id: menuBlockId,
        kind: "menu",
        layout: "list",
        photos: "none",
        sectionIds: menuSectionIds,
      },
      { sectionId, columnIndex: 0, index: 0 },
    );
    for (let index = 1; index < DESIGN_LIMITS.menuBlocks; index += 1)
      design = insertBlock(
        design,
        { id: newId("b"), kind: "menu", layout: "list", photos: "none" },
        { sectionId, columnIndex: 0, index: 0 },
      );
    expect(splitMenuBlocker(design, menuBlockId, menuSectionIds)).toMatch(
      new RegExp(`${DESIGN_LIMITS.menuBlocks} bloques de menú`),
    );
  });
});

describe("canvas multi-select geometry", () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const items = [
    {
      block: { id: "a", kind: "shape", shape: "rect", fill: "accent" } as const,
      ...box(0, 0, 40, 40),
    },
    {
      block: { id: "b", kind: "shape", shape: "rect", fill: "accent" } as const,
      ...box(100, 10, 40, 60),
    },
    {
      block: { id: "c", kind: "shape", shape: "rect", fill: "accent" } as const,
      ...box(200, 30, 40, 20),
    },
  ];

  it("aligns several items to their shared left edge", () => {
    const aligned = alignItems(items, ["a", "b", "c"], "left");
    for (const item of aligned) expect(item.x).toBe(0);
  });

  it("centers several items vertically on their shared middle", () => {
    const aligned = alignItems(items, ["a", "b"], "center-v");
    const a = aligned.find((i) => i.block.id === "a");
    const b = aligned.find((i) => i.block.id === "b");
    // a: h 40 at y0; b: h 60 at y10 -> bounds 0..70, center 35
    expect(a?.y).toBe(35 - 20);
    expect(b?.y).toBe(35 - 30);
  });

  it("distributes three or more items with equal gaps", () => {
    const spread = distributeItems(items, ["a", "b", "c"], "horizontal");
    const byId = Object.fromEntries(spread.map((i) => [i.block.id, i]));
    // First and last keep their edges; the middle one gets an equal gap.
    expect(byId.a?.x).toBe(0);
    expect(byId.c?.x).toBe(200);
    const gapBefore = (byId.b?.x ?? 0) - ((byId.a?.x ?? 0) + (byId.a?.w ?? 0));
    const gapAfter = (byId.c?.x ?? 0) - ((byId.b?.x ?? 0) + (byId.b?.w ?? 0));
    expect(Math.round(gapBefore)).toBe(Math.round(gapAfter));
  });

  it("leaves fewer than the minimum items untouched", () => {
    expect(alignItems(items, ["a"], "left")).toEqual(items);
    expect(distributeItems(items, ["a", "b"], "horizontal")).toEqual(items);
  });
});

describe("fillsItem", () => {
  it("fills its box like image for imageMain and shape, but not for growing blocks", () => {
    expect(fillsItem("image")).toBe(true);
    expect(fillsItem("imageMain")).toBe(true);
    expect(fillsItem("shape")).toBe(true);
    expect(fillsItem("heading")).toBe(false);
    expect(fillsItem("html")).toBe(false);
  });
});
