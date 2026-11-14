import {
  type CanvasSection,
  checkDesign,
  type DesignBlock,
  type DesignSection,
  designBlocks,
  type ExperienceContent,
  type PageDesign,
  PageDesignSchema,
  sectionBlocks,
} from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  contentFeaturableItemIds,
  contentItemIds,
  contentMenuSectionIds,
} from "../src/features/studio/model/content.js";
import {
  copyDesignToType,
  withoutForeignImages,
} from "../src/features/studio/model/copy-design.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { idFactoryFor, type NewId } from "../src/features/studio/model/ids.js";
// Registers the "uri" format TypeBox needs for the https fields
// (`PageDesignSchema`/`checkDesign`), the same side effect
// `studio-design-model.test.ts` relies on.
import "../src/features/studio/model/validate.js";

/** Every id a design uses, section and block (canvas items included). */
function allIds(design: PageDesign): string[] {
  return design.sections.flatMap((section) => [
    section.id,
    ...sectionBlocks(section).map((block) => block.id),
  ]);
}

function blockKinds(design: PageDesign): string[] {
  return designBlocks(design).map((block) => block.kind);
}

function findBlock<K extends DesignBlock["kind"]>(
  design: PageDesign,
  kind: K,
): Extract<DesignBlock, { kind: K }> | undefined {
  return designBlocks(design).find((block) => block.kind === kind) as
    | Extract<DesignBlock, { kind: K }>
    | undefined;
}

function newIdFor(content: ExperienceContent): NewId {
  return idFactoryFor(null, contentItemIds(content));
}

// Lucía's own "Menú" (published in «Mesas»): a customized design — a split
// menu that only shows one of her sections, the kind of thing only a real
// page edited in the Estudio has (never `designFromContent`'s own output,
// which never sets `sectionIds`).
const luciaMenu: ExperienceContent = {
  title: "Nuestro menú",
  currency: "MXN",
  sections: [
    {
      id: "sec-cafes",
      name: "Cafés",
      items: [
        { id: "item-espresso", name: "Espresso", price: 45 },
        { id: "item-capuchino", name: "Capuchino", price: 65 },
      ],
    },
    {
      id: "sec-pasteles",
      name: "Pasteles",
      items: [{ id: "item-pastel", name: "Pastel de elote", price: 55 }],
    },
  ],
};

function luciaDesign(): PageDesign {
  const design = designFromContent("menu", luciaMenu);
  const menuBlock = findBlock(design, "menu");
  if (!menuBlock) throw new Error("fixture: no menu block");
  menuBlock.sectionIds = ["sec-cafes"]; // a split menu: only "Cafés" shows
  return design;
}

// Her new page, "Bebidas de Otoño": another Menú, with its own drinks.
const bebidasDeOtono: ExperienceContent = {
  title: "Bebidas de Otoño",
  currency: "MXN",
  sections: [
    {
      id: "sec-calientes",
      name: "Calientes",
      items: [
        { id: "item-chai", name: "Chai de temporada", price: 58 },
        { id: "item-choc", name: "Chocolate con canela", price: 52 },
      ],
    },
  ],
};

const paquetesDeAna: ExperienceContent = {
  title: "Paquetes",
  currency: "MXN",
  items: [
    { id: "item-basico", name: "Paquete básico", price: 1500 },
    { id: "item-premium", name: "Paquete premium", price: 2800 },
  ],
};

const citasDePaola: ExperienceContent = {
  title: "Agenda tu cita",
  fields: { name: "required", phone: "required", message: "optional" },
  submitLabel: "Enviar",
  successMessage: "¡Gracias! Te contactaremos pronto.",
  consentText: "Acepto que me contacten.",
};

describe("copyDesignToType: Menú → Menú (Lucía's own case)", () => {
  const source = luciaDesign();
  const result = copyDesignToType(source, "menu", newIdFor(bebidasDeOtono));

  it("copies the look as-is", () => {
    expect(result.style).toEqual(source.style);
  });

  it("keeps the menu block, but drops the old menu's own section ids", () => {
    const menuBlock = findBlock(result, "menu");
    expect(menuBlock).toBeDefined();
    expect(menuBlock?.sectionIds).toBeUndefined();
  });

  it("keeps contentTitle (it names nothing page-specific)", () => {
    expect(blockKinds(result)).toContain("contentTitle");
  });

  it("never repeats or reuses an id of the new page's own content", () => {
    const ids = allIds(result);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of contentItemIds(bebidasDeOtono))
      expect(ids).not.toContain(id);
  });

  it("passes checkDesign with the new page's own sections and items", () => {
    const issues = checkDesign("menu", result, contentItemIds(bebidasDeOtono), {
      menuSectionIds: contentMenuSectionIds(bebidasDeOtono),
      featurableItemIds: contentFeaturableItemIds("menu", bebidasDeOtono),
    });
    expect(issues).toEqual([]);
  });

  it("passes the PageDesign schema", () => {
    expect(Value.Check(PageDesignSchema, result)).toBe(true);
  });
});

describe("copyDesignToType: Menú → Catálogo", () => {
  const source = luciaDesign();
  const result = copyDesignToType(source, "catalog", newIdFor(paquetesDeAna));

  it("drops the menu block (catalog cannot place it)", () => {
    expect(blockKinds(result)).not.toContain("menu");
  });

  it("fills in the catalog block the type needs, from its basic design", () => {
    expect(blockKinds(result)).toContain("catalog");
  });

  it("still keeps contentTitle, allowed in both types", () => {
    expect(blockKinds(result)).toContain("contentTitle");
  });

  it("copies the look as-is", () => {
    expect(result.style).toEqual(source.style);
  });

  it("passes checkDesign for the catalog content", () => {
    const issues = checkDesign(
      "catalog",
      result,
      contentItemIds(paquetesDeAna),
      {
        featurableItemIds: contentFeaturableItemIds("catalog", paquetesDeAna),
      },
    );
    expect(issues).toEqual([]);
  });

  it("passes the PageDesign schema", () => {
    expect(Value.Check(PageDesignSchema, result)).toBe(true);
  });
});

describe("copyDesignToType: Menú → Formulario", () => {
  const source = luciaDesign();
  const result = copyDesignToType(source, "form", newIdFor(citasDePaola));

  it("drops the menu block (a Formulario has nowhere to put it)", () => {
    expect(blockKinds(result)).not.toContain("menu");
  });

  it("fills in the leadForm block the type requires", () => {
    expect(blockKinds(result)).toContain("leadForm");
  });

  it("copies the look as-is", () => {
    expect(result.style).toEqual(source.style);
  });

  it("passes checkDesign for the form content", () => {
    const issues = checkDesign("form", result, contentItemIds(citasDePaola));
    expect(issues).toEqual([]);
  });

  it("passes the PageDesign schema", () => {
    expect(Value.Check(PageDesignSchema, result)).toBe(true);
  });
});

describe("copyDesignToType: featuredItems never survives", () => {
  it("drops it even between two Menús, where the kind is allowed", () => {
    const source = luciaDesign();
    const section = source.sections[0] as DesignSection;
    section.columns[0]?.push({
      id: "destacados",
      kind: "featuredItems",
      itemIds: ["item-espresso", "item-capuchino"],
      layout: "cards",
    });
    const result = copyDesignToType(source, "menu", newIdFor(bebidasDeOtono));
    expect(blockKinds(result)).not.toContain("featuredItems");
  });

  it("drops it between a Menú and a Catálogo too", () => {
    const source = luciaDesign();
    const section = source.sections[0] as DesignSection;
    section.columns[0]?.push({
      id: "destacados",
      kind: "featuredItems",
      itemIds: ["item-espresso"],
      layout: "hero",
    });
    const result = copyDesignToType(source, "catalog", newIdFor(paquetesDeAna));
    expect(blockKinds(result)).not.toContain("featuredItems");
  });
});

describe("copyDesignToType: free blocks always carry over", () => {
  it("keeps decorative blocks the old content never had a claim on", () => {
    const source = luciaDesign();
    const section = source.sections[0] as DesignSection;
    section.columns[0]?.unshift({
      id: "intro-heading",
      kind: "heading",
      text: "Bienvenido",
      level: 2,
    });
    const result = copyDesignToType(source, "form", newIdFor(citasDePaola));
    expect(blockKinds(result)).toContain("heading");
  });

  it("keeps a free block placed on a canvas section too", () => {
    const base = luciaDesign();
    const canvas: CanvasSection = {
      id: "cover",
      kind: "canvas",
      height: 400,
      items: [
        {
          block: {
            id: "cover-heading",
            kind: "heading",
            text: "Hola",
            level: 1,
          },
          x: 20,
          y: 20,
          w: 300,
        },
      ],
    };
    const source: PageDesign = {
      ...base,
      schema: 2,
      sections: [canvas, ...base.sections],
    };
    const result = copyDesignToType(source, "catalog", newIdFor(paquetesDeAna));
    expect(blockKinds(result)).toContain("heading");
    expect(result.schema).toBe(2);
    expect(Value.Check(PageDesignSchema, result)).toBe(true);
  });
});

describe("copyDesignToType: section order", () => {
  it("keeps the original sections first and appends what's missing at the end", () => {
    const source = luciaDesign();
    const result = copyDesignToType(source, "catalog", newIdFor(paquetesDeAna));
    // Original section (menu dropped, contentTitle kept) stays first; the
    // filled-in catalog block lands in a trailing section.
    const first = result.sections[0] as DesignSection;
    expect(first.columns[0]?.map((block) => block.kind)).toEqual([
      "contentTitle",
    ]);
    const last = result.sections.at(-1) as DesignSection;
    expect(last.columns[0]?.map((block) => block.kind)).toContain("catalog");
  });
});

// A real foreign uuid, like a workspace asset id (`kardo-asset:<ref>`
// tokens in `html` blocks use the same shape while authoring).
const foreignAssetId = "11111111-1111-4111-8111-111111111111";
const foreignLogoId = "22222222-2222-4222-8222-222222222222";

// A design "from another organization" (D6, Diego's case): a photo, a
// gallery, page and section backgrounds, and two html blocks — one that
// names a workspace asset, one that doesn't.
function foreignDesign(): PageDesign {
  const design = designFromContent("links", {
    title: "Agencia Brinco",
    links: [{ id: "sitio", label: "Sitio", url: "https://brinco.example" }],
  });
  design.style.background = {
    kind: "image",
    imageRef: foreignLogoId,
    color: "#111111",
  };
  const section = design.sections[0] as DesignSection;
  section.background = {
    kind: "image",
    imageRef: foreignAssetId,
    color: "#222222",
  };
  section.columns[0]?.push(
    {
      id: "foto",
      kind: "image",
      imageRef: foreignAssetId,
      alt: "Equipo de la agencia",
      aspect: "4:3",
      fit: "cover",
    },
    {
      id: "galeria",
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [
        { imageRef: foreignAssetId, alt: "Oficina" },
        { imageRef: foreignLogoId, alt: "Equipo" },
      ],
    },
    {
      id: "nota",
      kind: "html",
      html: `<img src="kardo-asset:${foreignAssetId}">`,
      css: "",
    },
    {
      id: "firma",
      kind: "html",
      html: "<p>Hecho con cariño</p>",
      css: "p { color: red; }",
    },
  );
  return design;
}

describe("withoutForeignImages", () => {
  const source = foreignDesign();
  const result = withoutForeignImages(source);

  it("strips the page background's imageRef, keeping its color", () => {
    expect(result.style.background).toEqual({
      kind: "image",
      color: "#111111",
    });
  });

  it("strips a section background's imageRef, keeping its color", () => {
    const section = result.sections[0] as DesignSection;
    expect(section.background).toEqual({ kind: "image", color: "#222222" });
  });

  it("turns an image block into an espacio para foto (no imageRef)", () => {
    const block = findBlock(result, "image");
    expect(block).toBeDefined();
    expect(block?.imageRef).toBeUndefined();
    expect(block?.alt).toBe("Equipo de la agencia"); // text survives
  });

  it("turns every gallery photo into an espacio para foto", () => {
    const block = findBlock(result, "gallery");
    expect(block?.images.map((image) => image.imageRef)).toEqual([
      undefined,
      undefined,
    ]);
    expect(block?.images.map((image) => image.alt)).toEqual([
      "Oficina",
      "Equipo",
    ]);
  });

  it("drops an html block that names a workspace asset", () => {
    const htmlBlocks = designBlocks(result).filter(
      (block) => block.kind === "html",
    );
    expect(htmlBlocks).toHaveLength(1);
    expect(htmlBlocks[0]?.id).toBe("firma");
  });

  it("keeps an html block with no asset reference untouched", () => {
    const block = designBlocks(result).find((b) => b.id === "firma");
    expect(block).toEqual({
      id: "firma",
      kind: "html",
      html: "<p>Hecho con cariño</p>",
      css: "p { color: red; }",
    });
  });

  it("never leaves a kardo-asset: reference anywhere in the result", () => {
    expect(JSON.stringify(result)).not.toContain("kardo-asset:");
    expect(JSON.stringify(result)).not.toContain(foreignAssetId);
    expect(JSON.stringify(result)).not.toContain(foreignLogoId);
  });

  it("leaves everything else (palette, fonts, free text blocks) untouched", () => {
    expect(result.style.fonts).toEqual(source.style.fonts);
    expect(result.style.palette).toEqual(source.style.palette);
  });

  it("combines with copyDesignToType: a foreign Página de enlaces copied onto a Menú", () => {
    const copied = copyDesignToType(
      foreignDesign(),
      "menu",
      newIdFor(bebidasDeOtono),
    );
    const cleaned = withoutForeignImages(copied);
    expect(JSON.stringify(cleaned)).not.toContain("kardo-asset:");
    expect(JSON.stringify(cleaned)).not.toContain(foreignAssetId);
    const issues = checkDesign(
      "menu",
      cleaned,
      contentItemIds(bebidasDeOtono),
      {
        menuSectionIds: contentMenuSectionIds(bebidasDeOtono),
        featurableItemIds: contentFeaturableItemIds("menu", bebidasDeOtono),
      },
    );
    expect(issues).toEqual([]);
    expect(Value.Check(PageDesignSchema, cleaned)).toBe(true);
  });
});
