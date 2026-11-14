import {
  checkDesign,
  type DesignBlock,
  designBlocks,
  isCanvasSection,
  type PageDesign,
  PageDesignSchema,
} from "@kardo/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { createBrandCircleRow } from "../src/features/studio/model/blocks.js";
import {
  isExampleWhatsApp,
  isWhatsAppButton,
  TEMPLATE_WHATSAPP,
  templateWhatsAppOutcome,
  whatsappNumberLabel,
  withBusinessHours,
  withBusinessWhatsApp,
} from "../src/features/studio/model/business-contact.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import { withOrganizationBrand } from "../src/features/studio/model/organization-brand.js";
import { adaptTemplateDesign } from "../src/features/studio/model/templates.js";
import { validateDesign } from "../src/features/studio/model/validate.js";
import { cafeMenu } from "../src/features/studio/templates/giros/cafe.js";
import { restauranteLinks } from "../src/features/studio/templates/giros/restaurante.js";
import { kardoTemplates } from "../src/features/studio/templates/index.js";

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

const businessWhatsApp = "https://wa.me/523312345678";
const businessHours = "Lun a sáb, 8:00 a 17:00";

/** The sentence under each «Horario» label of a design. */
function hoursTexts(design: PageDesign): string[] {
  const texts: string[] = [];
  for (const section of design.sections) {
    if (isCanvasSection(section)) continue;
    for (const column of section.columns)
      column.forEach((block, index) => {
        const next = column[index + 1];
        if (
          block.kind === "heading" &&
          /^horario$/i.test(block.text) &&
          next?.kind === "text"
        )
          texts.push(next.runs.map((run) => run.text).join(""));
      });
  }
  return texts;
}

const isButton = (block: DesignBlock) =>
  block.kind === "button" || block.kind === "brandButton";

const buttonHrefs = (blocks: DesignBlock[]) =>
  blocks.flatMap((block) =>
    block.kind === "button" || block.kind === "brandButton" ? [block.href] : [],
  );

describe("isExampleWhatsApp", () => {
  it("knows the templates' number, written any usual way", () => {
    expect(isExampleWhatsApp(TEMPLATE_WHATSAPP)).toBe(true);
    expect(isExampleWhatsApp("https://wa.me/5215555555555")).toBe(true);
    expect(isExampleWhatsApp("https://wa.me/5555555555?text=Hola")).toBe(true);
    expect(isExampleWhatsApp(businessWhatsApp)).toBe(false);
    expect(isExampleWhatsApp("https://wa.me/5255555555551")).toBe(false);
  });
});

describe("withBusinessWhatsApp (2026-10-03, finding 5)", () => {
  it("puts the business's number on the café menu's button", () => {
    const design = withBusinessWhatsApp(cafeMenu.design, businessWhatsApp);
    expect(buttonHrefs(designBlocks(design))).toEqual([businessWhatsApp]);
    expect(JSON.stringify(design)).not.toContain("5555555555");
  });

  it("keeps the example's message when it has one", () => {
    const withMessage = structuredClone(cafeMenu.design);
    for (const block of designBlocks(withMessage))
      if (block.kind === "button")
        block.href = `${TEMPLATE_WHATSAPP}?text=Hola%2C%20quiero%20pedir`;
    const design = withBusinessWhatsApp(withMessage, businessWhatsApp);
    expect(buttonHrefs(designBlocks(design))).toEqual([
      `${businessWhatsApp}?text=Hola%2C%20quiero%20pedir`,
    ]);
  });

  it("leaves the button empty, waiting for the number, when there is no phone", () => {
    const design = withBusinessWhatsApp(cafeMenu.design, undefined);
    const blocks = designBlocks(design);
    expect(buttonHrefs(blocks)).toEqual([""]);
    expect(blocks.filter(isWhatsAppButton)).toHaveLength(1);
    expect(design.sections).toHaveLength(cafeMenu.design.sections.length);
  });

  it("an empty WhatsApp button is a pending item: the Estudio does not save", () => {
    const design = withBusinessWhatsApp(
      adaptTemplateDesign(cafeMenu.design, "menu", []),
      undefined,
    );
    const issues = validateDesign("menu", design, []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      field: "href",
      message:
        "Falta tu número de WhatsApp en el botón «Escríbenos por WhatsApp».",
    });
  });

  it("leaves a design without example numbers exactly as it was", () => {
    const own = withBusinessWhatsApp(cafeMenu.design, businessWhatsApp);
    expect(withBusinessWhatsApp(own, undefined)).toBe(own);
  });
});

describe("withBusinessHours (2026-10-03, finding 13)", () => {
  it("puts the business's hours under the restaurant's «Horario»", () => {
    expect(hoursTexts(restauranteLinks.design)).toEqual([
      "Martes a domingo, de la comida a la cena.",
    ]);
    const design = withBusinessHours(restauranteLinks.design, businessHours);
    expect(hoursTexts(design)).toEqual([businessHours]);
  });

  it("takes the example schedule out when the business has none", () => {
    const design = withBusinessHours(restauranteLinks.design, "  ");
    expect(hoursTexts(design)).toEqual([]);
    expect(JSON.stringify(design)).not.toContain("Martes a domingo");
  });
});

describe("every Kardo template through withOrganizationBrand", () => {
  const org = (whatsappUrl?: string, hours?: string) => ({
    name: "Negocio de prueba",
    ...(whatsappUrl ? { whatsappUrl } : {}),
    ...(hours ? { hours } : {}),
  });

  for (const template of kardoTemplates) {
    for (const type of template.types) {
      it(`${template.id} (${type}): the business's WhatsApp or none, never the example`, () => {
        const adapted = adaptTemplateDesign(template.design, type, []);
        const newId = createIdFactory([]);

        const withPhone = withOrganizationBrand(
          adapted,
          type,
          org(businessWhatsApp, businessHours),
          newId,
        );
        expect(JSON.stringify(withPhone)).not.toContain("5555555555");
        for (const href of buttonHrefs(designBlocks(withPhone)))
          expect(href).toBe(businessWhatsApp);
        for (const text of hoursTexts(withPhone))
          expect(text).toBe(businessHours);

        for (const design of [
          withOrganizationBrand(adapted, type, org(), newId),
          withOrganizationBrand(adapted, type, null, newId),
        ]) {
          expect(JSON.stringify(design)).not.toContain("5555555555");
          expect(hoursTexts(design)).toEqual([]);
          // Every pending item is a WhatsApp button waiting for its number;
          // with them filled in, the page saves.
          const waiting = designBlocks(design).filter(
            (block) => isWhatsAppButton(block) && !block.href.trim(),
          );
          const issues = validateDesign(type, design, []);
          expect(issues.map((issue) => issue.blockId).sort()).toEqual(
            waiting.map((block) => block.id).sort(),
          );
          const filled = withBusinessWhatsApp(
            JSON.parse(
              JSON.stringify(design).replaceAll(
                '"href":""',
                `"href":"${TEMPLATE_WHATSAPP}"`,
              ),
            ),
            businessWhatsApp,
          );
          expect(Value.Check(PageDesignSchema, filled)).toBe(true);
          expect(checkDesign(type, filled, [])).toEqual([]);
        }

        expect(templateWhatsAppOutcome(adapted, businessWhatsApp)).toBe(
          designBlocks(adapted).some(isButton) ? "filled" : "none",
        );
      });
    }
  }
});

describe("whatsappNumberLabel", () => {
  it("writes a Mexican number the usual way", () => {
    expect(whatsappNumberLabel(businessWhatsApp)).toBe("33 1234 5678");
    expect(whatsappNumberLabel("https://wa.me/14155550100")).toBe(
      "14155550100",
    );
  });
});

describe("createBrandCircleRow", () => {
  it("starts WhatsApp with the business's number, or empty, never the example", () => {
    const newId = createIdFactory([]);
    const [withPhone] = createBrandCircleRow(newId, businessWhatsApp);
    const [withoutPhone] = createBrandCircleRow(newId);
    expect(withPhone).toMatchObject({
      brand: "whatsapp",
      href: businessWhatsApp,
    });
    expect(withoutPhone).toMatchObject({ brand: "whatsapp", href: "" });
  });
});
