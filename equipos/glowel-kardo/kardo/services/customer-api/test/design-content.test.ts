import type { PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { ContentValidationError } from "../src/errors.js";
import { validateExperienceContent } from "../src/validation/experience-content.js";
import { assetId } from "./helpers.js";

function design(overrides: Partial<PageDesign> = {}): PageDesign {
  return {
    schema: 1,
    style: {
      palette: {
        background: "#f7f5f0",
        surface: "#fffdf8",
        text: "#16232e",
        muted: "#52646d",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "dm-sans" },
      radius: 14,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: { kind: "solid", color: "#f7f5f0" },
      maxWidth: 520,
    },
    sections: [
      {
        id: "hero",
        layout: "1",
        columns: [
          [
            { id: "title", kind: "contentTitle" },
            {
              id: "photo",
              kind: "image",
              imageRef: assetId,
              alt: "Fachada",
              aspect: "16:9",
              fit: "cover",
            },
            {
              id: "promo",
              kind: "button",
              label: "Pedir por WhatsApp",
              href: "https://wa.me/5215555555555",
              variant: "primary",
            },
            { id: "links", kind: "contentLinks", layout: "list" },
          ],
        ],
        paddingTop: 32,
        paddingBottom: 32,
        gap: 12,
        align: "center",
      },
    ],
    ...overrides,
  };
}

const links = {
  title: "Estudio Noa",
  links: [{ id: "web", label: "Sitio", url: "https://noa.example/" }],
};

function expectInvalid(type: "links" | "menu", content: unknown) {
  expect(() => validateExperienceContent(type, content)).toThrow(
    ContentValidationError,
  );
}

describe("Estudio de Experiences designs", () => {
  it("accepts a design and asks to check its library images", () => {
    const result = validateExperienceContent("links", {
      ...links,
      design: design(),
    });
    expect(result.assetReferences).toContainEqual({
      assetId,
      purpose: "design-image",
      expectedMediaType: "image/*",
    });
  });

  it("rejects designs on types the Estudio does not cover yet", () => {
    expectInvalid("menu", {
      title: "Carta",
      currency: "MXN",
      sections: [
        { id: "s", name: "Bebidas", items: [{ id: "i", name: "Café" }] },
      ],
      design: design(),
    });
  });

  it("requires the type's main content block and allows bound blocks once", () => {
    const withoutLinks = design();
    withoutLinks.sections[0]?.columns[0]?.splice(3, 1);
    expectInvalid("links", { ...links, design: withoutLinks });

    const twice = design();
    twice.sections[0]?.columns[0]?.push({
      id: "links-2",
      kind: "contentLinks",
      layout: "grid",
    });
    expectInvalid("links", { ...links, design: twice });

    const wrongType = design();
    wrongType.sections[0]?.columns[0]?.push({
      id: "socials",
      kind: "contentSocials",
      size: "medium",
    });
    expectInvalid("links", { ...links, design: wrongType });
  });

  it("rejects repeated ids, including a content link id", () => {
    const repeated = design();
    repeated.sections[0]?.columns[0]?.push({ id: "web", kind: "divider" });
    expectInvalid("links", { ...links, design: repeated });
  });

  it("rejects unsafe links and images that are not library assets", () => {
    const unsafe = design();
    unsafe.sections[0]?.columns[0]?.push({
      id: "bad",
      kind: "button",
      label: "Entrar",
      href: "https://user:pass@evil.example/",
      variant: "secondary",
    });
    expectInvalid("links", { ...links, design: unsafe });

    const script = design();
    script.sections[0]?.columns[0]?.push({
      id: "bad",
      kind: "button",
      label: "Entrar",
      href: "javascript:alert(1)",
      variant: "secondary",
    });
    expectInvalid("links", { ...links, design: script });

    const hashRef = design();
    hashRef.style.background = {
      kind: "image",
      imageRef: "a".repeat(64),
      overlay: 20,
    };
    expectInvalid("links", { ...links, design: hashRef });
  });

  it("rejects layouts whose columns do not match", () => {
    const mismatch = design();
    const section = mismatch.sections[0];
    if (section) section.layout = "1-1";
    expectInvalid("links", { ...links, design: mismatch });
  });

  it("'sin banco de fotos': accepts an image block and a gallery slot with no imageRef, and never asks to check them", () => {
    const secondAssetId = "5e6f7081-9a2b-4c3d-8e4f-5a6b7c8d9e0f";
    const noPhotoDesign = design();
    const column = noPhotoDesign.sections[0]?.columns[0];
    column?.splice(1, 1, {
      id: "photo",
      kind: "image",
      alt: "Espacio para la foto de la fachada",
      aspect: "16:9",
      fit: "cover",
    });
    column?.push({
      id: "gallery",
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [
        { imageRef: secondAssetId, alt: "Con foto" },
        { alt: "Espacio para otra foto" },
      ],
    });
    const result = validateExperienceContent("links", {
      ...links,
      design: noPhotoDesign,
    });
    expect(result.assetReferences).not.toContainEqual(
      expect.objectContaining({ assetId }),
    );
    expect(result.assetReferences).toContainEqual({
      assetId: secondAssetId,
      purpose: "design-image",
      expectedMediaType: "image/*",
    });
    expect(
      result.assetReferences.filter((r) => r.purpose === "design-image"),
    ).toHaveLength(1);
  });
});

describe("Estudio de Experiences designs: featuredItems (motor de 3 bloques)", () => {
  function menuDesignWithFeatured(itemIds: string[]): PageDesign {
    return {
      schema: 1,
      style: design().style,
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "title", kind: "contentTitle" },
              { id: "mn1", kind: "menu", layout: "list", photos: "none" },
              { id: "fi1", kind: "featuredItems", layout: "cards", itemIds },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
  }

  const menuContent = {
    title: "Carta",
    currency: "MXN",
    sections: [
      {
        id: "sec1",
        name: "Entradas",
        items: [{ id: "d1", name: "Sopa de la casa" }],
      },
    ],
  };

  it("accepts a featuredItems block naming a real dish", () => {
    expect(() =>
      validateExperienceContent("menu", {
        ...menuContent,
        design: menuDesignWithFeatured(["d1"]),
      }),
    ).not.toThrow();
  });

  it("rejects a featuredItems block naming a dish the menu does not have", () => {
    expectInvalid("menu", {
      ...menuContent,
      design: menuDesignWithFeatured(["ghost"]),
    });
  });
});

describe("modo HTML links", () => {
  const customHtml = (html: string, active = true) => ({
    schema: 1,
    active,
    html,
    css: "",
  });

  it("accepts hand-written HTTPS links, mailto and tel", () => {
    expect(() =>
      validateExperienceContent("links", {
        ...links,
        customHtml: customHtml(
          '<a href="https://noa.example">Sitio</a><a href="mailto:hola@noa.example">Correo</a><a href="tel:+525512345678">Llamar</a>',
        ),
      }),
    ).not.toThrow();
  });

  it("refuses to save an active page with a link the Publisher would refuse", () => {
    expectInvalid("links", {
      ...links,
      customHtml: customHtml('<a href="https://noa.example./">Sitio</a>'),
    });
  });

  it("keeps an inactive draft editable", () => {
    expect(() =>
      validateExperienceContent("links", {
        ...links,
        customHtml: customHtml(
          '<a href="https://noa.example./">Sitio</a>',
          false,
        ),
      }),
    ).not.toThrow();
  });
});
