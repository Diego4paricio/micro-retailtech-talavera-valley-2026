import {
  type DesignableExperienceType,
  type DesignBlock,
  designableExperienceTypes,
  type PageDesign,
  sectionBlocks,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  contentHasPhotos,
  contentWithTexts,
  listTitleFor,
  lookTexts,
} from "../src/features/onboarding/first-look.js";
import { firstStepsPlan } from "../src/features/onboarding/first-steps-model.js";
import { logoAccent } from "../src/features/onboarding/logo-color.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import { validateDesign } from "../src/features/studio/model/validate.js";
import { contrast } from "../src/features/studio/templates/first-impression/color.js";
import {
  familyFor,
  firstImpressionDesign,
  looks,
  looksFor,
} from "../src/features/studio/templates/first-impression/index.js";
import {
  balancedWidth,
  initialOf,
  wrapLines,
} from "../src/features/studio/templates/first-impression/text.js";

const menuSections = ["s1", "s2"];

function design(
  type: DesignableExperienceType,
  look: string,
  overrides: Partial<Parameters<typeof firstImpressionDesign>[0]> = {},
): PageDesign {
  return firstImpressionDesign({
    type,
    family: "belleza",
    look,
    accent: "#8e3b4e",
    title: "Estética Brillo",
    phrase: "Nuestros servicios en Puebla",
    listTitle: "Servicios",
    hours: "Martes a sábado, de 10:00 a 19:00",
    city: "Puebla, Puebla",
    whatsappUrl: "https://wa.me/5212221234567",
    profileName: "Estética Brillo",
    profileBio: "Cortes, color y uñas.",
    newId: createIdFactory(["l1", "l2"]),
    ...overrides,
  });
}

const allBlocks = (value: PageDesign): DesignBlock[] =>
  value.sections.flatMap((section) => sectionBlocks(section));

describe("plantillas de primera impresión (relevo 33)", () => {
  it("has at least twenty looks, each with its own name", () => {
    expect(looks.length).toBeGreaterThanOrEqual(20);
    expect(new Set(looks.map((look) => look.id)).size).toBe(looks.length);
    expect(new Set(looks.map((look) => look.name)).size).toBe(looks.length);
  });

  it("makes a design the Estudio accepts for every look and every type", () => {
    for (const look of looks)
      for (const type of designableExperienceTypes) {
        const value = design(type, look.id);
        const issues = validateDesign(
          type,
          value,
          ["l1", "l2"],
          type === "menu" ? menuSections : undefined,
        );
        expect(issues, `${look.id} · ${type}`).toEqual([]);
      }
  });

  it("stays valid with a long name, no phrase, a logo and other colors", () => {
    for (const look of looks)
      for (const accent of ["#f5d76e", "#111111", "#ffffff", "#2563eb"]) {
        const value = design("menu", look.id, {
          accent,
          title: "Antojitos y Cocina Económica La Güera de San Pedro",
          phrase: "",
          logoAssetId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        });
        expect(
          validateDesign("menu", value, [], menuSections),
          `${look.id} · ${accent}`,
        ).toEqual([]);
      }
  });

  it("shows the uploaded logo on every look, also on a PDF, form or image", () => {
    const logo = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    for (const look of looks)
      for (const type of [
        "menu",
        "catalog",
        "document",
        "form",
        "image",
      ] as const) {
        const value = design(type, look.id, { logoAssetId: logo });
        expect(
          allBlocks(value).some(
            (block) => block.kind === "image" && block.imageRef === logo,
          ),
          `${look.id} · ${type}`,
        ).toBe(true);
        expect(
          validateDesign(
            type,
            value,
            ["l1", "l2"],
            type === "menu" ? menuSections : undefined,
          ),
          `${look.id} · ${type}`,
        ).toEqual([]);
      }
  });

  it("uses only what the business gave: no hours or city when it has none", () => {
    const value = design("catalog", "halo", {
      hours: undefined,
      city: undefined,
    });
    expect(allBlocks(value).some((block) => block.kind === "features")).toBe(
      false,
    );
    const withData = design("catalog", "halo");
    const facts = allBlocks(withData).find(
      (block) => block.kind === "features",
    );
    expect(JSON.stringify(facts)).toContain("Martes a sábado");
  });

  it("closes with the business's own WhatsApp, never an example", () => {
    const value = design("menu", "bloque");
    const button = allBlocks(value).find(
      (block) => block.kind === "brandButton",
    );
    expect(button && "href" in button ? button.href : "").toBe(
      "https://wa.me/5212221234567",
    );
    expect(JSON.stringify(value)).not.toContain("5555555555");
    const without = design("menu", "bloque", { whatsappUrl: undefined });
    expect(
      allBlocks(without).some((block) => block.kind === "brandButton"),
    ).toBe(false);
  });

  it("keeps one h1 per page", () => {
    for (const look of looks)
      for (const type of [
        "menu",
        "catalog",
        "document",
        "form",
        "image",
      ] as const) {
        const headings = allBlocks(design(type, look.id)).filter(
          (block) => block.kind === "heading" && block.level === 1,
        );
        expect(headings, `${look.id} · ${type}`).toHaveLength(1);
      }
  });

  it("reads: text on the page and on cards meets 4.5:1 for every accent", () => {
    for (const look of looks)
      for (const accent of ["#f5d76e", "#1f2328", "#2f7a5b", "#e2611b"]) {
        const { palette } = design("menu", look.id, { accent }).style;
        expect(
          contrast(palette.text, palette.background),
          look.id,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette.muted, palette.surface),
          look.id,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(palette.accent, palette.surface),
          look.id,
        ).toBeGreaterThanOrEqual(3);
      }
  });

  it("puts the giro's best looks first and keeps all of them", () => {
    const food = looksFor(familyFor("restaurante"));
    expect(food[0]?.id).toBe("bloque");
    expect(food).toHaveLength(looks.length);
    expect(looksFor(familyFor("belleza"))[0]?.id).toBe("halo");
    expect(familyFor(null)).toBe("otro");
  });
});

describe("text on a canvas", () => {
  it("wraps like the browser and breaks two lines evenly", () => {
    expect(wrapLines("Taquería Don Beto", "cormorant-600", 52, 278)).toBe(2);
    expect(wrapLines("Estética", "outfit-600", 46, 342)).toBe(1);
    const width = balancedWidth("Taquería Don Beto", "cormorant-600", 52, 278);
    expect(width).toBeLessThan(278);
    expect(wrapLines("Taquería Don Beto", "cormorant-600", 52, width)).toBe(2);
  });

  it("takes the monogram from the first real word", () => {
    expect(initialOf("La Esquina del Sabor")).toBe("E");
    expect(initialOf("estética brillo")).toBe("E");
  });
});

describe("«Cómo se ve»: the two texts", () => {
  const plan = firstStepsPlan("belleza");

  it("starts from the page and from what Kardo knows, never a slogan", () => {
    const catalog = lookTexts({
      type: "catalog",
      content: { title: "Servicios", items: [] } as never,
      plan,
      businessName: "Estética Brillo",
      city: "Puebla, Puebla",
    });
    expect(catalog).toEqual({
      title: "Servicios",
      phrase: "Nuestros servicios en Puebla",
    });
    const profile = lookTexts({
      type: "linkpage",
      content: { displayName: "", bio: "Cortes y color" } as never,
      plan,
      businessName: "Estética Brillo",
    });
    expect(profile).toEqual({
      title: "Estética Brillo",
      phrase: "Cortes y color",
    });
    expect(listTitleFor(plan)).toBe("Servicios");
  });

  it("saves them where each page shows them", () => {
    const profile = contentWithTexts(
      "profile",
      { displayName: "Viejo", links: [] } as never,
      { title: "Estética Brillo", phrase: "Estética en Puebla" },
    ) as { displayName: string; headline: string };
    expect(profile.displayName).toBe("Estética Brillo");
    expect(profile.headline).toBe("Estética en Puebla");
    const menu = contentWithTexts(
      "menu",
      { title: "Menú", sections: [] } as never,
      { title: "  ", phrase: "x" },
    ) as { title: string };
    expect(menu.title).toBe("Menú");
  });

  it("shows the photos a menu already has", () => {
    expect(
      contentHasPhotos({
        sections: [{ items: [{ imageAssetId: "a" }] }],
      } as never),
    ).toBe(true);
    expect(contentHasPhotos({ items: [{ name: "x" }] } as never)).toBe(false);
  });
});

describe("«Cómo se ve»: the logo's color", () => {
  const paint = (...areas: [string, number][]) =>
    areas.flatMap(([color, count]) =>
      Array.from({ length: count }, () => [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
        255,
      ]).flat(),
    );

  it("takes the brand color, not the light background or a small detail", () => {
    expect(
      logoAccent(paint(["#6b3fa0", 600], ["#e9d8fd", 300], ["#f6c453", 40])),
    ).toBe("#6b3fa0");
    expect(
      logoAccent(paint(["#0f2a4a", 700], ["#ffffff", 200], ["#c9a24b", 30])),
    ).toBe("#0f2a4a");
    expect(logoAccent(paint(["#f6d5dc", 700], ["#b0305a", 200]))).toBe(
      "#b0305a",
    );
  });

  it("keeps a thin strong letter over a big pastel circle", () => {
    expect(
      logoAccent(paint(["#f6d5dc", 700], ["#b0305a", 20], ["#d88aa0", 30])),
    ).toBe("#b0305a");
    // Only pastel: the pastel, which each look then darkens to read.
    expect(logoAccent(paint(["#f6d5dc", 700], ["#ffffff", 100]))).toBe(
      "#f6d5dc",
    );
  });

  it("gives none for a black, white or gray logo, or a see-through one", () => {
    expect(
      logoAccent(paint(["#111111", 500], ["#ffffff", 500], ["#888888", 100])),
    ).toBeNull();
    expect(logoAccent(new Array(400).fill(0))).toBeNull();
  });
});
