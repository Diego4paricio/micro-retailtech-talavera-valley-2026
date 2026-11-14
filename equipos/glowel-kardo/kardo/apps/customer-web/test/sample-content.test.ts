import type { ExperienceContent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { seedContentForCreation } from "../src/features/experiences/content.js";
import {
  describeSampleIssues,
  findSampleContent,
  isSampleHref,
  isSampleItem,
  isSampleLink,
  isSampleSection,
  sampleText,
} from "../src/features/experiences/sample-content.js";

const menu = (
  sections: { name: string; items: string[] }[],
  design?: unknown,
) =>
  ({
    title: "Menú",
    currency: "MXN",
    sections: sections.map((section, index) => ({
      id: `s${index}`,
      name: section.name,
      items: section.items.map((name, item) => ({
        id: `i${index}-${item}`,
        name,
      })),
    })),
    ...(design ? { design } : {}),
  }) as unknown as ExperienceContent;

describe("findSampleContent (relevo 31, finding 8)", () => {
  it("finds the seed menu's «Sección 1» and «Platillo 1»", () => {
    const issues = findSampleContent(
      "menu",
      menu([{ name: "Sección 1", items: ["Platillo 1", "Chilaquiles"] }]),
    );
    expect(issues.map((issue) => issue.label)).toEqual([
      "Sección 1",
      "Platillo 1",
    ]);
  });

  it("leaves a real menu alone", () => {
    expect(
      findSampleContent(
        "menu",
        menu([
          { name: "Desayunos", items: ["Chilaquiles verdes", "Molletes"] },
        ]),
      ),
    ).toEqual([]);
  });

  it("finds «Producto 1» in a catalog", () => {
    const content = {
      title: "Catálogo",
      currency: "MXN",
      items: [
        { id: "a", name: "Producto 1" },
        { id: "b", name: "Uñas acrílicas" },
      ],
    } as unknown as ExperienceContent;
    expect(findSampleContent("catalog", content)).toEqual([
      { label: "Producto 1", kind: "item" },
    ]);
  });

  it("finds the seed link of Enlaces", () => {
    const content = {
      title: "Enlaces",
      links: [{ id: "a", label: "Mi enlace", url: "https://ejemplo.com" }],
    } as unknown as ExperienceContent;
    expect(findSampleContent("links", content)).toEqual([
      { label: "Mi enlace", kind: "link" },
    ]);
  });

  it("finds a design button with the sample WhatsApp number, on a canvas or in a section", () => {
    const design = {
      schema: 2,
      style: {},
      sections: [
        {
          id: "portada",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "b1",
                kind: "brandButton",
                brand: "whatsapp",
                label: "Pedir por WhatsApp",
                href: "https://wa.me/525555555555",
                look: "brand",
              },
              x: 24,
              y: 300,
              w: 240,
            },
          ],
        },
        {
          id: "cierre",
          layout: "1",
          columns: [
            [
              {
                id: "b2",
                kind: "button",
                label: "Escríbenos",
                href: "https://wa.me/523334567890",
                variant: "primary",
              },
            ],
          ],
        },
      ],
    };
    const issues = findSampleContent(
      "menu",
      menu([{ name: "Tacos", items: ["Pastor"] }], design),
    );
    expect(issues).toEqual([{ label: "Pedir por WhatsApp", kind: "button" }]);
  });
});

describe("a WhatsApp number that is not the business's", () => {
  const design = (href: string) => ({
    schema: 1,
    style: {},
    sections: [
      {
        id: "s",
        layout: "1",
        columns: [
          [
            {
              id: "b",
              kind: "brandButton",
              brand: "whatsapp",
              label: "Pedir por WhatsApp",
              href,
              look: "brand",
            },
          ],
        ],
      },
    ],
  });
  const content = (href: string) =>
    menu([{ name: "Tacos", items: ["Pastor"] }], design(href));

  it("flags another number when the business has one", () => {
    expect(
      findSampleContent(
        "menu",
        content("https://wa.me/525523456789"),
        "https://wa.me/523334567890",
      ),
    ).toEqual([{ label: "Pedir por WhatsApp", kind: "whatsapp" }]);
  });

  it("accepts the business's own number, with or without 52", () => {
    expect(
      findSampleContent(
        "menu",
        content("https://wa.me/3334567890"),
        "https://wa.me/523334567890",
      ),
    ).toEqual([]);
  });

  it("without the business's number, only the sample one is flagged", () => {
    expect(
      findSampleContent("menu", content("https://wa.me/525523456789")),
    ).toEqual([]);
  });

  it("describes it", () => {
    expect(describeSampleIssues([{ label: "Pedir", kind: "whatsapp" }])).toBe(
      "un botón de WhatsApp con un número que no es el tuyo",
    );
  });
});

describe("template rows", () => {
  it("finds «Tu primer servicio» of the Servicios form template", () => {
    const content = {
      title: "Despacho",
      design: {
        schema: 1,
        style: {},
        sections: [
          {
            id: "s",
            layout: "1",
            columns: [
              [
                {
                  id: "f",
                  kind: "features",
                  layout: "list",
                  items: [
                    { icon: "check", title: "Tu primer servicio" },
                    { icon: "check", title: "Declaraciones mensuales" },
                  ],
                },
              ],
            ],
          },
        ],
      },
    } as unknown as ExperienceContent;
    expect(findSampleContent("form", content)).toEqual([
      { label: "Tu primer servicio", kind: "item" },
    ]);
  });
});

describe("describeSampleIssues", () => {
  it("lists what a person sees, in Spanish", () => {
    expect(
      describeSampleIssues([
        { label: "Sección 1", kind: "section" },
        { label: "Platillo 1", kind: "item" },
        { label: "Pedir", kind: "button" },
      ]),
    ).toBe("«Sección 1», «Platillo 1» y un botón con un enlace de ejemplo");
    expect(describeSampleIssues([{ label: "Producto 1", kind: "item" }])).toBe(
      "«Producto 1»",
    );
  });
});

describe("the example texts are defined once (domain audit A2-28)", () => {
  it("every placeholder the seed writes is found again", () => {
    expect(isSampleSection(sampleText.section(1))).toBe(true);
    expect(isSampleItem(sampleText.menuItem(2))).toBe(true);
    expect(isSampleItem(sampleText.catalogItem(3))).toBe(true);
    expect(isSampleLink({ label: sampleText.linkLabel, url: "" })).toBe(true);
    expect(isSampleHref(sampleText.linkUrl)).toBe(true);
    expect(isSampleItem("Concha")).toBe(false);
    expect(isSampleLink({ label: "Reserva", url: "https://mi-sitio.mx" })).toBe(
      false,
    );
  });

  it("findSampleContent flags what seedContentForCreation seeds, for every type", () => {
    for (const type of ["links", "menu", "catalog", "linkpage"] as const) {
      const content = seedContentForCreation(type, "Mi página", undefined);
      expect(findSampleContent(type, content).length, type).toBeGreaterThan(0);
    }
  });
});
