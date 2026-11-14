import {
  type CanvasSection,
  checkDesign,
  DESIGN_LIMITS,
  type DesignBlock,
  type DesignSection,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  createBlock,
  createBrandCircleRow,
} from "../src/features/studio/model/blocks.js";
import {
  addBlockToCanvas,
  addBrandCircleRowToCanvas,
  addCanvasSection,
  alignCanvasItem,
  alignCanvasItems,
  blankCanvasDesign,
  boundsOf,
  canvasLayerOf,
  canvasSelection,
  convertToCanvas,
  copyCanvasItems,
  deleteCanvasItem,
  distributeCanvasItems,
  duplicateCanvasItems,
  moveCanvasItem,
  moveCanvasItems,
  moveCanvasItemToSection,
  moveCanvasLayer,
  normalizeRotation,
  nudgeCanvasItem,
  pasteCanvasItems,
  placeBrandCircleRow,
  removeCanvasItems,
  resizeCanvasItem,
  rotateCanvasItem,
  rotationFromPointer,
  setBrandButtonLook,
  setCanvasHeight,
  setCanvasItemLayer,
  setCanvasItemsFlag,
  snapRotation,
} from "../src/features/studio/model/canvas.js";
import {
  BRAND_CIRCLE_SIZE,
  squareCanvasItem,
  stackOrder,
  unsquareCanvasItem,
} from "../src/features/studio/model/canvas-items.js";
import {
  createIdFactory,
  designIds,
} from "../src/features/studio/model/ids.js";
import {
  addBlockBlocker,
  addCanvasSectionBlocker,
  convertToCanvasBlocker,
  duplicateSectionBlocker,
  moveToSectionBlocker,
} from "../src/features/studio/model/limits.js";
import {
  duplicateBlock,
  duplicateSection,
  insertBlock,
  locateBlock,
  moveBlock,
  moveBlockStep,
  moveBlockToSection,
  removeBlock,
  removeSection,
  updateBlock,
} from "../src/features/studio/model/operations.js";
import { prepareDesign } from "../src/features/studio/model/prepare.js";
import { adaptTemplateDesign } from "../src/features/studio/model/templates.js";
import { validateDesign } from "../src/features/studio/model/validate.js";

const heading = (id: string): DesignBlock => ({
  id,
  kind: "heading",
  text: id,
  level: 2,
});

const style: PageDesign["style"] = {
  palette: {
    background: "#f7f5f0",
    surface: "#fffdf8",
    text: "#16232e",
    muted: "#52646d",
    accent: "#0a6c78",
  },
  fonts: { heading: "geist", body: "dm-sans" },
  radius: 16,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  background: { kind: "none" },
  maxWidth: 560,
};

const flow = (id: string, blocks: DesignBlock[]): DesignSection => ({
  id,
  layout: "1",
  columns: [blocks],
  paddingTop: 32,
  paddingBottom: 32,
  gap: 16,
  align: "start",
});

/** A links page: a flow section with the content, then a canvas. */
function sample(): PageDesign {
  return {
    schema: 2,
    style,
    sections: [
      flow("s1", [
        { id: "title", kind: "contentTitle" },
        { id: "links", kind: "contentLinks", layout: "list" },
        heading("a"),
      ]),
      {
        id: "c1",
        kind: "canvas",
        height: 400,
        items: [
          { block: heading("h1"), x: 24, y: 40, w: 342 },
          {
            block: {
              id: "img",
              kind: "image",
              imageRef: "",
              alt: "",
              aspect: "1:1",
              fit: "cover",
            },
            x: 100,
            y: 120,
            w: 200,
            h: 200,
            z: 1,
          },
        ],
      },
    ],
  };
}

const canvasOf = (design: PageDesign, id = "c1"): CanvasSection => {
  const section = design.sections.find((item) => item.id === id);
  if (!section || !isCanvasSection(section)) throw new Error("no canvas");
  return section;
};
const itemOf = (design: PageDesign, blockId: string) =>
  canvasOf(design).items.find((item) => item.block.id === blockId);

describe("canvas sections in the design operations", () => {
  it("finds blocks placed on a canvas", () => {
    const at = locateBlock(sample(), "img");
    expect(at?.on).toBe("canvas");
    expect(at?.section.id).toBe("c1");
    expect(at?.on === "canvas" ? at.item.w : null).toBe(200);
    expect(designIds(sample())).toEqual([
      "s1",
      "title",
      "links",
      "a",
      "c1",
      "h1",
      "img",
    ]);
  });

  it("edits, removes and duplicates canvas blocks without mutating", () => {
    const design = sample();
    const frozen = JSON.stringify(design);
    const renamed = updateBlock(design, "h1", (block) =>
      block.kind === "heading" ? { ...block, text: "Hola" } : block,
    );
    expect(itemOf(renamed, "h1")?.block).toMatchObject({ text: "Hola" });
    expect(itemOf(removeBlock(design, "img"), "img")).toBeUndefined();

    const copy = duplicateBlock(
      design,
      "img",
      createIdFactory([], () => "x"),
    );
    expect(copy?.id).toBe("b-x");
    const placed = copy ? itemOf(copy.design, "b-x") : undefined;
    expect(placed).toMatchObject({ x: 116, y: 136, w: 200, h: 200 });
    // The copy is drawn on top.
    expect(copy && stackOrder(canvasOf(copy.design).items).at(-1)).toBe("b-x");
    expect(JSON.stringify(design)).toBe(frozen);
  });

  it("duplicates a canvas section with new ids and the same places", () => {
    let counter = 0;
    const result = duplicateSection(
      sample(),
      "c1",
      createIdFactory([], () => `n${++counter}`),
    );
    const copy = result ? canvasOf(result.design, result.id) : null;
    expect(copy?.items.map((item) => [item.x, item.y])).toEqual([
      [24, 40],
      [100, 120],
    ]);
    expect(copy?.items.some((item) => item.block.id === "img")).toBe(false);
  });

  it("keeps the schema at 2 only while the page has a canvas", () => {
    const flowOnly = removeSection(sample(), "c1");
    expect(flowOnly.schema).toBe(1);
    const again = addCanvasSection(
      flowOnly,
      createIdFactory([], () => "k"),
    );
    expect(again.design.schema).toBe(2);
    expect(canvasOf(again.design, again.id)).toMatchObject({
      height: 640,
      items: [],
    });
    expect(prepareDesign({ ...sample(), schema: 1 }).schema).toBe(2);
  });

  it("moves blocks between flow and canvas sections when the kind fits", () => {
    const toCanvas = moveBlockToSection(sample(), "a", "c1");
    expect(itemOf(toCanvas, "a")).toMatchObject({ w: 342 });
    expect(locateBlock(toCanvas, "a")?.on).toBe("canvas");
    // Links grow with every link: they never leave the flow.
    expect(moveBlockToSection(sample(), "links", "c1")).toEqual(sample());
    expect(moveToSectionBlocker(sample(), "links", "links", "c1")).toMatch(
      /sección normal/,
    );
    const toFlow = moveBlock(sample(), "img", {
      sectionId: "s1",
      columnIndex: 0,
      index: 0,
    });
    expect(locateBlock(toFlow, "img")).toMatchObject({
      on: "flow",
      blockIndex: 0,
    });
    // Keyboard steps skip canvases and never move canvas blocks.
    expect(moveBlockStep(sample(), "h1", 1)).toEqual(sample());
  });

  it("refuses shapes in flow sections and places them on canvases", () => {
    const shape = createBlock(
      "shape",
      createIdFactory([], () => "sh"),
    );
    expect(
      insertBlock(sample(), shape, {
        sectionId: "s1",
        columnIndex: 0,
        index: 0,
      }),
    ).toEqual(sample());
    expect(
      addBlockBlocker(sample(), "links", "shape", {
        sectionId: "s1",
        columnIndex: 0,
      }),
    ).toBe("Las figuras solo van en una sección de espacio libre.");
    const placed = addBlockToCanvas(sample(), "c1", shape);
    // 120 x 120, centered on a 390 x 400 canvas, on top.
    expect(itemOf(placed, "b-sh")).toMatchObject({
      x: 135,
      y: 140,
      w: 120,
      h: 120,
      z: 2,
    });
    expect(
      addBlockBlocker(sample(), "links", "spacer", {
        sectionId: "c1",
        columnIndex: 0,
      }),
    ).toMatch(/espacio libre/);
  });

  it("gives new blocks a size by kind and cascades repeated drops", () => {
    const newId = createIdFactory([], () =>
      Math.random().toString(36).slice(2, 8),
    );
    let design = sample();
    const text = createBlock("text", newId);
    design = addBlockToCanvas(design, "c1", text, { x: 195, y: 200 });
    expect(itemOf(design, text.id)).toMatchObject({ x: 24, y: 164, w: 342 });
    const again = createBlock("text", newId);
    design = addBlockToCanvas(design, "c1", again, { x: 195, y: 200 });
    expect(itemOf(design, again.id)).toMatchObject({ x: 40, y: 180 });
    const image = createBlock("image", newId);
    design = addBlockToCanvas(design, "c1", image, { x: 0, y: 0 });
    // Pulled back so a piece stays on the canvas; 200 x 200.
    expect(itemOf(design, image.id)).toMatchObject({
      x: -100,
      y: -100,
      w: 200,
      h: 200,
    });
  });
});

describe("canvas placement", () => {
  it("moves, nudges and clamps so a piece of the block stays visible", () => {
    const moved = moveCanvasItem(sample(), "img", 10.4, 20.6);
    expect(itemOf(moved, "img")).toMatchObject({ x: 10, y: 21 });
    const far = moveCanvasItem(sample(), "img", 5_000, 5_000);
    expect(itemOf(far, "img")).toMatchObject({ x: 382, y: 392 });
    const out = moveCanvasItem(sample(), "img", -900, -900);
    expect(itemOf(out, "img")).toMatchObject({ x: -192, y: -192 });
    expect(itemOf(nudgeCanvasItem(sample(), "h1", -10, 1), "h1")).toMatchObject(
      { x: 14, y: 41 },
    );
    expect(moveCanvasItem(sample(), "a", 0, 0)).toEqual(sample());
    const design = sample();
    expect(moveCanvasItem(design, "h1", 24, 40)).toBe(design);
  });

  it("resizes images both ways and text-like blocks only in width", () => {
    const image = resizeCanvasItem(sample(), "img", { w: 150, h: 90, x: 120 });
    expect(itemOf(image, "img")).toMatchObject({ x: 120, w: 150, h: 90 });
    const text = resizeCanvasItem(sample(), "h1", { w: 200, h: 300 });
    expect(itemOf(text, "h1")).toEqual({
      block: heading("h1"),
      x: 24,
      y: 40,
      w: 200,
    });
    expect(itemOf(resizeCanvasItem(sample(), "img", { w: 2 }), "img")?.w).toBe(
      8,
    );
  });

  it("aligns to the canvas edges and center, or to another box", () => {
    const at = (align: Parameters<typeof alignCanvasItem>[2]) =>
      itemOf(alignCanvasItem(sample(), "img", align), "img");
    expect(at("left")).toMatchObject({ x: 0 });
    expect(at("center")).toMatchObject({ x: 95 });
    expect(at("right")).toMatchObject({ x: 190 });
    expect(at("top")).toMatchObject({ y: 0 });
    expect(at("middle")).toMatchObject({ y: 100 });
    expect(at("bottom")).toMatchObject({ y: 200 });
    // Text uses its measured height.
    const text = alignCanvasItem(sample(), "h1", "bottom", { height: 50 });
    expect(itemOf(text, "h1")).toMatchObject({ y: 350 });
    const next = alignCanvasItem(sample(), "h1", "left", {
      reference: { x: 100, y: 120, w: 200, h: 200 },
    });
    expect(itemOf(next, "h1")).toMatchObject({ x: 100 });
  });

  it("orders layers: forward, backward, to the front and to the back", () => {
    const withShape = addBlockToCanvas(
      sample(),
      "c1",
      createBlock(
        "shape",
        createIdFactory([], () => "s"),
      ),
    );
    const order = (design: PageDesign) => stackOrder(canvasOf(design).items);
    expect(order(withShape)).toEqual(["h1", "img", "b-s"]);
    expect(order(moveCanvasLayer(withShape, "b-s", "back"))).toEqual([
      "b-s",
      "h1",
      "img",
    ]);
    expect(order(moveCanvasLayer(withShape, "h1", "front"))).toEqual([
      "img",
      "b-s",
      "h1",
    ]);
    expect(order(moveCanvasLayer(withShape, "img", "forward"))).toEqual([
      "h1",
      "b-s",
      "img",
    ]);
    expect(order(moveCanvasLayer(withShape, "img", "backward"))).toEqual([
      "img",
      "h1",
      "b-s",
    ]);
    expect(moveCanvasLayer(withShape, "b-s", "front")).toBe(withShape);
    expect(canvasLayerOf(withShape, "img")).toEqual({ position: 1, count: 3 });
    const set = setCanvasItemLayer(withShape, "b-s", 0);
    expect(order(set)).toEqual(["b-s", "h1", "img"]);
    // The stack survives moving a block above another one.
    const moved = moveCanvasItem(set, "img", 24, 0);
    expect(order(moved)).toEqual(["b-s", "h1", "img"]);
  });

  it("sets the canvas height, never cutting a block off", () => {
    expect(canvasOf(setCanvasHeight(sample(), "c1", 900.2)).height).toBe(900);
    expect(canvasOf(setCanvasHeight(sample(), "c1", 50)).height).toBe(128);
    expect(canvasOf(setCanvasHeight(sample(), "c1", 99_999)).height).toBe(
      3_000,
    );
  });

  it("deletes only canvas blocks", () => {
    expect(itemOf(deleteCanvasItem(sample(), "img"), "img")).toBeUndefined();
    expect(deleteCanvasItem(sample(), "a")).toEqual(sample());
  });
});

describe("Convertir en espacio libre", () => {
  const measured = {
    height: 300,
    blocks: {
      a: { x: 16, y: 32, w: 358, h: 40 },
      pic: { x: 16, y: 88, w: 358, h: 180 },
    },
  };
  const design = (): PageDesign => ({
    schema: 1,
    style,
    sections: [
      flow("s1", [
        { id: "title", kind: "contentTitle" },
        { id: "links", kind: "contentLinks", layout: "list" },
      ]),
      {
        ...flow("s2", [
          heading("a"),
          {
            id: "pic",
            kind: "image",
            imageRef: "3f2b8c1e-5d4a-4c3b-9a1e-7f6d5c4b3a21",
            alt: "",
            aspect: "4:3",
            fit: "cover",
          },
        ]),
        card: true,
      },
    ],
  });

  it("keeps each block where the phone showed it", () => {
    const result = convertToCanvas(design(), "links", "s2", measured);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.schema).toBe(2);
    const canvas = canvasOf(result.design, "s2");
    expect(canvas).toMatchObject({
      height: 300,
      background: { kind: "solid", color: "#fffdf8" },
    });
    expect(canvas.items).toEqual([
      { block: heading("a"), x: 16, y: 32, w: 358 },
      expect.objectContaining({ x: 16, y: 88, w: 358, h: 180, z: 1 }),
    ]);
    expect(checkDesign("links", result.design, [])).toEqual([]);
  });

  it("stacks blocks the preview did not draw below the rest", () => {
    const result = convertToCanvas(design(), "links", "s2", {
      height: 100,
      blocks: {},
    });
    if (!result.ok) throw new Error(result.reason);
    const canvas = canvasOf(result.design, "s2");
    expect(canvas.items.map((item) => item.y)).toEqual([16, 72]);
    expect(canvas.height).toBe(272);
  });

  it("refuses sections with links or spacers, with a reason", () => {
    const links = convertToCanvas(design(), "links", "s1", measured);
    expect(links).toEqual({
      ok: false,
      reason: expect.stringMatching(/^Mueve «Enlaces» a otra sección/),
    });
    const spaced = insertBlock(
      design(),
      { id: "sp", kind: "spacer", height: 20 },
      {
        sectionId: "s2",
        columnIndex: 0,
        index: 0,
      },
    );
    expect(convertToCanvasBlocker(spaced, "links", "s2")).toMatch(/espacios/);
    expect(convertToCanvasBlocker(sample(), "links", "c1")).toBe(
      "Ya es un espacio libre.",
    );
  });
});

describe("canvas limits, validation and templates", () => {
  it("caps canvas sections and their blocks", () => {
    let design = sample();
    const newId = createIdFactory([], () =>
      Math.random().toString(36).slice(2, 10),
    );
    // sample() already has one canvas ("c1"); top up to the limit.
    for (let index = 0; index < DESIGN_LIMITS.canvasSections - 1; index += 1)
      design = addCanvasSection(design, newId).design;
    expect(addCanvasSectionBlocker(design)).toBe(
      `Llegaste al máximo de ${DESIGN_LIMITS.canvasSections} secciones de espacio libre.`,
    );
    expect(duplicateSectionBlocker(design, "c1")).toBe(
      `Llegaste al máximo de ${DESIGN_LIMITS.canvasSections} secciones de espacio libre.`,
    );
    // sample()'s "c1" already has 2 items ("h1", "img"); top up to the limit.
    let full = sample();
    for (let index = 0; index < DESIGN_LIMITS.canvasItems - 2; index += 1)
      full = addBlockToCanvas(full, "c1", createBlock("divider", newId));
    expect(
      addBlockBlocker(full, "links", "heading", {
        sectionId: "c1",
        columnIndex: 0,
      }),
    ).toBe(`Este espacio libre ya tiene ${DESIGN_LIMITS.canvasItems} bloques.`);
  });

  it("explains canvas problems in Spanish, on the block", () => {
    const outside: PageDesign = {
      ...sample(),
      sections: sample().sections.map((section) =>
        isCanvasSection(section)
          ? {
              ...section,
              items: [{ block: heading("lost"), x: 0, y: 900, w: 100 }],
            }
          : section,
      ),
    };
    expect(validateDesign("links", outside, [])).toContainEqual(
      expect.objectContaining({
        area: "block",
        blockId: "lost",
        message:
          "Este bloque quedó fuera del espacio libre. Muévelo hacia adentro.",
      }),
    );
    const onCanvas: PageDesign = {
      ...sample(),
      sections: [
        flow("s1", [{ id: "title", kind: "contentTitle" }]),
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: { id: "links", kind: "contentLinks", layout: "list" },
              x: 0,
              y: 0,
              w: 390,
            },
          ],
        },
      ],
    };
    expect(validateDesign("links", onCanvas, [])).toContainEqual(
      expect.objectContaining({
        blockId: "links",
        message: "«Enlaces» no puede ir en un espacio libre.",
      }),
    );
  });

  it("asks for the brand button's link with the brand's name", () => {
    const block = createBlock(
      "brandButton",
      createIdFactory([], () => "wa"),
    );
    const design = addBlockToCanvas(sample(), "c1", block);
    const withoutImage = removeBlock(design, "img");
    expect(validateDesign("links", withoutImage, [])).toContainEqual(
      expect.objectContaining({
        blockId: "b-wa",
        message: expect.stringContaining("Falta tu número de WhatsApp"),
      }),
    );
    const prepared = prepareDesign(
      updateBlock(withoutImage, "b-wa", (current) =>
        current.kind === "brandButton"
          ? {
              ...current,
              label: " Escríbenos ",
              href: " https://wa.me/5215512345678 ",
            }
          : current,
      ),
    );
    expect(itemOf(prepared, "b-wa")?.block).toMatchObject({
      label: "Escríbenos",
      href: "https://wa.me/5215512345678",
    });
    expect(validateDesign("links", prepared, [])).toEqual([]);
  });

  it("applies templates keeping their canvas sections (addendum 3: a portada de espacio libre survives adaptTemplateDesign)", () => {
    const adapted = adaptTemplateDesign(sample(), "links", []);
    expect(adapted.schema).toBe(2);
    expect(
      adapted.sections.some((section) => isCanvasSection(section as never)),
    ).toBe(true);
    expect(adapted.sections).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multi-select: selection, group move, align and distribute
// ---------------------------------------------------------------------------

const rect = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<{
    z: number;
    r: number;
    locked: boolean;
    hidden: boolean;
  }> = {},
) => ({
  block: {
    id,
    kind: "shape" as const,
    shape: "rect" as const,
    fill: "accent" as const,
  },
  x,
  y,
  w,
  h,
  ...extra,
});

function multiCanvas(
  items: ReturnType<typeof rect>[],
  height = 640,
): PageDesign {
  return {
    schema: 2,
    style,
    sections: [{ id: "m1", kind: "canvas", height, items }],
  };
}

const multiItemOf = (design: PageDesign, blockId: string) =>
  canvasOf(design, "m1").items.find((item) => item.block.id === blockId);

describe("canvasSelection and boundsOf", () => {
  it("collects the items of blockIds on the canvas of the first one found", () => {
    const selection = canvasSelection(sample(), ["img", "a", "h1"]);
    expect(selection?.section.id).toBe("c1");
    // Reading order (top to bottom), not the order of blockIds.
    expect(selection?.items.map((item) => item.block.id)).toEqual([
      "h1",
      "img",
    ]);
    expect(canvasSelection(sample(), ["a"])).toBeNull();
    expect(canvasSelection(sample(), ["nope"])).toBeNull();
  });

  it("computes the bounding box of a set of boxes", () => {
    expect(
      boundsOf([
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 100, y: 20, w: 50, h: 50 },
        { x: 200, y: 40, w: 50, h: 50 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 250, h: 90 });
    expect(boundsOf([])).toBeNull();
  });
});

describe("moveCanvasItems", () => {
  it("moves a group by the same delta, keeping relative positions", () => {
    const moved = moveCanvasItems(sample(), ["h1", "img"], 10, 5);
    expect(itemOf(moved, "h1")).toMatchObject({ x: 34, y: 45 });
    expect(itemOf(moved, "img")).toMatchObject({ x: 110, y: 125 });
  });

  it("limits the whole group so every item stays within clampItem's bounds", () => {
    const moved = moveCanvasItems(sample(), ["h1", "img"], 1_000, 0);
    // img (w 200) reaches the right edge first: x <= 390 - 8 = 382.
    expect(itemOf(moved, "img")).toMatchObject({ x: 382 });
    expect(itemOf(moved, "h1")).toMatchObject({ x: 306 });
  });

  it("never moves a locked item, and excludes it from the group bound", () => {
    const design = { ...sample() };
    const locked = setCanvasItemsFlag(design, ["img"], "locked", true);
    const moved = moveCanvasItems(locked, ["h1", "img"], 10, 5);
    expect(itemOf(moved, "h1")).toMatchObject({ x: 34, y: 45 });
    expect(itemOf(moved, "img")).toMatchObject({ x: 100, y: 120 });
    // A selection made only of locked items never moves.
    expect(moveCanvasItems(locked, ["img"], 10, 5)).toBe(locked);
  });

  it("behaves like nudgeCanvasItem for a single item", () => {
    expect(moveCanvasItems(sample(), ["h1"], -10, 1)).toEqual(
      nudgeCanvasItem(sample(), "h1", -10, 1),
    );
  });

  it("ignores an unknown selection", () => {
    const design = sample();
    expect(moveCanvasItems(design, ["nope"], 10, 10)).toBe(design);
  });
});

describe("alignCanvasItems", () => {
  it("aligns a single item to its canvas, like alignCanvasItem", () => {
    expect(alignCanvasItems(sample(), ["img"], "left")).toEqual(
      alignCanvasItem(sample(), "img", "left"),
    );
  });

  it("aligns three items to their bounding box", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 100, 20, 50, 50),
      rect("c", 200, 40, 50, 50),
    ]);
    // Bounds: x 0..250, y 0..90.
    const centered = alignCanvasItems(design, ["a", "b", "c"], "center");
    for (const id of ["a", "b", "c"])
      expect(multiItemOf(centered, id)).toMatchObject({ x: 100 });
    const bottom = alignCanvasItems(design, ["a", "b", "c"], "bottom");
    for (const id of ["a", "b", "c"])
      expect(multiItemOf(bottom, id)).toMatchObject({ y: 40 });
  });

  it("counts a locked item for the bounds but never moves it", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 100, 20, 50, 50),
      rect("c", 200, 40, 50, 50, { locked: true }),
    ]);
    const left = alignCanvasItems(design, ["a", "b", "c"], "left");
    expect(multiItemOf(left, "a")).toMatchObject({ x: 0 });
    expect(multiItemOf(left, "b")).toMatchObject({ x: 0 });
    // c stayed put (locked), even though the bounds used its box.
    expect(multiItemOf(left, "c")).toMatchObject({ x: 200, y: 40 });
  });
});

describe("distributeCanvasItems", () => {
  it("spaces boxes evenly, keeping the first and last in place", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 80, 0, 50, 50),
      rect("c", 100, 0, 50, 50),
      rect("d", 300, 0, 50, 50),
    ]);
    const spread = distributeCanvasItems(
      design,
      ["a", "b", "c", "d"],
      "horizontal",
    );
    expect(multiItemOf(spread, "a")).toMatchObject({ x: 0 });
    expect(multiItemOf(spread, "b")).toMatchObject({ x: 100 });
    expect(multiItemOf(spread, "c")).toMatchObject({ x: 200 });
    expect(multiItemOf(spread, "d")).toMatchObject({ x: 300 });
  });

  it("spaces overlapping boxes by their centers when free space is negative", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 100, 100),
      rect("b", 50, 0, 100, 100),
      rect("c", 90, 0, 100, 100),
      rect("d", 120, 0, 100, 100),
    ]);
    const spread = distributeCanvasItems(
      design,
      ["a", "b", "c", "d"],
      "horizontal",
    );
    expect(multiItemOf(spread, "a")).toMatchObject({ x: 0 });
    expect(multiItemOf(spread, "b")).toMatchObject({ x: 40 });
    expect(multiItemOf(spread, "c")).toMatchObject({ x: 80 });
    expect(multiItemOf(spread, "d")).toMatchObject({ x: 120 });
  });

  it("leaves out locked items entirely", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 80, 0, 50, 50),
      rect("c", 250, 0, 50, 50, { locked: true }),
      rect("d", 300, 0, 50, 50),
    ]);
    const spread = distributeCanvasItems(
      design,
      ["a", "b", "c", "d"],
      "horizontal",
    );
    expect(multiItemOf(spread, "a")).toMatchObject({ x: 0 });
    expect(multiItemOf(spread, "b")).toMatchObject({ x: 150 });
    expect(multiItemOf(spread, "c")).toMatchObject({ x: 250 });
    expect(multiItemOf(spread, "d")).toMatchObject({ x: 300 });
  });

  it("distributes vertically too", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 0, 80, 50, 50),
      rect("c", 0, 100, 50, 50),
      rect("d", 0, 300, 50, 50),
    ]);
    const spread = distributeCanvasItems(
      design,
      ["a", "b", "c", "d"],
      "vertical",
    );
    expect(multiItemOf(spread, "b")).toMatchObject({ y: 100 });
    expect(multiItemOf(spread, "c")).toMatchObject({ y: 200 });
  });

  it("leaves the design unchanged with fewer than 3 unlocked items", () => {
    const design = multiCanvas([
      rect("a", 0, 0, 50, 50),
      rect("b", 80, 0, 50, 50),
      rect("c", 250, 0, 50, 50, { locked: true }),
    ]);
    expect(distributeCanvasItems(design, ["a", "b", "c"], "horizontal")).toBe(
      design,
    );
  });
});

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

describe("rotation", () => {
  it("normalizes any angle to a whole degree from -179 to 180", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(375.4)).toBe(15);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(181)).toBe(-179);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-190)).toBe(170);
  });

  it("snaps to the nearest multiple of the step, normalized", () => {
    expect(snapRotation(112)).toBe(105);
    expect(snapRotation(112, 10)).toBe(110);
    expect(snapRotation(-178)).toBe(180);
  });

  it("reads the angle from the pointer around the center", () => {
    const center = { x: 0, y: 0 };
    expect(rotationFromPointer(center, { x: 0, y: -100 })).toBeCloseTo(0, 5);
    expect(rotationFromPointer(center, { x: 100, y: 0 })).toBeCloseTo(90, 5);
    expect(rotationFromPointer(center, { x: 0, y: 100 })).toBeCloseTo(180, 5);
    expect(rotationFromPointer(center, { x: -100, y: 0 })).toBeCloseTo(-90, 5);
  });

  it("sets r on the item and 0 removes it; a locked item is not changed", () => {
    const rotated = rotateCanvasItem(sample(), "h1", 375);
    expect(itemOf(rotated, "h1")).toMatchObject({ r: 15 });
    const back = rotateCanvasItem(rotated, "h1", 0);
    expect(itemOf(back, "h1")?.r).toBeUndefined();
    const locked = setCanvasItemsFlag(sample(), ["img"], "locked", true);
    expect(rotateCanvasItem(locked, "img", 45)).toBe(locked);
  });
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

describe("setCanvasItemsFlag", () => {
  it("sets the flag on every item and removes it when value is false", () => {
    const hidden = setCanvasItemsFlag(sample(), ["h1", "img"], "hidden", true);
    expect(itemOf(hidden, "h1")).toMatchObject({ hidden: true });
    expect(itemOf(hidden, "img")).toMatchObject({ hidden: true });
    const shown = setCanvasItemsFlag(hidden, ["h1"], "hidden", false);
    expect(itemOf(shown, "h1")?.hidden).toBeUndefined();
    expect(itemOf(shown, "img")).toMatchObject({ hidden: true });
  });

  it("ignores ids that are not on a canvas", () => {
    const design = sample();
    expect(setCanvasItemsFlag(design, ["a"], "locked", true)).toBe(design);
  });
});

// ---------------------------------------------------------------------------
// Clipboard: copy, paste, duplicate, remove
// ---------------------------------------------------------------------------

describe("copyCanvasItems", () => {
  it("deep copies the selection in reading order", () => {
    const copies = copyCanvasItems(sample(), ["img", "h1"]);
    expect(copies).toEqual([itemOf(sample(), "h1"), itemOf(sample(), "img")]);
    expect(copies[0]).not.toBe(itemOf(sample(), "h1"));
  });

  it("returns an empty array when nothing is on a canvas", () => {
    expect(copyCanvasItems(sample(), ["a"])).toEqual([]);
  });
});

describe("pasteCanvasItems", () => {
  it("pastes new blocks offset and on top, in the given order", () => {
    let counter = 0;
    const newId = createIdFactory([], () => `p${++counter}`);
    const copies = copyCanvasItems(sample(), ["h1", "img"]);
    const result = pasteCanvasItems(sample(), "links", "c1", copies, newId);
    expect(result.ids).toEqual(["b-p1", "b-p2"]);
    expect(result.skipped).toBe(0);
    expect(result.reason).toBeNull();
    expect(itemOf(result.design, "b-p1")).toMatchObject({ x: 40, y: 56 });
    expect(itemOf(result.design, "b-p2")).toMatchObject({ x: 116, y: 136 });
    expect(stackOrder(canvasOf(result.design).items).slice(-2)).toEqual([
      "b-p1",
      "b-p2",
    ]);
  });

  it("skips bound blocks, with a reason", () => {
    let counter = 0;
    const newId = createIdFactory([], () => `p${++counter}`);
    const bound = {
      block: { id: "title", kind: "contentTitle" as const },
      x: 0,
      y: 0,
      w: 100,
    };
    const result = pasteCanvasItems(sample(), "links", "c1", [bound], newId);
    expect(result.ids).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.reason).toBe(
      "Los bloques con tu contenido solo aparecen una vez.",
    );
  });

  it("respects the canvas item limit, with the limit's reason", () => {
    let counter = 0;
    const newId = createIdFactory([], () => `p${++counter}`);
    let full = sample();
    for (let index = 0; index < DESIGN_LIMITS.canvasItems - 2; index += 1)
      full = addBlockToCanvas(full, "c1", createBlock("divider", newId));
    const extra = createBlock("divider", newId);
    const result = pasteCanvasItems(
      full,
      "links",
      "c1",
      [{ block: extra, x: 0, y: 0, w: 100 }],
      newId,
    );
    expect(result.ids).toEqual([]);
    expect(result.skipped).toBe(1);
    expect(result.reason).toBe(
      `Este espacio libre ya tiene ${DESIGN_LIMITS.canvasItems} bloques.`,
    );
  });

  it("leaves the design unchanged for an unknown or non-canvas section", () => {
    const copies = copyCanvasItems(sample(), ["h1"]);
    let result = pasteCanvasItems(
      sample(),
      "links",
      "nope",
      copies,
      () => "b-x",
    );
    expect(result).toMatchObject({
      design: sample(),
      ids: [],
      skipped: 1,
      reason: "Pega en una sección de espacio libre.",
    });
    result = pasteCanvasItems(sample(), "links", "s1", copies, () => "b-x");
    expect(result.reason).toBe("Pega en una sección de espacio libre.");
  });
});

describe("duplicateCanvasItems", () => {
  it("pastes copies of the selection onto their own canvas", () => {
    let counter = 0;
    const newId = createIdFactory([], () => `d${++counter}`);
    const result = duplicateCanvasItems(sample(), "links", ["h1"], newId);
    expect(result.ids).toEqual(["b-d1"]);
    expect(itemOf(result.design, "b-d1")).toMatchObject({ x: 40, y: 56 });
  });
});

describe("removeCanvasItems", () => {
  it("removes items but keeps a required block, with its reason", () => {
    const design = addBlockToCanvas(
      sample(),
      "c1",
      createBlock(
        "profileHeader",
        createIdFactory([], () => "ph"),
      ),
    );
    const result = removeCanvasItems(design, "linkpage", ["img", "b-ph"]);
    expect(result.removed).toBe(1);
    expect(itemOf(result.design, "img")).toBeUndefined();
    expect(itemOf(result.design, "b-ph")).toBeDefined();
    expect(result.reason).toMatch(/necesita/);
  });

  it("ignores ids that are not on a canvas", () => {
    const result = removeCanvasItems(sample(), "links", ["a"]);
    expect(result).toEqual({ design: sample(), removed: 0, reason: null });
  });
});

// ---------------------------------------------------------------------------
// Moving between canvases
// ---------------------------------------------------------------------------

describe("moveCanvasItemToSection", () => {
  it("is exactly moveCanvasItem on its own canvas", () => {
    expect(moveCanvasItemToSection(sample(), "img", "c1", 10, 20)).toEqual(
      moveCanvasItem(sample(), "img", 10, 20),
    );
  });

  it("moves an item to another canvas, clamped there and on top", () => {
    let design = sample();
    design = addCanvasSection(
      design,
      createIdFactory([], () => "k"),
    ).design;
    const moved = moveCanvasItemToSection(design, "img", "s-k", 5_000, 5_000);
    expect(itemOf(moved, "img")).toBeUndefined();
    const there = canvasOf(moved, "s-k").items.find(
      (item) => item.block.id === "img",
    );
    // 640 default height, clamped so a piece stays visible.
    expect(there).toMatchObject({ x: 382, w: 200, h: 200 });
    expect(stackOrder(canvasOf(moved, "s-k").items).at(-1)).toBe("img");
  });

  it("leaves the design unchanged for a locked item, a full or missing canvas", () => {
    const design = sample();
    const locked = setCanvasItemsFlag(design, ["img"], "locked", true);
    expect(moveCanvasItemToSection(locked, "img", "c1", 0, 0)).toBe(locked);
    expect(moveCanvasItemToSection(design, "img", "nope", 0, 0)).toBe(design);
    expect(moveCanvasItemToSection(design, "a", "c1", 0, 0)).toBe(design);
  });
});

// ---------------------------------------------------------------------------
// blankCanvasDesign
// ---------------------------------------------------------------------------

describe("blankCanvasDesign", () => {
  it("adds the default page padding when style has none", () => {
    const design = blankCanvasDesign(
      "links",
      style,
      createIdFactory([], () => "n"),
    );
    expect(design.style.pagePadding).toBe(20);
    expect(design.schema).toBe(2);
  });

  it("places a canvas-friendly required block on the canvas, top center", () => {
    const design = blankCanvasDesign(
      "profile",
      style,
      createIdFactory([], () => "n"),
    );
    expect(design.sections).toHaveLength(1);
    const canvas = design.sections[0];
    if (!canvas || !isCanvasSection(canvas)) throw new Error("no canvas");
    expect(canvas.items).toHaveLength(1);
    expect(canvas.items[0]).toMatchObject({ y: 48 });
    expect(checkDesign("profile", design, [])).toEqual([]);
  });

  it("puts a flow-only required block right after the canvas", () => {
    const design = blankCanvasDesign(
      "links",
      style,
      createIdFactory([], () => "n"),
    );
    expect(design.sections).toHaveLength(2);
    const [canvas, flowSection] = design.sections;
    expect(canvas && isCanvasSection(canvas)).toBe(true);
    expect(flowSection && !isCanvasSection(flowSection)).toBe(true);
    expect(checkDesign("links", design, [])).toEqual([]);
  });

  it("passes checkDesign for every type createBlock already supports", () => {
    for (const type of ["profile", "links", "linkpage"] as const) {
      const design = blankCanvasDesign(
        type,
        style,
        createIdFactory([], () => "n"),
      );
      expect(checkDesign(type, design, [])).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// "Forma" addendum: a brand button's círculo look on a canvas (56×56, kept
// centered) and "Redes en círculo" (four of them, inserted as a row).
// ---------------------------------------------------------------------------

function brandButtonDesign(look: "brand" | "circle" = "brand"): PageDesign {
  return {
    schema: 2,
    style,
    sections: [
      {
        id: "c1",
        kind: "canvas",
        height: 400,
        items: [
          {
            block: {
              id: "bb",
              kind: "brandButton",
              brand: "whatsapp",
              label: "Escríbenos por WhatsApp",
              href: "https://wa.me/525555555555",
              look,
            },
            x: 20,
            y: 40,
            w: 342,
          },
        ],
      },
    ],
  };
}

describe("squareCanvasItem / unsquareCanvasItem", () => {
  it("squares an item to BRAND_CIRCLE_SIZE around its own center", () => {
    const item = { block: heading("h"), x: 20, y: 40, w: 342 };
    const squared = squareCanvasItem(item);
    expect(squared.w).toBe(BRAND_CIRCLE_SIZE);
    expect(squared.h).toBe(BRAND_CIRCLE_SIZE);
    // Same center as before.
    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.w / 2;
    expect(squared.x + squared.w / 2).toBeCloseTo(centerX, 0);
    expect(squared.y + squared.h / 2).toBeCloseTo(centerY, 0);
  });

  it("unsquares back to a normal-width item, same center, height cleared", () => {
    const squared = { block: heading("h"), x: 100, y: 100, w: 56, h: 56 };
    const back = unsquareCanvasItem(squared);
    expect(back.w).toBeGreaterThan(BRAND_CIRCLE_SIZE);
    expect(back.h).toBeUndefined();
    const centerX = squared.x + squared.w / 2;
    expect(back.x + back.w / 2).toBeCloseTo(centerX, 0);
  });
});

describe("setBrandButtonLook", () => {
  it("sets the look on a flow brandButton without touching geometry (none to touch)", () => {
    const design: PageDesign = {
      schema: 1,
      style,
      sections: [
        flow("s1", [
          {
            id: "bb",
            kind: "brandButton",
            brand: "whatsapp",
            label: "Escríbenos por WhatsApp",
            href: "https://wa.me/525555555555",
            look: "brand",
          },
        ]),
      ],
    };
    const next = setBrandButtonLook(design, "bb", "circle");
    const block = next.sections[0]?.columns[0]?.[0];
    expect(block && "look" in block ? block.look : null).toBe("circle");
  });

  it("squares the item on a canvas when switching to círculo", () => {
    const design = brandButtonDesign("brand");
    const next = setBrandButtonLook(design, "bb", "circle");
    const item = itemOf(next, "bb");
    expect(item?.w).toBe(BRAND_CIRCLE_SIZE);
    expect(item?.h).toBe(BRAND_CIRCLE_SIZE);
    const block = item?.block;
    expect(block && block.kind === "brandButton" ? block.look : null).toBe(
      "circle",
    );
  });

  it("restores a normal width when leaving círculo on an item it squared", () => {
    const squared = setBrandButtonLook(
      brandButtonDesign("brand"),
      "bb",
      "circle",
    );
    const restored = setBrandButtonLook(squared, "bb", "brand");
    const item = itemOf(restored, "bb");
    expect(item?.w).toBeGreaterThan(BRAND_CIRCLE_SIZE);
    expect(item?.h).toBeUndefined();
  });

  it("leaves a deliberately square item alone when it was never squared by us", () => {
    const design: PageDesign = {
      schema: 2,
      style,
      sections: [
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "bb",
                kind: "brandButton",
                brand: "whatsapp",
                label: "Escríbenos por WhatsApp",
                href: "https://wa.me/525555555555",
                look: "circle",
              },
              x: 20,
              y: 40,
              w: 120,
              h: 80,
            },
          ],
        },
      ],
    };
    const next = setBrandButtonLook(design, "bb", "brand");
    const item = itemOf(next, "bb");
    // Not 56×56, so it is left exactly as the person sized it.
    expect(item).toMatchObject({ w: 120, h: 80 });
  });

  it("ignores an id that is not a brandButton", () => {
    const design = sample();
    const next = setBrandButtonLook(design, "h1", "circle");
    expect(next).toEqual(design);
  });
});

describe("createBrandCircleRow / placeBrandCircleRow / addBrandCircleRowToCanvas", () => {
  it("creates four brand buttons already in círculo look, WhatsApp with the business's number", () => {
    const blocks = createBrandCircleRow(
      createIdFactory([], () => "n"),
      "https://wa.me/523312345678",
    );
    expect(blocks).toHaveLength(4);
    expect(
      blocks.map((b) => (b.kind === "brandButton" ? b.brand : null)),
    ).toEqual(["whatsapp", "instagram", "tiktok", "facebook"]);
    expect(
      blocks.every((b) => b.kind === "brandButton" && b.look === "circle"),
    ).toBe(true);
    const whatsapp = blocks[0];
    expect(whatsapp?.kind === "brandButton" ? whatsapp.href : null).toBe(
      "https://wa.me/523312345678",
    );
    // The others start empty, left for the owner to fill in.
    for (const block of blocks.slice(1))
      expect(block.kind === "brandButton" ? block.href : null).toBe("");
    // Every id is distinct.
    expect(new Set(blocks.map((b) => b.id)).size).toBe(4);
  });

  it("places four items side by side, square, centered on the given point", () => {
    const section: CanvasSection = {
      id: "c1",
      kind: "canvas",
      height: 400,
      items: [],
    };
    const blocks = createBrandCircleRow(createIdFactory([], () => "n"));
    const items = placeBrandCircleRow(section, blocks, { x: 195, y: 100 });
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.w).toBe(BRAND_CIRCLE_SIZE);
      expect(item.h).toBe(BRAND_CIRCLE_SIZE);
    }
    // In order, left to right, touching at the same gap.
    const sorted = [...items].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      expect(cur && prev ? cur.x - (prev.x + prev.w) : null).toBe(12);
    }
    // Roughly centered on x=195.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first && last) {
      const center = (first.x + (last.x + last.w)) / 2;
      expect(center).toBeCloseTo(195, 0);
    }
  });

  it("adds the row to a canvas section, on top, and leaves an unknown section untouched", () => {
    const design = sample();
    const blocks = createBrandCircleRow(
      createIdFactory(["h1", "img"], () => "n"),
    );
    const next = addBrandCircleRowToCanvas(design, "c1", blocks);
    const canvas = canvasOf(next);
    expect(canvas.items).toHaveLength(2 + blocks.length);
    for (const block of blocks) {
      const item = itemOf(next, block.id);
      expect(item?.w).toBe(BRAND_CIRCLE_SIZE);
      expect(item?.h).toBe(BRAND_CIRCLE_SIZE);
    }

    const unchanged = addBrandCircleRowToCanvas(design, "missing", blocks);
    expect(unchanged).toEqual(design);
  });
});
