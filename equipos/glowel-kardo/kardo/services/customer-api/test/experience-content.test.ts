import { describe, expect, it } from "vitest";
import { ContentValidationError } from "../src/errors.js";
import { validateExperienceContent } from "../src/validation/experience-content.js";

describe("validateExperienceContent", () => {
  it("normalizes a safe HTTPS redirect destination", () => {
    const result = validateExperienceContent("redirect", {
      destinationUrl: "https://kardo.example/welcome",
    });
    expect(result.content).toEqual({
      destinationUrl: "https://kardo.example/welcome",
    });
    expect(result.assetReferences).toEqual([]);
  });

  it.each([
    ["javascript: scheme", "javascript:alert(1)"],
    ["data: scheme", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://kardo.example"],
    ["embedded credentials", "https://user:pass@kardo.example"],
  ])("rejects a redirect destination using %s", (_label, destinationUrl) => {
    expect(() =>
      validateExperienceContent("redirect", { destinationUrl }),
    ).toThrow(ContentValidationError);
  });

  it.each([
    ["javascript: scheme", "javascript:alert(1)"],
    ["data: scheme", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://kardo.example"],
    ["embedded credentials", "https://user:pass@kardo.example"],
  ])(
    "rejects a dangerous link URL in a Links Experience: %s",
    (_label, url) => {
      expect(() =>
        validateExperienceContent("links", {
          title: "Mis enlaces",
          links: [{ id: "a", label: "Sitio", url }],
        }),
      ).toThrow(ContentValidationError);
    },
  );

  it.each([
    ["javascript: scheme", "javascript:alert(1)"],
    ["data: scheme", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://kardo.example"],
    ["embedded credentials", "https://user:pass@kardo.example"],
  ])(
    "rejects a dangerous link URL in a Profile Experience: %s",
    (_label, url) => {
      expect(() =>
        validateExperienceContent("profile", {
          displayName: "Café Nube",
          links: [{ id: "a", label: "Sitio", url }],
        }),
      ).toThrow(ContentValidationError);
    },
  );

  it.each([
    ["javascript: scheme", "javascript:alert(1)"],
    ["data: scheme", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://kardo.example"],
    ["embedded credentials", "https://user:pass@kardo.example"],
  ])(
    "rejects a dangerous item URL in a Catalog Experience: %s",
    (_label, url) => {
      expect(() =>
        validateExperienceContent("catalog", {
          title: "Catálogo",
          currency: "USD",
          items: [{ id: "a", name: "Producto", url }],
        }),
      ).toThrow(ContentValidationError);
    },
  );

  it("rejects a menu with more than 150 items in total", () => {
    const section = {
      id: "s1",
      name: "Sección",
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `item-${index}`,
        name: `Plato ${index}`,
      })),
    };
    // 6 sections * 30 items = 180 > 150.
    const sections = Array.from({ length: 6 }, (_, index) => ({
      ...section,
      id: `s${index}`,
    }));
    expect(() =>
      validateExperienceContent("menu", {
        title: "Menú",
        currency: "USD",
        sections,
      }),
    ).toThrow(ContentValidationError);
  });

  it("accepts a menu at exactly the 150 item limit", () => {
    const sections = Array.from({ length: 5 }, (_, sectionIndex) => ({
      id: `s${sectionIndex}`,
      name: `Sección ${sectionIndex}`,
      items: Array.from({ length: 30 }, (_, itemIndex) => ({
        id: `s${sectionIndex}-item-${itemIndex}`,
        name: `Plato ${itemIndex}`,
      })),
    }));
    expect(() =>
      validateExperienceContent("menu", {
        title: "Menú",
        currency: "USD",
        sections,
      }),
    ).not.toThrow();
  });

  it("rejects duplicate item ids within the same list", () => {
    expect(() =>
      validateExperienceContent("links", {
        title: "Mis enlaces",
        links: [
          { id: "dup", label: "Uno", url: "https://kardo.example/a" },
          { id: "dup", label: "Dos", url: "https://kardo.example/b" },
        ],
      }),
    ).toThrow(ContentValidationError);
  });

  it("collects asset references with the media type each purpose requires", () => {
    const image = validateExperienceContent("image", {
      assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
      alt: "Foto",
    });
    expect(image.assetReferences).toEqual([
      {
        assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
        purpose: "image",
        expectedMediaType: "image/*",
      },
    ]);

    const document = validateExperienceContent("document", {
      assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
      title: "Ficha",
    });
    expect(document.assetReferences[0]?.expectedMediaType).toBe(
      "application/pdf",
    );
  });

  it("rejects a viewer document with no pages", () => {
    expect(() =>
      validateExperienceContent("document", {
        assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
        title: "Ficha",
        display: "viewer",
      }),
    ).toThrow(ContentValidationError);
  });

  it("accepts a viewer document with a page and collects it as document-page", () => {
    const pageAssetId = "3c4d5e6f-7081-492a-8c1d-2e3f4a5b6c7d";
    const result = validateExperienceContent("document", {
      assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
      title: "Ficha",
      display: "viewer",
      allowDownload: true,
      pages: [{ assetId: pageAssetId, width: 800, height: 1000 }],
    });
    expect(result.assetReferences).toContainEqual({
      assetId: pageAssetId,
      purpose: "document-page",
      expectedMediaType: "image/*",
    });
  });
});

describe("validateExperienceContent: the PDF file is only needed to download it (2026-10-02)", () => {
  const page = {
    assetId: "3c4d5e6f-7081-492a-8c1d-2e3f4a5b6c7d",
    width: 1240,
    height: 1754,
  };

  it("accepts a viewer without the PDF file (e.g. rejected for active content) and references only its pages", () => {
    const result = validateExperienceContent("document", {
      title: "Calculadora",
      display: "viewer",
      pages: [page],
    });
    expect(result.assetReferences).toEqual([
      {
        assetId: page.assetId,
        purpose: "document-page",
        expectedMediaType: "image/*",
      },
    ]);
  });

  it("requires the PDF file to download it", () => {
    expect(() =>
      validateExperienceContent("document", {
        title: "Calculadora",
        display: "viewer",
        allowDownload: true,
        pages: [page],
      }),
    ).toThrow("Para descargar el documento hace falta el archivo PDF.");
    expect(() =>
      validateExperienceContent("document", { title: "Ficha" }),
    ).toThrow(ContentValidationError);
  });
});

describe("validateExperienceContent: enforceDesignRules (Estudio, ADR 018 addendum 3)", () => {
  function baseDesignStyle() {
    return {
      palette: {
        background: "#ffffff",
        surface: "#ffffff",
        text: "#111111",
        muted: "#666666",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "system" },
      radius: 12,
      buttonStyle: "solid",
      buttonShape: "rounded",
      shadow: "none",
      background: { kind: "solid", color: "#ffffff" },
      maxWidth: 640,
    };
  }

  function designWithColumn(block: Record<string, unknown>) {
    return {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [[block]],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
  }

  it("accepts a designed menu and checks the menu block's sectionIds against the menu's own sections", () => {
    expect(() =>
      validateExperienceContent("menu", {
        title: "Carta",
        currency: "USD",
        sections: [
          {
            id: "bebidas",
            name: "Bebidas",
            items: [{ id: "i1", name: "Café" }],
          },
        ],
        design: designWithColumn({
          id: "mn1",
          kind: "menu",
          layout: "list",
          photos: "none",
          sectionIds: ["bebidas"],
        }),
      }),
    ).not.toThrow();
  });

  it("rejects a menu block naming a section the menu does not have", () => {
    expect(() =>
      validateExperienceContent("menu", {
        title: "Carta",
        currency: "USD",
        sections: [
          {
            id: "bebidas",
            name: "Bebidas",
            items: [{ id: "i1", name: "Café" }],
          },
        ],
        design: designWithColumn({
          id: "mn1",
          kind: "menu",
          layout: "list",
          photos: "none",
          sectionIds: ["postres"],
        }),
      }),
    ).toThrow(ContentValidationError);
  });

  it("accepts a designed catalog", () => {
    expect(() =>
      validateExperienceContent("catalog", {
        title: "Catálogo",
        currency: "USD",
        items: [{ id: "p1", name: "Producto" }],
        design: designWithColumn({
          id: "cat1",
          kind: "catalog",
          layout: "grid",
          columns: 1,
        }),
      }),
    ).not.toThrow();
  });

  it("accepts a designed form, document and image (no content item ids to check)", () => {
    expect(() =>
      validateExperienceContent("form", {
        title: "Contáctanos",
        fields: { name: "optional", phone: "hidden", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto",
        design: designWithColumn({
          id: "lf1",
          kind: "leadForm",
          look: "boxed",
        }),
      }),
    ).not.toThrow();
    expect(() =>
      validateExperienceContent("document", {
        assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
        title: "Ficha",
        design: designWithColumn({
          id: "dp1",
          kind: "documentPages",
          pageStyle: "shadow",
        }),
      }),
    ).not.toThrow();
    expect(() =>
      validateExperienceContent("image", {
        assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
        alt: "Foto",
        design: designWithColumn({
          id: "im1",
          kind: "imageMain",
          fit: "cover",
          frame: "none",
        }),
      }),
    ).not.toThrow();
  });

  it("rejects a design missing its type's required bound block", () => {
    expect(() =>
      validateExperienceContent("catalog", {
        title: "Catálogo",
        currency: "USD",
        items: [{ id: "p1", name: "Producto" }],
        design: designWithColumn({
          id: "h1",
          kind: "heading",
          text: "Hola",
          level: 1,
        }),
      }),
    ).toThrow(ContentValidationError);
  });

  it("collects an html block's kardo-asset image as a design-image reference", () => {
    const imageAssetId = "4d5e6f70-8192-4a3b-9c1d-2e3f4a5b6c7d";
    const result = validateExperienceContent("form", {
      title: "Contáctanos",
      fields: { name: "optional", phone: "hidden", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto",
      design: {
        schema: 1,
        style: baseDesignStyle(),
        sections: [
          {
            id: "s1",
            layout: "1",
            columns: [
              [
                { id: "lf1", kind: "leadForm", look: "boxed" },
                {
                  id: "h1",
                  kind: "html",
                  html: `<img src="kardo-asset:${imageAssetId}">`,
                  css: "",
                },
              ],
            ],
            paddingTop: 0,
            paddingBottom: 0,
            gap: 0,
            align: "start",
          },
        ],
      },
    });
    expect(result.assetReferences).toContainEqual({
      assetId: imageAssetId,
      purpose: "design-image",
      expectedMediaType: "image/*",
    });
  });

  it("rejects an html block's kardo-asset image that is not a workspace uuid", () => {
    expect(() =>
      validateExperienceContent("form", {
        title: "Contáctanos",
        fields: { name: "optional", phone: "hidden", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto",
        design: {
          schema: 1,
          style: baseDesignStyle(),
          sections: [
            {
              id: "s1",
              layout: "1",
              columns: [
                [
                  { id: "lf1", kind: "leadForm", look: "boxed" },
                  {
                    id: "h1",
                    kind: "html",
                    html: `<img src="kardo-asset:${"a".repeat(64)}">`,
                    css: "",
                  },
                ],
              ],
              paddingTop: 0,
              paddingBottom: 0,
              gap: 0,
              align: "start",
            },
          ],
        },
      }),
    ).toThrow(ContentValidationError);
  });
});

describe("validateExperienceContent: «Menú del día» (relevo 37, D1)", () => {
  const comidaCorrida = (choices: { id: string; name: string }[]) => ({
    title: "Cocina Económica Doña Rosa",
    currency: "MXN",
    sections: [
      {
        id: "comidas",
        name: "Comida corrida",
        items: [
          {
            id: "corrida",
            name: "Comida corrida",
            description: "Sopa, guisado, postre y agua",
            price: 90,
            choicesLabel: "Elige tu guisado",
            choices,
          },
          { id: "tortillas", name: "Tortillas a mano", price: 15 },
        ],
      },
    ],
  });

  it("accepts a dish with guisados to choose from", () => {
    const result = validateExperienceContent(
      "menu",
      comidaCorrida([
        { id: "mole", name: "Mole poblano" },
        { id: "chicharron", name: "Chicharrón en salsa verde" },
      ]),
    );
    const content = result.content as {
      sections: { items: { choices?: { id: string }[] }[] }[];
    };
    expect(
      content.sections[0]?.items[0]?.choices?.map((choice) => choice.id),
    ).toEqual(["mole", "chicharron"]);
  });

  it("rejects a choice that repeats another choice or a dish", () => {
    expect(() =>
      validateExperienceContent(
        "menu",
        comidaCorrida([
          { id: "mole", name: "Mole" },
          { id: "mole", name: "Mole otra vez" },
        ]),
      ),
    ).toThrow(ContentValidationError);
    expect(() =>
      validateExperienceContent(
        "menu",
        comidaCorrida([{ id: "tortillas", name: "Tortillas" }]),
      ),
    ).toThrow(ContentValidationError);
  });
});
