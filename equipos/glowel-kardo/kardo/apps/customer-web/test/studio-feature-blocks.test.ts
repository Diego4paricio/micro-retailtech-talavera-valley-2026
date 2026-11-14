import {
  DESIGN_LIMITS,
  type DesignBlock,
  type ExperienceContent,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  createBlock,
  isRepeatableBoundKind,
} from "../src/features/studio/model/blocks.js";
import {
  contentFeaturableItemIds,
  contentFeaturableItems,
  contentItemIds,
} from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import { addBlockBlocker } from "../src/features/studio/model/limits.js";
import {
  insertBlock,
  updateBlock,
} from "../src/features/studio/model/operations.js";
import { prepareDesign } from "../src/features/studio/model/prepare.js";
import { validateDesign } from "../src/features/studio/model/validate.js";

/**
 * "Motor de 3 bloques" (2026-10-03): `features` (Datos clave), `gallery`
 * (Galería) and `featuredItems` (Destacados). Covers creation, validation in
 * Spanish and the limits new to this set (`DESIGN_LIMITS.featuredBlocks`, a
 * gallery's photos counting toward `DESIGN_LIMITS.images`).
 */

const menuContent: ExperienceContent = {
  title: "Menú",
  currency: "MXN",
  sections: [
    {
      id: "sec-a",
      name: "Entradas",
      items: [{ id: "i1", name: "Uno", price: 50 }],
    },
    {
      id: "sec-b",
      name: "Fuertes",
      items: [{ id: "i2", name: "Dos", price: 120 }],
    },
  ],
};
const menuIds = contentItemIds(menuContent);
const menuFeaturable = contentFeaturableItemIds("menu", menuContent);

function withBlock(kind: Parameters<typeof createBlock>[0]) {
  const design = designFromContent("menu", menuContent);
  const idFactory = createIdFactory(menuIds);
  const block = createBlock(kind, idFactory);
  const sectionId = design.sections[0]?.id ?? "";
  return {
    block,
    design: insertBlock(design, block, {
      sectionId,
      columnIndex: 0,
      index: 99,
    }),
  };
}

describe("creation: features, gallery, featuredItems", () => {
  it("starts a features block with one item, list layout", () => {
    const block = createBlock("features", createIdFactory([]));
    expect(block).toMatchObject({
      kind: "features",
      layout: "list",
      items: [{ icon: "star", title: "Dato clave" }],
    });
  });

  it("starts a gallery block with no photos, grid layout, 1:1", () => {
    const block = createBlock("gallery", createIdFactory([]));
    expect(block).toMatchObject({
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [],
    });
  });

  it("starts a featuredItems block with no items, cards layout", () => {
    const block = createBlock("featuredItems", createIdFactory([]));
    expect(block).toMatchObject({
      kind: "featuredItems",
      layout: "cards",
      itemIds: [],
    });
  });

  it("treats menu and featuredItems as repeatable bound kinds, unlike catalog", () => {
    expect(isRepeatableBoundKind("menu")).toBe(true);
    expect(isRepeatableBoundKind("featuredItems")).toBe(true);
    expect(isRepeatableBoundKind("catalog")).toBe(false);
  });
});

describe("content helpers: real dishes/products a featuredItems block may name", () => {
  it("flattens a Menú's dishes across every section", () => {
    expect(contentFeaturableItems("menu", menuContent)).toEqual([
      { id: "i1", name: "Uno", price: 50 },
      { id: "i2", name: "Dos", price: 120 },
    ]);
    expect(menuFeaturable).toEqual(["i1", "i2"]);
  });

  it("lists a Catálogo's own products", () => {
    const catalogContent: ExperienceContent = {
      title: "Catálogo",
      currency: "MXN",
      items: [{ id: "p1", name: "Producto", price: 99 }],
    } as ExperienceContent;
    expect(contentFeaturableItemIds("catalog", catalogContent)).toEqual(["p1"]);
  });

  it("is undefined for a type with no featurable items", () => {
    expect(
      contentFeaturableItemIds("profile", { displayName: "Ana" }),
    ).toBeUndefined();
  });
});

describe("validation in Spanish: features, gallery, featuredItems", () => {
  it("flags a features block left with no items", () => {
    const { design, block } = withBlock("features");
    const empty = updateBlock(design, block.id, (current) =>
      current.kind === "features" ? { ...current, items: [] } : current,
    );
    const issues = validateDesign("menu", empty, menuIds);
    expect(issues.filter((issue) => issue.blockId === block.id)).toContainEqual(
      expect.objectContaining({
        field: "items",
        message:
          "Agrega de 1 a 8 datos clave, cada uno con su ícono y su título.",
      }),
    );
  });

  it("flags a gallery block with fewer than 2 photos", () => {
    const { design, block } = withBlock("gallery");
    const issues = validateDesign("menu", design, menuIds);
    expect(issues.filter((issue) => issue.blockId === block.id)).toContainEqual(
      expect.objectContaining({
        field: "images",
        message: "Agrega de 2 a 12 fotos a la galería.",
      }),
    );
  });

  it("accepts a gallery block once it has at least 2 photos", () => {
    const { design, block } = withBlock("gallery");
    const filled = updateBlock(design, block.id, (current) =>
      current.kind === "gallery"
        ? { ...current, images: [{ alt: "Uno" }, { alt: "Dos" }] }
        : current,
    );
    const issues = validateDesign("menu", filled, menuIds);
    expect(issues.filter((issue) => issue.blockId === block.id)).toEqual([]);
  });

  it("flags a featuredItems block with nothing chosen", () => {
    const { design, block } = withBlock("featuredItems");
    const issues = validateDesign(
      "menu",
      design,
      menuIds,
      undefined,
      menuFeaturable,
    );
    expect(issues.filter((issue) => issue.blockId === block.id)).toContainEqual(
      expect.objectContaining({
        field: "itemIds",
        message: "Elige al menos un platillo o producto para destacar.",
      }),
    );
  });

  it("flags a featuredItems block naming a dish the menu no longer has", () => {
    const { design, block } = withBlock("featuredItems");
    const stale = updateBlock(design, block.id, (current) =>
      current.kind === "featuredItems"
        ? { ...current, itemIds: ["i1", "ghost"] }
        : current,
    );
    const issues = validateDesign(
      "menu",
      stale,
      menuIds,
      undefined,
      menuFeaturable,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        blockId: block.id,
        message:
          "Este bloque destaca un platillo o producto que ya no existe. Vuelve a elegirlos.",
      }),
    );
  });

  it("flags a repeated dish on one featuredItems block", () => {
    const { design, block } = withBlock("featuredItems");
    const repeated = updateBlock(design, block.id, (current) =>
      current.kind === "featuredItems"
        ? { ...current, itemIds: ["i1", "i1"] }
        : current,
    );
    const issues = validateDesign(
      "menu",
      repeated,
      menuIds,
      undefined,
      menuFeaturable,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: "Elige cada platillo o producto una sola vez.",
      }),
    );
  });

  it("accepts a featuredItems block naming real dishes", () => {
    const { design, block } = withBlock("featuredItems");
    const withItems = updateBlock(design, block.id, (current) =>
      current.kind === "featuredItems"
        ? { ...current, itemIds: ["i1", "i2"] }
        : current,
    );
    const issues = validateDesign(
      "menu",
      prepareDesign(withItems),
      menuIds,
      undefined,
      menuFeaturable,
    );
    expect(issues.filter((issue) => issue.blockId === block.id)).toEqual([]);
  });
});

describe("limits: featuredBlocks cap, repeat add, and the gallery image budget", () => {
  it("lets featuredItems be added again up to DESIGN_LIMITS.featuredBlocks, then blocks it", () => {
    let design = designFromContent("menu", menuContent);
    const idFactory = createIdFactory(menuIds);
    const sectionId = design.sections[0]?.id ?? "";
    for (let index = 0; index < DESIGN_LIMITS.featuredBlocks; index += 1) {
      expect(addBlockBlocker(design, "menu", "featuredItems")).toBeNull();
      const block: DesignBlock = {
        id: idFactory("b"),
        kind: "featuredItems",
        layout: "cards",
        itemIds: ["i1"],
      };
      design = insertBlock(design, block, {
        sectionId,
        columnIndex: 0,
        index: 99,
      });
    }
    expect(addBlockBlocker(design, "menu", "featuredItems")).toBe(
      `Llegaste al máximo de ${DESIGN_LIMITS.featuredBlocks} bloques de destacados.`,
    );
  });

  it("is not available outside Menú and Catálogo", () => {
    const design = designFromContent("profile", { displayName: "Ana" });
    expect(addBlockBlocker(design, "profile", "featuredItems")).toBe(
      "No está disponible en este tipo de página.",
    );
  });

  it("counts a gallery's own photos toward the page's image limit", () => {
    const content: ExperienceContent = {
      title: "T",
      links: [],
    } as ExperienceContent;
    let design = designFromContent("links", content);
    const idFactory = createIdFactory([]);
    const sectionId = design.sections[0]?.id ?? "";
    const images = Array.from({ length: DESIGN_LIMITS.images }, () => ({
      alt: "",
    }));
    const gallery: DesignBlock = {
      id: idFactory("b"),
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images,
    };
    design = insertBlock(design, gallery, {
      sectionId,
      columnIndex: 0,
      index: 0,
    });
    expect(addBlockBlocker(design, "links", "image")).toBe(
      `Llegaste al máximo de ${DESIGN_LIMITS.images} imágenes.`,
    );
  });
});
