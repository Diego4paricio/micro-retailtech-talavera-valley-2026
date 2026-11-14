import {
  checkDesign,
  type DesignableExperienceType,
  designableExperienceTypes,
  isCanvasSection,
  PageDesignSchema,
  sectionBlocks,
} from "@kardo/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  kardoTemplates,
  templatesFor,
} from "../src/features/studio/templates/index.js";

// `PageDesignSchema` uses the `uri` format (for `https://` fields). TypeBox's
// `Value.Check` does not ship format validators, so an unregistered format
// makes every check fail with "Unknown format". Register the same
// permissive shape check the customer-api uses in
// services/customer-api/src/validation/formats.ts.
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });
}

const approvedGiros = [
  "restaurante",
  "café",
  "florería",
  "tienda",
  "salón",
  "inmobiliaria",
  "profesional",
  "hotel",
  "eventos",
  "escuela",
];

const dashPattern = /[–—]/; // en dash (–) and em dash (—)

/** Every block of a design, flow or canvas (addendum 3 templates may mix
 * both: a canvas cover followed by flow sections). */
function allBlocks(template: (typeof kardoTemplates)[number]) {
  return template.design.sections.flatMap(sectionBlocks);
}

function allTexts(template: (typeof kardoTemplates)[number]): string[] {
  const texts: string[] = [template.name, template.description];
  for (const block of allBlocks(template)) {
    if (block.kind === "heading") texts.push(block.text);
    if (block.kind === "text")
      for (const run of block.runs) texts.push(run.text);
    if (block.kind === "button") texts.push(block.label);
  }
  return texts;
}

function allIds(template: (typeof kardoTemplates)[number]): string[] {
  const ids: string[] = [];
  for (const section of template.design.sections) {
    ids.push(section.id);
    for (const block of sectionBlocks(section)) ids.push(block.id);
  }
  return ids;
}

describe("kardoTemplates", () => {
  it("ships at least 30 templates (20 base + addendum 3's new types and covers)", () => {
    expect(kardoTemplates.length).toBeGreaterThanOrEqual(30);
    expect(kardoTemplates.length).toBeLessThanOrEqual(45);
  });

  it("has unique template ids", () => {
    const ids = new Set(kardoTemplates.map((t) => t.id));
    expect(ids.size).toBe(kardoTemplates.length);
  });

  it("covers every approved giro at least once", () => {
    const giros = new Set(kardoTemplates.map((t) => t.giro));
    for (const giro of approvedGiros) expect(giros.has(giro)).toBe(true);
  });

  it("only uses approved giros", () => {
    for (const template of kardoTemplates)
      expect(approvedGiros.includes(template.giro), template.id).toBe(true);
  });

  it("never limits itself to restaurante: every new type spans more than one giro", () => {
    const newTypes: DesignableExperienceType[] = [
      "menu",
      "catalog",
      "form",
      "document",
      "image",
    ];
    for (const type of newTypes) {
      const giros = new Set(
        kardoTemplates
          .filter((template) => template.types.includes(type))
          .map((template) => template.giro),
      );
      expect(giros.size, type).toBeGreaterThanOrEqual(2);
    }
  });

  it("declares at least one designable type per template", () => {
    for (const template of kardoTemplates)
      expect(template.types.length, template.id).toBeGreaterThan(0);
  });

  it("every design passes the PageDesign schema", () => {
    for (const template of kardoTemplates) {
      const errors = [...Value.Errors(PageDesignSchema, template.design)];
      expect(
        errors,
        `${template.id}: ${JSON.stringify(errors.slice(0, 3))}`,
      ).toHaveLength(0);
      expect(Value.Check(PageDesignSchema, template.design), template.id).toBe(
        true,
      );
    }
  });

  it("every design passes checkDesign for each type it declares", () => {
    for (const template of kardoTemplates) {
      for (const type of template.types) {
        const issues = checkDesign(type, template.design, []);
        expect(
          issues,
          `${template.id} as ${type}: ${JSON.stringify(issues)}`,
        ).toHaveLength(0);
      }
    }
  });

  it("marks a design schema 2 exactly when it has a canvas section", () => {
    for (const template of kardoTemplates) {
      const hasCanvas = template.design.sections.some(isCanvasSection);
      expect(template.design.schema, template.id).toBe(hasCanvas ? 2 : 1);
    }
  });

  it("gives every canvas-cover template auto ambient and a 20px page padding", () => {
    for (const template of kardoTemplates) {
      if (!template.design.sections.some(isCanvasSection)) continue;
      expect(template.design.style.pagePadding, template.id).toBe(20);
      expect(template.design.style.ambient?.kind ?? "auto", template.id).toBe(
        "auto",
      );
    }
  });

  it("has section and block ids unique within each design, prefixed to avoid content collisions", () => {
    for (const template of kardoTemplates) {
      const ids = allIds(template);
      expect(new Set(ids).size, template.id).toBe(ids.length);
      for (const id of ids)
        expect(id.startsWith("t-"), `${template.id}: ${id}`).toBe(true);
    }
  });

  it("never uses an em dash or en dash in copy", () => {
    for (const template of kardoTemplates) {
      for (const text of allTexts(template)) {
        expect(dashPattern.test(text), `${template.id}: "${text}"`).toBe(false);
      }
    }
  });

  it("never mentions reservations, online ordering, payment or stock claims", () => {
    const bannedWords = [
      "reserva",
      "reservación",
      "ordena en línea",
      "compra ahora",
      "pagar en línea",
      "en stock",
      "envío gratis",
    ];
    for (const template of kardoTemplates) {
      const haystack = allTexts(template).join(" ").toLowerCase();
      for (const word of bannedWords)
        expect(haystack.includes(word), `${template.id}: "${word}"`).toBe(
          false,
        );
      expect(/\$\d/.test(haystack), template.id).toBe(false);
    }
  });

  it("every button href is an https WhatsApp placeholder", () => {
    for (const template of kardoTemplates) {
      for (const block of allBlocks(template)) {
        if (block.kind === "button")
          expect(block.href.startsWith("https://wa.me/"), template.id).toBe(
            true,
          );
      }
    }
  });

  it("never ships a free image block or an image page/section background (no template can carry a real asset id)", () => {
    for (const template of kardoTemplates) {
      for (const block of allBlocks(template))
        expect(block.kind, template.id).not.toBe("image");
      expect(template.design.style.background.kind, template.id).not.toBe(
        "image",
      );
      for (const section of template.design.sections)
        expect(section.background?.kind, template.id).not.toBe("image");
    }
  });
});

describe("templatesFor", () => {
  it("returns only templates that declare the requested type", () => {
    for (const type of designableExperienceTypes) {
      const matches = templatesFor(type);
      expect(matches.length).toBeGreaterThan(0);
      for (const template of matches)
        expect(template.types.includes(type), template.id).toBe(true);
    }
  });

  it("covers every designable type across the library", () => {
    const covered = new Set<DesignableExperienceType>();
    for (const template of kardoTemplates)
      for (const type of template.types) covered.add(type);
    for (const type of designableExperienceTypes)
      expect(covered.has(type), type).toBe(true);
  });

  it("gives every new addendum-3 type at least two templates", () => {
    for (const type of [
      "menu",
      "catalog",
      "form",
      "document",
      "image",
    ] as const) {
      expect(templatesFor(type).length, type).toBeGreaterThanOrEqual(2);
    }
  });
});
