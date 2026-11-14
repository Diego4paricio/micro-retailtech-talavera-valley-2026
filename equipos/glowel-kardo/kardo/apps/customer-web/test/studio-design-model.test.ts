import {
  checkDesign,
  DESIGN_LIMITS,
  designBlocks,
  type ExperienceContent,
  type PageDesign,
  PageDesignSchema,
} from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { createBlock } from "../src/features/studio/model/blocks.js";
import {
  contentItemIds,
  contentMenuSectionIds,
  contentTitle,
  toDesignableContent,
  withDesign,
} from "../src/features/studio/model/content.js";
import {
  designFromContent,
  styleFromTheme,
} from "../src/features/studio/model/from-content.js";
import {
  createIdFactory,
  designIds,
  idFactoryFor,
} from "../src/features/studio/model/ids.js";
import {
  addBlockBlocker,
  addSectionBlocker,
  duplicateSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
} from "../src/features/studio/model/limits.js";
import { insertBlock } from "../src/features/studio/model/operations.js";
import {
  adaptTemplateDesign,
  fallbackTemplate,
} from "../src/features/studio/model/templates.js";
import "../src/features/studio/model/validate.js";

const links: ExperienceContent = {
  title: "Café Nube",
  description: "Todo a un toque",
  links: [
    { id: "menu", label: "Menú", url: "https://cafe.example/menu" },
    { id: "b-reserva", label: "Reservar", url: "https://cafe.example/r" },
  ],
  theme: {
    background: {
      kind: "gradient",
      color: "#08293d",
      colorTo: "#0d637d",
      angle: 160,
    },
    surface: "dark",
    accent: "#8ce0dc",
    buttonStyle: "outline",
    font: "serif",
  },
};

const linkpage: ExperienceContent = {
  displayName: "Café Nube",
  bio: "Café de especialidad",
  avatarAssetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
  socials: [
    { id: "ig", network: "instagram", value: "https://instagram.com/cafe" },
  ],
  links: [
    { id: "l1", label: "Menú", url: "https://cafe.example", highlight: true },
  ],
};

describe("studio ids", () => {
  it("never repeats a design or content id, even with a broken random", () => {
    const newId = createIdFactory(["b-same", "s-same"], () => "same");
    const first = newId("b");
    const second = newId("b");
    expect(first).not.toBe("b-same");
    expect(second).not.toBe(first);
    expect(first).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("avoids the content's own link ids", () => {
    const design = designFromContent("links", links);
    const ids = designIds(design);
    for (const id of contentItemIds(links)) expect(ids).not.toContain(id);
    const newId = idFactoryFor(design, contentItemIds(links));
    const fresh = Array.from({ length: 50 }, () => newId("b"));
    expect(new Set(fresh).size).toBe(50);
    for (const id of fresh) expect(ids).not.toContain(id);
  });
});

describe("designFromContent", () => {
  it("maps today's theme and places the type's content blocks", () => {
    const design = designFromContent("links", links);
    expect(design.style.palette.background).toBe("#08293d");
    expect(design.style.palette.accent).toBe("#8ce0dc");
    expect(design.style.palette.text).toBe("#f4f6f5");
    expect(design.style.buttonStyle).toBe("outline");
    expect(design.style.fonts).toEqual({ heading: "serif", body: "serif" });
    expect(design.style.background).toEqual({
      kind: "gradient",
      color: "#08293d",
      colorTo: "#0d637d",
      angle: 160,
    });
    expect(designBlocks(design).map((block) => block.kind)).toEqual([
      "contentTitle",
      "contentLinks",
    ]);
  });

  it("produces designs the contract accepts for every designable type", () => {
    const profile: ExperienceContent = { displayName: "Ana", links: [] };
    for (const [type, content] of [
      ["links", links],
      ["profile", profile],
      ["linkpage", linkpage],
    ] as const) {
      const design = designFromContent(type, content);
      expect(Value.Check(PageDesignSchema, design)).toBe(true);
      expect(checkDesign(type, design, contentItemIds(content))).toEqual([]);
    }
    expect(
      designBlocks(designFromContent("linkpage", linkpage)).map(
        (block) => block.kind,
      ),
    ).toEqual(["profileHeader", "contentSocials", "contentLinks"]);
  });

  it("uses the Kardo look without a theme and keeps image backgrounds", () => {
    expect(styleFromTheme(undefined).palette.accent).toBe("#0a6c78");
    const image = styleFromTheme({
      background: {
        kind: "image",
        color: "#000000",
        imageAssetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
        overlay: 40,
      },
      surface: "light",
      accent: "#b5533c",
      buttonStyle: "pill",
      font: "sans",
    });
    expect(image.background).toMatchObject({
      kind: "image",
      imageRef: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      overlay: 40,
    });
    expect(image.buttonShape).toBe("pill");
  });

  it("sets and removes the design without undefined keys", () => {
    const design = designFromContent("links", links);
    const withIt = withDesign(links, design);
    expect((withIt as { design?: PageDesign }).design).toBe(design);
    expect("design" in withDesign(withIt, null)).toBe(false);
  });

  it("hands the renderer the content it expects", () => {
    expect(toDesignableContent("linkpage", linkpage)).toEqual({
      type: "linkpage",
      displayName: "Café Nube",
      bio: "Café de especialidad",
      avatarRef: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      socials: [
        { id: "ig", network: "instagram", value: "https://instagram.com/cafe" },
      ],
      links: [
        {
          id: "l1",
          label: "Menú",
          url: "https://cafe.example",
          highlight: true,
        },
      ],
    });
  });
});

describe("templates", () => {
  it("adapts a template to each type: allowed blocks only, fresh ids", () => {
    for (const [type, content] of [
      ["links", links],
      ["profile", { displayName: "Ana", links: [] }],
      ["linkpage", linkpage],
    ] as const) {
      const ids = contentItemIds(content);
      const design = adaptTemplateDesign(fallbackTemplate.design, type, ids);
      expect(Value.Check(PageDesignSchema, design)).toBe(true);
      expect(checkDesign(type, design, ids)).toEqual([]);
      expect(designIds(design)).not.toContain("encabezado");
    }
  });

  it("puts back missing content blocks and fixes column counts", () => {
    const partial: PageDesign = {
      ...fallbackTemplate.design,
      sections: [
        {
          id: "only",
          layout: "1-1",
          columns: [[{ id: "t", kind: "heading", text: "Hola", level: 1 }]],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 8,
          align: "start",
        },
      ],
    };
    const design = adaptTemplateDesign(partial, "linkpage", []);
    expect(design.sections[0]?.columns).toHaveLength(2);
    expect(designBlocks(design).map((block) => block.kind)).toEqual([
      "profileHeader",
      "contentSocials",
      "contentLinks",
      "heading",
    ]);
    expect(checkDesign("linkpage", design, [])).toEqual([]);
  });
});

describe("addendum 3: menu, catalog, form, document and image", () => {
  const menuContent: ExperienceContent = {
    title: "Nuestro menú",
    currency: "MXN",
    sections: [
      {
        id: "sec-entradas",
        name: "Entradas",
        items: [
          {
            id: "it-1",
            name: "Guacamole",
            description: "Con totopos",
            price: 95,
            imageAssetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
          },
        ],
      },
      {
        id: "sec-fuertes",
        name: "Fuertes",
        items: [{ id: "it-2", name: "Tacos al pastor", price: 120 }],
      },
    ],
  };

  const catalogContent: ExperienceContent = {
    title: "Catálogo",
    currency: "MXN",
    items: [
      {
        id: "prod-1",
        name: "Ramo de temporada",
        price: 350,
        url: "https://florista.example/ramo",
        imageAssetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      },
    ],
  };

  const formContent: ExperienceContent = {
    title: "Contáctanos",
    fields: { name: "required", phone: "optional", message: "required" },
    submitLabel: "Enviar",
    successMessage: "Gracias",
    consentText: "Acepto el uso de mis datos.",
  };

  const documentContent: ExperienceContent = {
    assetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
    title: "Catálogo 2026",
    display: "viewer",
    pages: [
      {
        assetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a02",
        width: 800,
        height: 1000,
      },
    ],
    allowDownload: true,
  };

  const imageContent: ExperienceContent = {
    assetId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
    alt: "Foto de portada",
  };

  const cases = [
    ["menu", menuContent, "menu"],
    ["catalog", catalogContent, "catalog"],
    ["form", formContent, "leadForm"],
    ["document", documentContent, "documentPages"],
    ["image", imageContent, "imageMain"],
  ] as const;

  it("builds a valid, professional-looking design for every new type", () => {
    for (const [type, content, requiredKind] of cases) {
      const ids = contentItemIds(content);
      const design = designFromContent(type, content, idFactoryFor(null, ids));
      expect(Value.Check(PageDesignSchema, design), type).toBe(true);
      expect(
        checkDesign(type, design, ids, {
          menuSectionIds: contentMenuSectionIds(content),
        }),
        type,
      ).toEqual([]);
      expect(
        designBlocks(design).some((block) => block.kind === requiredKind),
        type,
      ).toBe(true);
      expect(design.style.ambient, type).toEqual({ kind: "auto" });
      // A Documento PDF goes edge to edge (only its pages, 2026-10-02).
      expect(design.style.pagePadding, type).toBe(type === "document" ? 0 : 20);
    }
  });

  it("starts a Documento PDF as only its pages, full width, with no title", () => {
    const content = cases.find(([type]) => type === "document")?.[1];
    if (!content) throw new Error("missing document case");
    const design = designFromContent("document", content);
    expect(designBlocks(design).map((block) => block.kind)).toEqual([
      "documentPages",
    ]);
    const section = design.sections[0];
    expect(section && "card" in section ? section.card : undefined).toBeFalsy();
    expect(design.style.maxWidth).toBe(960);
  });

  it("creates every new bound and free block kind as a schema-valid block", () => {
    const newId = idFactoryFor(null, []);
    for (const kind of [
      "menu",
      "catalog",
      "leadForm",
      "documentPages",
      "imageMain",
      "html",
    ] as const) {
      const block = createBlock(kind, newId);
      expect(block.kind, kind).toBe(kind);
    }
  });

  it("keeps catalog item ids out of design ids (tracked like content links), but not menu dish ids", () => {
    const catalogIds = contentItemIds(catalogContent);
    expect(catalogIds).toContain("prod-1");
    const menuIds = contentItemIds(menuContent);
    expect(menuIds).not.toContain("it-1");
    expect(menuIds).not.toContain("it-2");
  });

  it("reads a Menú's own section ids in order, for 'Partir el menú' and checkDesign", () => {
    expect(contentMenuSectionIds(menuContent)).toEqual([
      "sec-entradas",
      "sec-fuertes",
    ]);
    expect(contentMenuSectionIds(catalogContent)).toBeUndefined();
  });

  it("hands the renderer designable content for menu, catalog, form, document and image", () => {
    expect(toDesignableContent("menu", menuContent)).toMatchObject({
      type: "menu",
      title: "Nuestro menú",
      currency: "MXN",
      sections: [
        { id: "sec-entradas", name: "Entradas" },
        { id: "sec-fuertes", name: "Fuertes" },
      ],
    });
    expect(toDesignableContent("catalog", catalogContent)).toMatchObject({
      type: "catalog",
      items: [
        { id: "prod-1", imageRef: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01" },
      ],
    });
    expect(toDesignableContent("document", documentContent)).toMatchObject({
      type: "document",
      display: "viewer",
      pages: [
        {
          ref: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a02",
          width: 800,
          height: 1000,
        },
      ],
      allowDownload: true,
    });
    expect(toDesignableContent("image", imageContent)).toEqual({
      type: "image",
      alt: "Foto de portada",
      imageRef: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
    });
  });

  it("hands the renderer a Menú dish's choices and their label (relevo 37, D1)", () => {
    const comidaCorrida: ExperienceContent = {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "sec-comida",
          name: "Comida corrida",
          items: [
            {
              id: "it-cc",
              name: "Comida corrida",
              price: 90,
              choices: [
                { id: "ch-1", name: "Mole" },
                { id: "ch-2", name: "Chicharrón" },
              ],
              choicesLabel: "Elige tu guisado",
            },
          ],
        },
      ],
    } as unknown as ExperienceContent;
    expect(toDesignableContent("menu", comidaCorrida)).toMatchObject({
      sections: [
        {
          items: [
            {
              id: "it-cc",
              choices: [
                { id: "ch-1", name: "Mole" },
                { id: "ch-2", name: "Chicharrón" },
              ],
              choicesLabel: "Elige tu guisado",
            },
          ],
        },
      ],
    });
    // A dish with no choices never carries an empty key.
    const plainDish = (
      toDesignableContent("menu", menuContent) as {
        sections: { items: Record<string, unknown>[] }[];
      }
    ).sections[0]?.items[0];
    expect(plainDish).not.toHaveProperty("choices");
    expect(plainDish).not.toHaveProperty("choicesLabel");
  });

  it("titles the page from the type's own title or displayName, never for image", () => {
    expect(contentTitle("menu", menuContent)).toBe("Nuestro menú");
    expect(contentTitle("form", formContent)).toBe("Contáctanos");
    expect(contentTitle("image", imageContent)).toBe("Kardo");
  });
});

describe("limits", () => {
  const base = () => designFromContent("links", links);

  it("allows each content block once and only for its type", () => {
    expect(addBlockBlocker(base(), "links", "contentLinks")).toBe(
      "Ya está en tu página.",
    );
    expect(addBlockBlocker(base(), "links", "contentSocials")).toMatch(
      /No está disponible/,
    );
    expect(addBlockBlocker(base(), "links", "heading")).toBeNull();
  });

  it("disables adding when the page is full", () => {
    let design = base();
    const sectionId = design.sections[0]?.id ?? "";
    const newId = idFactoryFor(design, []);
    for (let index = 0; index < DESIGN_LIMITS.buttons; index += 1)
      design = insertBlock(
        design,
        {
          id: newId("b"),
          kind: "button",
          label: "B",
          href: "https://a.example",
          variant: "primary",
        },
        { sectionId, columnIndex: 0, index: 0 },
      );
    expect(addBlockBlocker(design, "links", "button")).toMatch(/24 botones/);
    expect(
      addBlockBlocker(design, "links", "divider", {
        sectionId,
        columnIndex: 0,
      }),
    ).toBeNull();
  });

  it("keeps the required block and at least one section", () => {
    const design = base();
    const links = designBlocks(design).find(
      (block) => block.kind === "contentLinks",
    );
    expect(removeBlockBlocker(design, "links", links?.id ?? "")).toMatch(
      /necesita/,
    );
    expect(
      removeSectionBlocker(design, "links", design.sections[0]?.id ?? ""),
    ).toMatch(/al menos una sección/);
    expect(addSectionBlocker(design)).toBeNull();
    expect(
      duplicateSectionBlocker(design, design.sections[0]?.id ?? ""),
    ).toBeNull();
  });
});
