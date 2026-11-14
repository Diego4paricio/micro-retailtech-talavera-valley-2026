import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  checkDesign,
  DESIGN_LIMITS,
  type DesignBlock,
  designHtmlAssetRefs,
  designImageRefs,
  type PageDesign,
  PageDesignSchema,
} from "../src/design.js";

// Every validator registers "uri" the same way (see the Customer API's
// validation/formats.ts); checkDesign relies on it for block hrefs.
if (!FormatRegistry.Has("uri"))
  FormatRegistry.Set("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });

const style: PageDesign["style"] = {
  palette: {
    background: "#f7f5f0",
    surface: "#ffffff",
    text: "#16232e",
    muted: "#52646d",
    accent: "#0a6c78",
  },
  fonts: { heading: "geist", body: "dm-sans" },
  radius: 16,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  background: { kind: "solid", color: "#f7f5f0" },
  maxWidth: 640,
};

function flow(id: string, blocks: unknown[]): PageDesign["sections"][number] {
  return {
    id,
    layout: "1",
    columns: [blocks as DesignBlock[]],
    paddingTop: 24,
    paddingBottom: 24,
    gap: 16,
    align: "center",
  };
}

function design(
  sections: PageDesign["sections"],
  extra: Partial<PageDesign> = {},
): PageDesign {
  return { schema: 2, style, sections, ...extra };
}

const menuBlock = (id: string, sectionIds?: string[]) => ({
  id,
  kind: "menu",
  layout: "list",
  photos: "small",
  ...(sectionIds ? { sectionIds } : {}),
});

describe("PageDesignSchema", () => {
  it("accepts the addendum 3 style fields and canvas item fields", () => {
    const value = design(
      [
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "s1",
                kind: "shape",
                shape: "star",
                fill: "accent",
                fillTo: "#ffcc00",
                angle: 45,
              },
              x: 10,
              y: 10,
              w: 100,
              h: 100,
              r: -30,
              locked: true,
              hidden: false,
            },
          ],
        },
        flow("f1", [{ id: "l1", kind: "contentLinks", layout: "list" }]),
      ],
      {
        style: {
          ...style,
          ambient: { kind: "custom", color: "#112233", strength: 40 },
          pagePadding: 24,
        },
      },
    );
    expect(Value.Check(PageDesignSchema, value)).toBe(true);
    expect(checkDesign("links", value)).toEqual([]);
  });

  it("only checks id and kind of a block; checkDesign checks it exactly", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        { id: "h1", kind: "heading", text: "Hola", level: 9 },
      ]),
    ]);
    expect(Value.Check(PageDesignSchema, value)).toBe(true);
    expect(checkDesign("links", value)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "Invalid block.",
    });
  });

  it("rejects a rotation out of range", () => {
    const value = design([
      {
        id: "c1",
        kind: "canvas",
        height: 400,
        items: [
          {
            block: { id: "s1", kind: "shape", shape: "rect", fill: "accent" },
            x: 0,
            y: 0,
            w: 50,
            h: 50,
            r: 270,
          },
        ],
      },
    ]);
    expect(Value.Check(PageDesignSchema, value)).toBe(false);
  });
});

describe("checkDesign for the addendum 3 types", () => {
  it("requires each type's bound block", () => {
    const empty = design([flow("f1", [{ id: "t", kind: "divider" }])]);
    expect(checkDesign("menu", empty)).toContainEqual({
      path: "sections",
      message: "The design must keep menu.",
    });
    expect(checkDesign("catalog", empty).at(-1)?.message).toBe(
      "The design must keep catalog.",
    );
    expect(checkDesign("form", empty).at(-1)?.message).toBe(
      "The design must keep leadForm.",
    );
    expect(checkDesign("document", empty).at(-1)?.message).toBe(
      "The design must keep documentPages.",
    );
    expect(checkDesign("image", empty).at(-1)?.message).toBe(
      "The design must keep imageMain.",
    );
  });

  it("lets a menu be split in several blocks, each naming real sections", () => {
    const value = design([
      flow("f1", [
        { id: "t", kind: "contentTitle" },
        menuBlock("m1", ["entradas"]),
        { id: "img", kind: "divider" },
        menuBlock("m2", ["postres", "bebidas"]),
      ]),
    ]);
    const ids = ["entradas", "postres", "bebidas", "flan"];
    expect(
      checkDesign("menu", value, ids, {
        menuSectionIds: ["entradas", "postres", "bebidas"],
      }),
    ).toEqual([]);
    const unknown = design([flow("f1", [menuBlock("m1", ["otra"])])]);
    expect(
      checkDesign("menu", unknown, [], { menuSectionIds: ["entradas"] }),
    ).toContainEqual({
      path: "sections[0].columns[0][0]",
      message: "The menu block names a section the menu does not have.",
    });
  });

  it("keeps other bound blocks to one each and to their own type", () => {
    const twice = design([
      flow("f1", [
        { id: "c1", kind: "catalog", layout: "grid", columns: 2 },
        { id: "c2", kind: "catalog", layout: "list", columns: 1 },
      ]),
    ]);
    expect(checkDesign("catalog", twice)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "catalog can appear only once.",
    });
    const wrongType = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        { id: "f", kind: "leadForm", look: "boxed" },
      ]),
    ]);
    expect(checkDesign("links", wrongType)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "leadForm is not available for links.",
    });
  });

  it("keeps growing content out of canvases but allows imageMain and html", () => {
    const canvas = (block: unknown) =>
      design([
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [{ block: block as DesignBlock, x: 0, y: 0, w: 200, h: 200 }],
        },
      ]);
    expect(
      checkDesign("menu", canvas(menuBlock("m1"))).some(
        (issue) => issue.message === "menu cannot be placed on a canvas.",
      ),
    ).toBe(true);
    expect(
      checkDesign(
        "image",
        canvas({ id: "i", kind: "imageMain", fit: "cover", frame: "none" }),
      ),
    ).toEqual([]);
  });

  it("limits html blocks and scans their library images", () => {
    const html = (id: string) => ({
      id,
      kind: "html",
      html: '<img src="kardo-asset:6e1c9a2b-4d5f-4a7b-9c8d-1e2f3a4b5c81" alt="">',
      css: "div{background:url(kardo-asset:6E1C9A2B-4D5F-4A7B-9C8D-1E2F3A4B5C82)}",
    });
    const five = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        html("a"),
        html("b"),
        html("c"),
        html("d"),
        html("e"),
      ]),
    ]);
    expect(checkDesign("links", five)).toContainEqual({
      path: "sections",
      message: "Too many HTML blocks.",
    });
    expect(designHtmlAssetRefs(five).sort()).toEqual([
      "6e1c9a2b-4d5f-4a7b-9c8d-1e2f3a4b5c81",
      "6e1c9a2b-4d5f-4a7b-9c8d-1e2f3a4b5c82",
    ]);
  });
});

// ---------------------------------------------------------------------------
// New blocks (motor de 3 bloques): features, gallery, featuredItems.
// ---------------------------------------------------------------------------

const imgA = "11111111-1111-1111-1111-111111111111";
const imgB = "22222222-2222-2222-2222-222222222222";

describe("features block", () => {
  it("accepts between 1 and 8 items with a closed icon", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "ft1",
          kind: "features",
          layout: "row",
          items: [
            { icon: "clock", title: "Lun a dom 9 a 21" },
            { icon: "truck", title: "Entrega a domicilio", text: "En 30 min" },
          ],
        },
      ]),
    ]);
    expect(Value.Check(PageDesignSchema, value)).toBe(true);
    expect(checkDesign("links", value)).toEqual([]);
  });

  it("rejects more than 8 items and an icon outside the closed list", () => {
    // A flow section's schema only checks id/kind loosely (LooseBlockSchema);
    // checkDesign is what validates a block against DesignBlockSchema exactly.
    const tooMany = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "ft1",
          kind: "features",
          layout: "grid",
          items: Array.from({ length: 9 }, (_, i) => ({
            icon: "star",
            title: `Dato ${i}`,
          })),
        },
      ]),
    ]);
    expect(checkDesign("links", tooMany)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "Invalid block.",
    });

    const badIcon = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "ft1",
          kind: "features",
          layout: "list",
          items: [{ icon: "rocket", title: "Dato" }],
        },
      ]),
    ]);
    expect(checkDesign("links", badIcon)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "Invalid block.",
    });
  });
});

describe("image block: 'sin banco de fotos' placeholders", () => {
  it("accepts an image block with no imageRef (a placeholder slot)", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "img1",
          kind: "image",
          alt: "Foto de tu platillo más pedido",
          aspect: "4:3",
          fit: "cover",
        },
      ]),
    ]);
    expect(checkDesign("links", value)).toEqual([]);
    expect(designImageRefs(value)).toEqual([]);
  });

  it("still counts a placeholder image toward DESIGN_LIMITS.images", () => {
    const blocks = Array.from({ length: DESIGN_LIMITS.images + 1 }, (_, i) => ({
      id: `img${i}`,
      kind: "image",
      alt: "Espacio para foto",
      aspect: "1:1",
      fit: "cover",
    }));
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        ...blocks,
      ]),
    ]);
    expect(checkDesign("links", value)).toContainEqual({
      path: "sections",
      message: "Too many images.",
    });
  });
});

describe("gallery block", () => {
  it("accepts between 2 and 12 images and counts toward designImageRefs", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "g1",
          kind: "gallery",
          layout: "grid",
          aspect: "4:3",
          images: [
            { imageRef: imgA, alt: "Local" },
            { imageRef: imgB, alt: "Platillo" },
          ],
        },
      ]),
    ]);
    expect(Value.Check(PageDesignSchema, value)).toBe(true);
    expect(checkDesign("links", value)).toEqual([]);
    expect(designImageRefs(value).sort()).toEqual([imgA, imgB].sort());
  });

  it("accepts a placeholder slot (no imageRef) among its images", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "g1",
          kind: "gallery",
          layout: "grid",
          aspect: "1:1",
          images: [
            { imageRef: imgA, alt: "Local" },
            { alt: "Espacio para la foto del postre" },
          ],
        },
      ]),
    ]);
    expect(checkDesign("links", value)).toEqual([]);
    expect(designImageRefs(value)).toEqual([imgA]);
  });

  it("rejects fewer than 2 images", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "g1",
          kind: "gallery",
          layout: "carousel",
          aspect: "1:1",
          images: [{ imageRef: imgA, alt: "Local" }],
        },
      ]),
    ]);
    expect(checkDesign("links", value)).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "Invalid block.",
    });
  });

  it("counts every gallery photo against DESIGN_LIMITS.images", () => {
    const manyImages = Array.from(
      { length: DESIGN_LIMITS.images + 2 },
      (_, i) => ({
        imageRef: `${(i % 10).toString().repeat(8)}-1111-1111-1111-111111111111`,
        alt: `Foto ${i}`,
      }),
    );
    // Split across three gallery blocks since each is capped at 12 images.
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        {
          id: "g1",
          kind: "gallery",
          layout: "grid",
          aspect: "1:1",
          images: manyImages.slice(0, 12),
        },
        {
          id: "g2",
          kind: "gallery",
          layout: "grid",
          aspect: "1:1",
          images: manyImages.slice(12, 24),
        },
        {
          id: "g3",
          kind: "gallery",
          layout: "grid",
          aspect: "1:1",
          images: manyImages.slice(24),
        },
      ]),
    ]);
    expect(checkDesign("links", value)).toContainEqual({
      path: "sections",
      message: "Too many images.",
    });
  });
});

describe("featuredItems block", () => {
  it("is available for menu and catalog, repeatable, and validates real item ids", () => {
    const value = design([
      flow("f1", [
        { id: "ct", kind: "contentTitle" },
        {
          id: "fi1",
          kind: "featuredItems",
          layout: "hero",
          label: "Lo más pedido",
          itemIds: ["d1", "d2"],
        },
        {
          id: "fi2",
          kind: "featuredItems",
          layout: "cards",
          itemIds: ["d3"],
        },
        menuBlock("m1"),
      ]),
    ]);
    expect(
      checkDesign("menu", value, ["d1", "d2", "d3"], {
        featurableItemIds: ["d1", "d2", "d3"],
      }),
    ).toEqual([]);
  });

  it("flags a repeated id inside one block and an id the content does not have", () => {
    const value = design([
      flow("f1", [
        { id: "ct", kind: "contentTitle" },
        { id: "cat1", kind: "catalog", layout: "grid", columns: 2 },
        {
          id: "fi1",
          kind: "featuredItems",
          layout: "cards",
          itemIds: ["p1", "p1", "ghost"],
        },
      ]),
    ]);
    const issues = checkDesign("catalog", value, ["p1"], {
      featurableItemIds: ["p1"],
    });
    expect(issues).toContainEqual({
      path: "sections[0].columns[0][2]",
      message: "A featured item is listed twice.",
    });
    expect(issues).toContainEqual({
      path: "sections[0].columns[0][2]",
      message:
        "The featuredItems block names an item the content does not have.",
    });
  });

  it("limits how many featuredItems blocks a design may have", () => {
    const featured = (id: string) => ({
      id,
      kind: "featuredItems",
      layout: "cards",
      itemIds: ["p1"],
    });
    const value = design([
      flow("f1", [
        { id: "ct", kind: "contentTitle" },
        { id: "cat1", kind: "catalog", layout: "grid", columns: 2 },
        featured("fi1"),
        featured("fi2"),
        featured("fi3"),
        featured("fi4"),
      ]),
    ]);
    expect(
      checkDesign("catalog", value, ["p1"], { featurableItemIds: ["p1"] }),
    ).toContainEqual({
      path: "sections",
      message: "Too many featuredItems blocks.",
    });
  });

  it("is not available outside menu and catalog", () => {
    const value = design([
      flow("f1", [
        { id: "l1", kind: "contentLinks", layout: "list" },
        { id: "fi1", kind: "featuredItems", layout: "hero", itemIds: ["x"] },
      ]),
    ]);
    expect(checkDesign("links", value, ["x"])).toContainEqual({
      path: "sections[0].columns[0][1]",
      message: "featuredItems is not available for links.",
    });
  });
});
