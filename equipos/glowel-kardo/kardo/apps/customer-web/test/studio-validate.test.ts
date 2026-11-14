import {
  DESIGN_LIMITS,
  type ExperienceContent,
  type PageDesign,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { createBlock } from "../src/features/studio/model/blocks.js";
import { contentItemIds } from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import {
  insertBlock,
  updateBlock,
  updateStyle,
} from "../src/features/studio/model/operations.js";
import { prepareDesign } from "../src/features/studio/model/prepare.js";
import {
  issuesFor,
  validateDesign,
} from "../src/features/studio/model/validate.js";

const content: ExperienceContent = {
  displayName: "Ana",
  links: [{ id: "l1", label: "Sitio", url: "https://ana.example" }],
};

function withBlock(kind: Parameters<typeof createBlock>[0]) {
  const design = designFromContent("profile", content);
  const block = createBlock(
    kind,
    createIdFactory(["x"], () => "nuevo"),
  );
  const sectionId = design.sections[0]?.id ?? "";
  return {
    block,
    design: insertBlock(design, block, { sectionId, columnIndex: 0, index: 0 }),
  };
}

describe("studio validation", () => {
  it("accepts a design built from the content", () => {
    const design = designFromContent("profile", content);
    expect(validateDesign("profile", design, contentItemIds(content))).toEqual(
      [],
    );
  });

  it("asks for the picture of a new image block, on that block", () => {
    const { design, block } = withBlock("image");
    const issues = validateDesign("profile", design, ["l1"]);
    expect(issuesFor(issues, { blockId: block.id })).toEqual([
      expect.objectContaining({
        area: "block",
        field: "imageRef",
        message: "Elige una imagen de tu biblioteca.",
      }),
    ]);
  });

  it("explains missing and unsafe button links in Spanish", () => {
    const { design, block } = withBlock("button");
    expect(validateDesign("profile", design, [])[0]?.message).toBe(
      "Escribe a dónde lleva el botón.",
    );
    const unsafe = updateBlock(design, block.id, (current) =>
      current.kind === "button"
        ? { ...current, href: "http://sin-cifrar.example" }
        : current,
    );
    expect(validateDesign("profile", unsafe, [])[0]?.message).toMatch(
      /https:\/\//,
    );
    const empty = updateBlock(design, block.id, (current) =>
      current.kind === "button"
        ? { ...current, label: "  ", href: "https://ok.example" }
        : current,
    );
    expect(
      validateDesign("profile", prepareDesign(empty), [])[0]?.message,
    ).toBe("Escribe el texto del botón.");
  });

  it("translates contract rules: required and repeated content blocks", () => {
    const design = designFromContent("profile", content);
    const withoutHeader: PageDesign = {
      ...design,
      sections: design.sections.map((section) => ({
        ...section,
        columns: section.columns.map((column) =>
          column.filter((block) => block.kind !== "profileHeader"),
        ),
      })),
    };
    expect(validateDesign("profile", withoutHeader, [])).toContainEqual(
      expect.objectContaining({
        message: "Tu página necesita «Encabezado del perfil».",
      }),
    );
    const repeated = insertBlock(
      design,
      { id: "links-2", kind: "contentLinks", layout: "grid" },
      { sectionId: design.sections[0]?.id ?? "", columnIndex: 0, index: 99 },
    );
    expect(validateDesign("profile", repeated, [])).toContainEqual(
      expect.objectContaining({
        blockId: "links-2",
        message: "«Enlaces» solo puede aparecer una vez.",
      }),
    );
  });

  it("saves an image background without a picture: it is a photo space", () => {
    const page = updateStyle(
      designFromContent("profile", content),
      (style) => ({
        ...style,
        background: { kind: "image", color: "#000000", overlay: 30 },
      }),
    );
    expect(validateDesign("profile", page, [])).toEqual([]);
    const first = page.sections[0];
    if (!first) throw new Error("no section");
    const section = {
      ...page,
      sections: [
        { ...first, background: { kind: "image" as const, color: "#f4e9dc" } },
        ...page.sections.slice(1),
      ],
    };
    expect(validateDesign("profile", section, [])).toEqual([]);
  });

  it("prepares the saved design: trimmed labels, normalized URLs", () => {
    const { design, block } = withBlock("button");
    const filled = updateBlock(design, block.id, (current) =>
      current.kind === "button"
        ? { ...current, label: "  Reservar ", href: " https://Cafe.example/r " }
        : current,
    );
    const prepared = prepareDesign(filled);
    const saved = prepared.sections[0]?.columns[0]?.[0];
    expect(saved).toMatchObject({
      label: "Reservar",
      href: "https://cafe.example/r",
    });
    expect(validateDesign("profile", prepared, [])).toEqual([]);
  });
});

describe("addendum 3: menu sections, and menu/html block limits", () => {
  const menuContent: ExperienceContent = {
    title: "Menú",
    currency: "MXN",
    sections: [
      { id: "sec-a", name: "A", items: [{ id: "i1", name: "Uno" }] },
      { id: "sec-b", name: "B", items: [{ id: "i2", name: "Dos" }] },
    ],
  };
  const menuIds = contentItemIds(menuContent);
  const menuSectionIds = ["sec-a", "sec-b"];

  it("flags a menu section listed twice on one block", () => {
    const design = designFromContent("menu", menuContent);
    const menuBlockId = design.sections[0]?.columns[0]?.[1]?.id ?? "";
    const withDuplicate = updateBlock(design, menuBlockId, (block) =>
      block.kind === "menu"
        ? { ...block, sectionIds: ["sec-a", "sec-a"] }
        : block,
    );
    const issues = validateDesign(
      "menu",
      withDuplicate,
      menuIds,
      menuSectionIds,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: "Elige cada sección del menú una sola vez.",
      }),
    );
  });

  it("flags a menu block naming a section the menu no longer has", () => {
    const design = designFromContent("menu", menuContent);
    const menuBlockId = design.sections[0]?.columns[0]?.[1]?.id ?? "";
    const withStaleSection = updateBlock(design, menuBlockId, (block) =>
      block.kind === "menu"
        ? { ...block, sectionIds: ["sec-a", "sec-c"] }
        : block,
    );
    const issues = validateDesign(
      "menu",
      withStaleSection,
      menuIds,
      menuSectionIds,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        message:
          "Este bloque muestra una sección que tu menú ya no tiene. Vuelve a elegir las secciones.",
      }),
    );
  });

  it("caps menu blocks and html blocks with a Spanish message naming the limit", () => {
    let design = designFromContent("menu", menuContent);
    const newId = createIdFactory(contentItemIds(menuContent));
    let sectionId = design.sections[0]?.id ?? "";
    for (let index = 0; index < DESIGN_LIMITS.menuBlocks; index += 1)
      design = insertBlock(
        design,
        { id: newId("b"), kind: "menu", layout: "list", photos: "none" },
        { sectionId, columnIndex: 0, index: 0 },
      );
    const menuIssues = validateDesign("menu", design, menuIds, menuSectionIds);
    expect(menuIssues).toContainEqual(
      expect.objectContaining({
        message: `Hay más de ${DESIGN_LIMITS.menuBlocks} bloques de menú.`,
      }),
    );

    let htmlDesign = designFromContent("links", {
      title: "T",
      links: [],
    } as ExperienceContent);
    sectionId = htmlDesign.sections[0]?.id ?? "";
    const htmlId = createIdFactory([]);
    for (let index = 0; index <= DESIGN_LIMITS.htmlBlocks; index += 1)
      htmlDesign = insertBlock(
        htmlDesign,
        { id: htmlId("b"), kind: "html", html: "", css: "" },
        { sectionId, columnIndex: 0, index: 0 },
      );
    const htmlIssues = validateDesign("links", htmlDesign, []);
    expect(htmlIssues).toContainEqual(
      expect.objectContaining({
        message: `Hay más de ${DESIGN_LIMITS.htmlBlocks} bloques HTML.`,
      }),
    );
  });

  it("explains an html block over its character limit in Spanish", () => {
    const { design, block } = withBlock("html");
    const tooLong = updateBlock(design, block.id, (current) =>
      current.kind === "html"
        ? { ...current, html: "x".repeat(DESIGN_LIMITS.htmlBlockHtml + 1) }
        : current,
    );
    const issues = validateDesign("profile", tooLong, []);
    expect(issuesFor(issues, { blockId: block.id })).toContainEqual(
      expect.objectContaining({
        field: "html",
        message: `El HTML admite hasta ${DESIGN_LIMITS.htmlBlockHtml.toLocaleString("es-MX")} caracteres.`,
      }),
    );
  });
});
