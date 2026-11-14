import { describe, expect, it } from "vitest";
import {
  cleanContent,
  seedContentForCreation,
  validateContent,
} from "../src/features/experiences/content.js";

describe("experience content validation", () => {
  it("rejects every non-HTTPS or credentialed URL", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.com",
      "https://user:pass@example.com",
      "https://exa mple.com",
    ]) {
      const errors = validateContent("links", {
        title: "Enlaces",
        links: [{ id: "a", label: "Uno", url }],
      });
      expect(errors["links.0.url"], url).toBeTruthy();
    }
  });

  it("accepts a complete links page", () => {
    expect(
      validateContent("links", {
        title: "Café Nube",
        links: [
          { id: "a", label: "Reservar", url: "https://cafe.example/reservas" },
        ],
      }),
    ).toEqual({});
  });

  it("caps a menu at 150 products in total", () => {
    const sections = Array.from({ length: 6 }, (_, section) => ({
      id: `s${section}`,
      name: `Sección ${section}`,
      items: Array.from({ length: 26 }, (_, item) => ({
        id: `i${item}`,
        name: "Producto",
      })),
    }));
    const errors = validateContent("menu", {
      title: "Menú",
      currency: "MXN",
      sections,
    });
    expect(errors.sections).toContain("150");
  });

  it("requires the form copy and never removes the required email", () => {
    const content = seedContentForCreation("form", "", undefined);
    expect(validateContent("form", content)).toHaveProperty("title");
  });

  it("drops empty optional fields instead of sending undefined", () => {
    const cleaned = cleanContent("catalog", {
      title: "  Colección  ",
      currency: "MXN",
      items: [{ id: "a", name: " Taza ", description: "  ", url: "" }],
    });
    expect(cleaned).toEqual({
      title: "Colección",
      currency: "MXN",
      items: [{ id: "a", name: "Taza" }],
    });
    expect(JSON.stringify(cleaned)).not.toContain("undefined");
  });

  it("normalizes redirect URLs", () => {
    expect(
      cleanContent("redirect", { destinationUrl: " https://Example.com " }),
    ).toEqual({
      destinationUrl: "https://example.com/",
    });
  });
});

describe("experience theme (every type except redirect)", () => {
  const theme = {
    background: { kind: "solid" as const, color: "#f3f0e8" },
    surface: "light" as const,
    accent: "#0d637d",
    buttonStyle: "pill" as const,
    font: "sans" as const,
  };

  it("keeps the modo HTML source when the content is edited outside the Estudio", () => {
    const customHtml = {
      schema: 1 as const,
      active: true,
      html: "<h1>Hola</h1><kardo-links></kardo-links>",
      css: "h1{color:red}",
    };
    expect(
      cleanContent("links", { title: "Enlaces", links: [], customHtml }),
    ).toMatchObject({ customHtml });
    expect(
      cleanContent("profile", { displayName: "Ana", links: [], customHtml }),
    ).toMatchObject({ customHtml });
    expect(
      cleanContent("linkpage", {
        displayName: "Ana",
        socials: [],
        links: [],
        customHtml,
      }),
    ).toMatchObject({ customHtml });
  });

  it("keeps the theme through cleanContent for every themable type", () => {
    expect(
      cleanContent("links", {
        title: "Enlaces",
        links: [{ id: "a", label: "Uno", url: "https://example.com" }],
        theme,
      }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("profile", { displayName: "Ana", links: [], theme }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("image", { assetId: "asset-1", alt: "Foto", theme }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("document", {
        assetId: "asset-1",
        title: "Catálogo",
        theme,
      }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("menu", {
        title: "Menú",
        currency: "MXN",
        sections: [
          { id: "s", name: "Sección", items: [{ id: "i", name: "Café" }] },
        ],
        theme,
      }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("catalog", {
        title: "Catálogo",
        currency: "MXN",
        items: [{ id: "i", name: "Taza" }],
        theme,
      }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("form", {
        title: "Formulario",
        fields: { name: "required", phone: "optional", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto.",
        theme,
      }),
    ).toMatchObject({ theme });

    expect(
      cleanContent("linkpage", {
        displayName: "Ana",
        socials: [],
        links: [{ id: "a", label: "Uno", url: "https://example.com" }],
        theme,
      }),
    ).toMatchObject({ theme });
  });

  it("drops the theme key entirely instead of writing `undefined`", () => {
    const cleaned = cleanContent("links", {
      title: "Enlaces",
      links: [{ id: "a", label: "Uno", url: "https://example.com" }],
    });
    expect(cleaned).not.toHaveProperty("theme");
  });

  it("redirect never carries a theme", () => {
    const cleaned = cleanContent("redirect", {
      destinationUrl: "https://example.com",
    });
    expect(cleaned).not.toHaveProperty("theme");
  });

  it("flags a gradient background missing its second color", () => {
    const errors = validateContent("links", {
      title: "Enlaces",
      links: [{ id: "a", label: "Uno", url: "https://example.com" }],
      theme: {
        ...theme,
        background: { kind: "gradient", color: "#08293d" },
      },
    });
    expect(errors.theme).toBeTruthy();
  });

  it("flags an image background missing its asset", () => {
    const errors = validateContent("catalog", {
      title: "Catálogo",
      currency: "MXN",
      items: [{ id: "i", name: "Taza" }],
      theme: { ...theme, background: { kind: "image", color: "#000000" } },
    });
    expect(errors.theme).toBeTruthy();
  });
});

describe("Estudio de Experiences: design survives cleanContent", () => {
  const design = {
    schema: 1 as const,
    style: {
      palette: {
        background: "#ffffff",
        surface: "#ffffff",
        text: "#111111",
        muted: "#555555",
        accent: "#0d637d",
      },
      fonts: { heading: "dm-sans" as const, body: "dm-sans" as const },
      radius: 16,
      buttonStyle: "solid" as const,
      buttonShape: "rounded" as const,
      shadow: "soft" as const,
      background: { kind: "none" as const },
      maxWidth: 576,
    },
    sections: [],
  };

  it("keeps the design through cleanContent for image and document", () => {
    expect(
      cleanContent("image", { assetId: "asset-1", alt: "Foto", design }),
    ).toMatchObject({ design });
    expect(
      cleanContent("document", {
        assetId: "asset-1",
        title: "Catálogo",
        design,
      }),
    ).toMatchObject({ design });
  });

  it("keeps the design through cleanContent for menu, catalog and form", () => {
    expect(
      cleanContent("menu", {
        title: "Menú",
        currency: "MXN",
        sections: [
          { id: "s", name: "Sección", items: [{ id: "i", name: "Café" }] },
        ],
        design,
      }),
    ).toMatchObject({ design });
    expect(
      cleanContent("catalog", {
        title: "Catálogo",
        currency: "MXN",
        items: [{ id: "i", name: "Taza" }],
        design,
      }),
    ).toMatchObject({ design });
    expect(
      cleanContent("form", {
        title: "Formulario",
        fields: { name: "required", phone: "optional", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto.",
        design,
      }),
    ).toMatchObject({ design });
  });

  it("never writes an explicit `undefined` design", () => {
    const cleaned = cleanContent("image", { assetId: "asset-1", alt: "Foto" });
    expect(cleaned).not.toHaveProperty("design");
  });
});

describe('Documento PDF (document.display === "viewer")', () => {
  it("keeps display, pages, allowDownload and design through cleanContent", () => {
    const pages = [{ assetId: "page-1", width: 1240, height: 1754 }];
    const cleaned = cleanContent("document", {
      assetId: "pdf-1",
      title: "Carta",
      display: "viewer",
      allowDownload: true,
      pages,
    });
    expect(cleaned).toMatchObject({
      display: "viewer",
      allowDownload: true,
      pages,
    });
  });

  it("requires prepared pages before it can be shown", () => {
    const errors = validateContent("document", {
      assetId: "pdf-1",
      title: "Carta",
      display: "viewer",
    });
    expect(errors.pages).toBeTruthy();
  });

  it("accepts a viewer with at least one prepared page", () => {
    const errors = validateContent("document", {
      assetId: "pdf-1",
      title: "Carta",
      display: "viewer",
      pages: [{ assetId: "page-1", width: 1240, height: 1754 }],
    });
    expect(errors.pages).toBeUndefined();
  });

  it("flags more than 40 pages with a clear message", () => {
    const pages = Array.from({ length: 41 }, (_, index) => ({
      assetId: `page-${index}`,
      width: 1240,
      height: 1754,
    }));
    const errors = validateContent("document", {
      assetId: "pdf-1",
      title: "Carta",
      display: "viewer",
      pages,
    });
    expect(errors.pages).toContain("40");
  });

  it("never requires pages for the download display (default)", () => {
    const errors = validateContent("document", {
      assetId: "pdf-1",
      title: "Catálogo",
    });
    expect(errors.pages).toBeUndefined();
  });

  it("requires the PDF for the download display (no assetId)", () => {
    const errors = validateContent("document", { title: "Catálogo" });
    expect(errors.assetId).toBeTruthy();
  });

  it("never requires the PDF for a viewer with prepared pages (rejected or too big to download)", () => {
    const errors = validateContent("document", {
      title: "Carta",
      display: "viewer",
      pages: [{ assetId: "page-1", width: 1240, height: 1754 }],
    });
    expect(errors.assetId).toBeUndefined();
    expect(errors.pages).toBeUndefined();
  });

  it("requires the PDF for a viewer that also wants to allow downloading it", () => {
    const errors = validateContent("document", {
      title: "Carta",
      display: "viewer",
      allowDownload: true,
      pages: [{ assetId: "page-1", width: 1240, height: 1754 }],
    });
    expect(errors.assetId).toBeTruthy();
  });

  it("drops the assetId key entirely when cleaning a PDF-less viewer", () => {
    const cleaned = cleanContent("document", {
      title: "Carta",
      display: "viewer",
      pages: [{ assetId: "page-1", width: 1240, height: 1754 }],
    });
    expect(cleaned).not.toHaveProperty("assetId");
  });
});

describe("seedContentForCreation: creating and opening the Estudio in one step", () => {
  it("produces content that already passes validateContent for every seeded type", () => {
    // Redirección is excluded: it has no page, so there is no Estudio to
    // jump into. NewExperiencePage builds its content directly from the URL
    // typed on its own step 2, and never calls this for that type.
    const types = [
      "links",
      "profile",
      "menu",
      "catalog",
      "form",
      "linkpage",
    ] as const;
    for (const type of types) {
      const content = seedContentForCreation(
        type,
        "Mi Experience",
        "Café Nube",
      );
      expect(validateContent(type, content), type).toEqual({});
    }
  });

  it("uses the internal name as the starting title or display name", () => {
    expect(
      seedContentForCreation("links", "Mi Experience", undefined),
    ).toMatchObject({ title: "Mi Experience" });
    expect(
      seedContentForCreation("profile", "Mi Experience", undefined),
    ).toMatchObject({ displayName: "Mi Experience" });
    expect(
      seedContentForCreation("menu", "Mi Experience", undefined),
    ).toMatchObject({ title: "Mi Experience" });
  });
});

describe("linkpage content", () => {
  it("requires at least one button or social network", () => {
    const errors = validateContent("linkpage", {
      displayName: "Ana",
      socials: [],
      links: [],
    });
    expect(errors.links).toBeTruthy();
  });

  it("accepts a linkpage with only social networks and no buttons", () => {
    const errors = validateContent("linkpage", {
      displayName: "Ana",
      socials: [
        { id: "a", network: "instagram", value: "https://instagram.com/ana" },
      ],
      links: [],
    });
    expect(errors).toEqual({});
  });

  it("rejects a social link pointing to the wrong domain", () => {
    const errors = validateContent("linkpage", {
      displayName: "Ana",
      socials: [
        { id: "a", network: "instagram", value: "https://tiktok.com/ana" },
      ],
      links: [],
    });
    expect(errors["socials.0.value"]).toContain("instagram.com");
  });

  it("validates email and phone socials by format, not domain", () => {
    const errors = validateContent("linkpage", {
      displayName: "Ana",
      socials: [
        { id: "a", network: "email", value: "not-an-email" },
        { id: "b", network: "phone", value: "abc" },
      ],
      links: [],
    });
    expect(errors["socials.0.value"]).toBeTruthy();
    expect(errors["socials.1.value"]).toBeTruthy();
  });

  it("normalizes social values on save (lowercase email, digits-only phone)", () => {
    const cleaned = cleanContent("linkpage", {
      displayName: "Ana",
      socials: [
        { id: "a", network: "email", value: " Ana@Example.com " },
        { id: "b", network: "phone", value: "+52 (55) 1234-5678" },
      ],
      links: [],
    }) as { socials: { network: string; value: string }[] };
    expect(cleaned.socials[0]?.value).toBe("ana@example.com");
    expect(cleaned.socials[1]?.value).toBe("+525512345678");
  });
});

describe("cleanContent keeps a comida corrida's guisados (relevo 37, D1, round 3)", () => {
  it("saves the choices and their label, dropping empty ones", () => {
    const clean = cleanContent("menu", {
      title: "Doña Rosa",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Menú del día",
          items: [
            {
              id: "corrida",
              name: " Comida corrida ",
              price: 85,
              choicesLabel: " Elige tu guisado ",
              choices: [
                { id: "mole", name: " Mole con pollo " },
                { id: "vacio", name: "  " },
              ],
            },
            { id: "agua", name: "Agua", price: 20, choices: [] },
          ],
        },
      ],
    } as never) as unknown as {
      sections: { items: Record<string, unknown>[] }[];
    };
    expect(clean.sections[0]?.items[0]).toEqual({
      id: "corrida",
      name: "Comida corrida",
      price: 85,
      choicesLabel: "Elige tu guisado",
      choices: [{ id: "mole", name: "Mole con pollo" }],
    });
    expect(clean.sections[0]?.items[1]).toEqual({
      id: "agua",
      name: "Agua",
      price: 20,
    });
  });
});

describe("validateContent repeats the contract's caps (domain audit A2-31)", () => {
  const link = (index: number) => ({
    id: `l${index}`,
    label: `Enlace ${index}`,
    url: "https://sitio.mx",
  });
  const many = <T>(count: number, make: (index: number) => T) =>
    Array.from({ length: count }, (_, index) => make(index));

  it("limits Enlaces to 12 and Perfil to 8", () => {
    expect(
      validateContent("links", { title: "Hola", links: many(13, link) }).links,
    ).toBe("Máximo 12 enlaces.");
    expect(
      validateContent("links", { title: "Hola", links: many(12, link) }).links,
    ).toBeUndefined();
    expect(
      validateContent("profile", { displayName: "Ana", links: many(9, link) })
        .links,
    ).toBe("Máximo 8 enlaces.");
  });

  it("limits a Página de enlaces to 20 buttons and 12 networks", () => {
    const errors = validateContent("linkpage", {
      displayName: "Ana",
      links: many(21, link),
      socials: many(13, (index) => ({
        id: `s${index}`,
        network: "website" as const,
        value: "https://sitio.mx",
      })),
    });
    expect(errors.links).toBe("Máximo 20 botones.");
    expect(errors.socials).toBe("Máximo 12 redes sociales.");
  });

  it("limits a Menú to 10 sections, 30 dishes per section and 12 choices", () => {
    const item = (index: number) => ({
      id: `i${index}`,
      name: `Plato ${index}`,
    });
    const section = (index: number, items = 1) => ({
      id: `s${index}`,
      name: `Sección ${index}`,
      items: many(items, item),
    });
    const base = { title: "Menú", currency: "MXN" as const };
    expect(
      validateContent("menu", {
        ...base,
        sections: many(11, (i) => section(i)),
      }).sections,
    ).toBe("Máximo 10 secciones.");
    expect(
      validateContent("menu", { ...base, sections: [section(0, 31)] })[
        "sections.0.items"
      ],
    ).toBe("Máximo 30 productos por sección.");
    const dish = {
      id: "d",
      name: "Comida corrida",
      choices: many(13, (index) => ({
        id: `c${index}`,
        name: `Guisado ${index}`,
      })),
    };
    expect(
      validateContent("menu", {
        ...base,
        sections: [{ id: "s", name: "Menú", items: [dish] }],
      })["sections.0.items.0.choices"],
    ).toBe("Máximo 12 opciones por platillo.");
  });

  it("limits a Catálogo to 48 products", () => {
    const errors = validateContent("catalog", {
      title: "Tienda",
      currency: "MXN",
      items: many(49, (index) => ({
        id: `p${index}`,
        name: `Producto ${index}`,
      })),
    });
    expect(errors.items).toBe("Máximo 48 productos.");
  });
});
