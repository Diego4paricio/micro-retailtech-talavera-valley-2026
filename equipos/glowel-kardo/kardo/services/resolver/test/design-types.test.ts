import { describe, expect, it } from "vitest";
import { publishCommand } from "../src/snapshot.js";

// ---------------------------------------------------------------------------
// Estudio de Experiences (ADR 018, addendum 3): `publishCommand` re-validates
// an experience-carried `design` for menu, catalog, form, document and image
// — the four types that joined links/profile/linkpage/menu in the Estudio.
// This mirrors the unit-style coverage `snapshot.test.ts` already has for
// menu/catalog/form/theme, at the `publishCommand` level (not the full
// render/publish integration path in `test/design.test.ts`, which belongs to
// the render agent).
// ---------------------------------------------------------------------------

const publicId = "kardotesttouchpoint01";
const imageSha256 = "a".repeat(64);
const imageAssets = [{ sha256: imageSha256, mediaType: "image/png" as const }];

function baseDesignStyle() {
  return {
    palette: {
      background: "#ffffff",
      surface: "#f5f5f5",
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

describe("publishCommand: designed menu (addendum 3)", () => {
  const section = {
    id: "bebidas",
    name: "Bebidas",
    items: [{ id: "i1", name: "Café", price: 45 }],
  };

  it("accepts a menu block naming one of the menu's own sections", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [section],
          design: designWithColumn({
            id: "mn1",
            kind: "menu",
            layout: "list",
            photos: "none",
            sectionIds: ["bebidas"],
          }),
        },
      }),
    ).not.toBeNull();
  });

  it("rejects a menu block naming a section the menu does not have", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [section],
          design: designWithColumn({
            id: "mn1",
            kind: "menu",
            layout: "list",
            photos: "none",
            sectionIds: ["postres"],
          }),
        },
      }),
    ).toBeNull();
  });

  it("rejects a design missing the required menu bound block", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [section],
          design: designWithColumn({
            id: "h1",
            kind: "heading",
            text: "Hola",
            level: 1,
          }),
        },
      }),
    ).toBeNull();
  });

  it("resolves the design's own image against the snapshot's assets", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [section],
          design: {
            schema: 1,
            style: baseDesignStyle(),
            sections: [
              {
                id: "s1",
                layout: "1",
                columns: [
                  [
                    {
                      id: "img1",
                      kind: "image",
                      imageRef: imageSha256,
                      alt: "",
                      aspect: "auto",
                      fit: "cover",
                    },
                    { id: "mn1", kind: "menu", layout: "list", photos: "none" },
                  ],
                ],
                paddingTop: 0,
                paddingBottom: 0,
                gap: 0,
                align: "start",
              },
            ],
          },
        },
        assets: imageAssets,
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [section],
          design: {
            schema: 1,
            style: baseDesignStyle(),
            sections: [
              {
                id: "s1",
                layout: "1",
                columns: [
                  [
                    {
                      id: "img1",
                      kind: "image",
                      imageRef: imageSha256,
                      alt: "",
                      aspect: "auto",
                      fit: "cover",
                    },
                    { id: "mn1", kind: "menu", layout: "list", photos: "none" },
                  ],
                ],
                paddingTop: 0,
                paddingBottom: 0,
                gap: 0,
                align: "start",
              },
            ],
          },
        },
        // No assets: the image hash cannot be verified.
      }),
    ).toBeNull();
  });
});

describe("publishCommand: designed catalog, form and image (addendum 3)", () => {
  it("accepts a designed catalog and checks item ids against the catalog block", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "catalog",
          title: "Catálogo",
          currency: "MXN",
          items: [{ id: "p1", name: "Producto" }],
          design: designWithColumn({
            id: "cat1",
            kind: "catalog",
            layout: "grid",
            columns: 1,
          }),
        },
      }),
    ).not.toBeNull();
  });

  it("rejects a catalog design missing its required bound block", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "catalog",
          title: "Catálogo",
          currency: "MXN",
          items: [{ id: "p1", name: "Producto" }],
          design: designWithColumn({
            id: "h1",
            kind: "heading",
            text: "Hola",
            level: 1,
          }),
        },
      }),
    ).toBeNull();
  });

  it("accepts a designed form (no content item ids to check)", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "form",
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
        },
      }),
    ).not.toBeNull();
  });

  it("accepts a designed image experience", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "image",
          alt: "Foto",
          design: designWithColumn({
            id: "im1",
            kind: "imageMain",
            fit: "cover",
            frame: "none",
          }),
        },
      }),
    ).not.toBeNull();
  });

  it("rejects an image design missing its required imageMain block", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "image",
          alt: "Foto",
          design: designWithColumn({
            id: "h1",
            kind: "heading",
            text: "Hola",
            level: 1,
          }),
        },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: a design's html block (addendum 3)", () => {
  it("accepts an html block whose kardo-asset token matches a real image asset in the snapshot", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "form",
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
                      html: `<img src="kardo-asset:${imageSha256}">`,
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
        },
        assets: imageAssets,
      }),
    ).not.toBeNull();
  });

  it("rejects an html block whose kardo-asset token is absent from the snapshot's assets", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "form",
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
                      html: `<img src="kardo-asset:${imageSha256}">`,
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
        },
        // No assets: the html block's image hash cannot be verified.
      }),
    ).toBeNull();
  });
});
