import {
  DESIGN_LIMITS,
  designBlocks,
  type ExperienceContent,
  type PageDesign,
} from "@kardo/contracts";
import { prepareCustomHtml } from "@kardo/page-render";
import { describe, expect, it } from "vitest";
import { liteHtmlParser } from "../src/features/studio/html/dom-lite.js";
import { designToCustomCode } from "../src/features/studio/html/from-design.js";
import { customCodeToDesign } from "../src/features/studio/html/to-design.js";
import { createBlock } from "../src/features/studio/model/blocks.js";
import { contentItemIds } from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import {
  createIdFactory,
  designIds,
} from "../src/features/studio/model/ids.js";
import {
  insertBlock,
  locateBlock,
} from "../src/features/studio/model/operations.js";

/**
 * Bloques ↔ HTML sync (ADR 018 addendum, 2026-10): `designToCustomCode`
 * (Bloques → HTML) and `customCodeToDesign` (HTML → Bloques), for the three
 * types with a full-page modo HTML (here: "links"). Always uses the lite
 * parser directly, so results never depend on whether a test environment
 * happens to have `DOMParser`.
 */

const content: ExperienceContent = {
  title: "Café Luna",
  links: [
    { id: "l1", label: "Menú", url: "https://cafeluna.example/menu" },
    { id: "l2", label: "WhatsApp", url: "https://wa.me/525500000000" },
  ],
};

/** contentTitle, heading, contentLinks, button — in that order, one column. */
function buildDesign(): PageDesign {
  const base = designFromContent("links", content);
  const sectionId = base.sections[0]?.id ?? "";
  const factory = createIdFactory(designIds(base));
  const heading = createBlock("heading", factory);
  const button = {
    ...createBlock("button", factory),
    href: "https://cafeluna.example/reserva",
    label: "Reserva una mesa",
  };
  let design = insertBlock(base, heading, {
    sectionId,
    columnIndex: 0,
    index: 0,
  });
  design = insertBlock(design, button, {
    sectionId,
    columnIndex: 0,
    index: design.sections[0]?.columns[0]?.length ?? 0,
  });
  return design;
}

function blockIdOf(design: PageDesign, kind: string): string {
  const block = designBlocks(design).find((b) => b.kind === kind);
  if (!block) throw new Error(`no ${kind} block in the fixture design`);
  return block.id;
}

/** Replaces one generated element (matched by its `data-block-id`) with a
 * hand-written replacement, the same way a person would edit it in the code
 * editor. */
function replaceElement(
  html: string,
  blockId: string,
  tag: string,
  replacement: string,
): string {
  const pattern = new RegExp(
    `<${tag} data-block-id="${blockId}"[^>]*>.*?</${tag}>`,
    "s",
  );
  const next = html.replace(pattern, replacement);
  if (next === html) throw new Error(`could not find <${tag}> ${blockId}`);
  return next;
}

function removeElement(html: string, blockId: string, tag: string): string {
  const pattern = new RegExp(
    `<${tag} data-block-id="${blockId}"[^>]*>.*?</${tag}>\\n?`,
    "s",
  );
  const next = html.replace(pattern, "");
  if (next === html) throw new Error(`could not find <${tag}> ${blockId}`);
  return next;
}

describe("designToCustomCode (Bloques → HTML)", () => {
  it("renders live widgets for bound content, keeps data-block-id, keeps the ambient background (as position:absolute) and drops @font-face, and passes the cleaner untouched", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const linksId = blockIdOf(design, "contentLinks");
    const titleId = blockIdOf(design, "contentTitle");
    const headingId = blockIdOf(design, "heading");
    const buttonId = blockIdOf(design, "button");

    expect(generated.html).toContain("<kardo-links></kardo-links>");
    expect(generated.html).toContain(`data-block-id="${linksId}"`);
    expect(generated.html).toContain(`data-block-id="${titleId}"`);
    expect(generated.html).toContain(`data-block-id="${headingId}"`);
    expect(generated.html).toContain(`data-block-id="${buttonId}"`);
    // The blurred backdrop survives (addendum: "no se trae el fondo de el de
    // bloques"): the marker div, its own rules and `.kd-page`'s own
    // position/overflow are all kept, `position:fixed` rewritten first
    // (the cleaner always strips `fixed`/`sticky` outright).
    expect(generated.html).toContain('<div class="kd-ambient"');
    expect(generated.css).toContain(".kd-ambient");
    expect(generated.css).not.toMatch(/position:\s*fixed/);
    expect(generated.css).toContain("position:absolute");
    expect(generated.css).toContain("position:relative");
    expect(generated.css).toContain("overflow:hidden");
    expect(generated.css).not.toContain("@font-face");

    const prepared = prepareCustomHtml(generated);
    expect(prepared.report.removedTags).toEqual({});
    expect(prepared.report.removedAttributes).toEqual({});
    expect(prepared.report.removedCssRules).toBe(0);
    expect(prepared.report.removedCss).toEqual({});
    expect(prepared.report.blockedLinks).toBe(0);
    expect(prepared.report.blockedImages).toBe(0);
    // The sanitizer never strips `.kd-ambient`'s background or glows either.
    expect(prepared.html).toContain("kd-ambient");
    expect(prepared.css).toContain("kd-ambient");
    expect(prepared.css).not.toMatch(/position:\s*fixed/);
  });

  it("widgetizes profileHeader and contentSocials too (linkpage)", () => {
    const linkContent: ExperienceContent = {
      displayName: "Café Luna",
      socials: [{ id: "s1", network: "instagram", value: "cafeluna" }],
      links: [{ id: "l1", label: "Menú", url: "https://cafeluna.example" }],
    };
    const design = designFromContent("linkpage", linkContent);
    const generated = designToCustomCode("linkpage", linkContent, design);
    expect(generated.html).toContain("<kardo-profile></kardo-profile>");
    expect(generated.html).toContain("<kardo-socials></kardo-socials>");
    expect(generated.html).toContain("<kardo-links></kardo-links>");
  });
});

describe("customCodeToDesign (HTML → Bloques)", () => {
  it("changes nothing when the edited code matches the generated code", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      generated,
      liteHtmlParser(),
    );
    expect(result.design).toBe(design);
    expect(result.changedBlocks).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("turns a changed free block into an html block in place, with just its own CSS", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const headingId = blockIdOf(design, "heading");
    const buttonId = blockIdOf(design, "button");
    const editedHtml = replaceElement(
      generated.html,
      headingId,
      "h2",
      `<h2 data-block-id="${headingId}" class="kd-heading mi-titulo">Bienvenido a Café Luna</h2>`,
    );
    const editedCss = `${generated.css}\n.mi-titulo {\n  color: #ff0000;\n}\n`;

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: editedCss },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([
      { blockId: headingId, action: "changed" },
    ]);
    const changed = locateBlock(result.design, headingId);
    expect(changed?.block.kind).toBe("html");
    if (changed?.block.kind === "html") {
      expect(changed.block.html).toContain("Bienvenido a Café Luna");
      expect(changed.block.html).toContain("mi-titulo");
      expect(changed.block.css).toContain(".mi-titulo");
      expect(changed.block.css).toContain("color: #ff0000");
    }
    // Every untouched block keeps its kind and place.
    expect(locateBlock(result.design, buttonId)?.block.kind).toBe("button");
    expect(
      locateBlock(result.design, blockIdOf(design, "contentLinks"))?.block.kind,
    ).toBe("contentLinks");
  });

  it("adds a brand-new html block where an element with no data-block-id appears", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const titleId = blockIdOf(design, "contentTitle");
    const editedHtml = generated.html.replace(
      new RegExp(`(<div data-block-id="${titleId}")`),
      `<p>Promoción de temporada</p>\n$1`,
    );

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toHaveLength(1);
    expect(result.changedBlocks[0]?.action).toBe("added");
    const addedId = result.changedBlocks[0]?.blockId ?? "";
    const added = locateBlock(result.design, addedId);
    expect(added?.block.kind).toBe("html");
    if (added?.block.kind === "html")
      expect(added.block.html).toContain("Promoción de temporada");
    // Inserted right before contentTitle, in document order.
    const titleAt = locateBlock(result.design, titleId);
    if (added?.on === "flow" && titleAt?.on === "flow")
      expect(added.blockIndex).toBe(titleAt.blockIndex - 1);
    else throw new Error("expected both blocks on the flow section");
  });

  it("removes a block whose markup is missing from the edited html", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const buttonId = blockIdOf(design, "button");
    const editedHtml = removeElement(generated.html, buttonId, "a");

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([
      { blockId: buttonId, action: "removed" },
    ]);
    expect(locateBlock(result.design, buttonId)).toBeNull();
  });

  it("keeps a required bound block when its markup is removed, with a note, instead of deleting it", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const linksId = blockIdOf(design, "contentLinks");
    const editedHtml = removeElement(generated.html, linksId, "div");

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([]);
    expect(result.notes.some((note) => note.includes("Enlaces"))).toBe(true);
    expect(locateBlock(result.design, linksId)?.block.kind).toBe(
      "contentLinks",
    );
  });

  it("never turns a bound block's own content changes into html — it stays live, with a note", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const titleId = blockIdOf(design, "contentTitle");
    const editedHtml = replaceElement(
      generated.html,
      titleId,
      "div",
      `<div data-block-id="${titleId}" class="kd-content-title"><h1 class="kd-heading">Otro nombre</h1></div>`,
    );

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([]);
    expect(
      result.notes.some((note) => note.includes("ligado a tu plataforma")),
    ).toBe(true);
    expect(locateBlock(result.design, titleId)?.block.kind).toBe(
      "contentTitle",
    );
  });

  it("does not convert a changed block whose html passes the per-block size limit", () => {
    const design = buildDesign();
    const generated = designToCustomCode("links", content, design);
    const headingId = blockIdOf(design, "heading");
    const hugeText = "x".repeat(DESIGN_LIMITS.htmlBlockHtml + 1);
    const editedHtml = replaceElement(
      generated.html,
      headingId,
      "h2",
      `<h2 data-block-id="${headingId}" class="kd-heading">${hugeText}</h2>`,
    );

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([]);
    expect(result.notes.some((note) => note.includes("límite"))).toBe(true);
    expect(locateBlock(result.design, headingId)?.block.kind).toBe("heading");
  });

  it("does not convert past the maximum number of html blocks per design", () => {
    let design = buildDesign();
    const sectionId = design.sections[0]?.id ?? "";
    const factory = createIdFactory(designIds(design));
    for (let i = 0; i < DESIGN_LIMITS.htmlBlocks; i += 1) {
      const block = { ...createBlock("html", factory), html: `<p>b${i}</p>` };
      design = insertBlock(design, block, {
        sectionId,
        columnIndex: 0,
        index: design.sections[0]?.columns[0]?.length ?? 0,
      });
    }
    const generated = designToCustomCode("links", content, design);
    const headingId = blockIdOf(design, "heading");
    const editedHtml = replaceElement(
      generated.html,
      headingId,
      "h2",
      `<h2 data-block-id="${headingId}" class="kd-heading">Nuevo texto</h2>`,
    );

    const result = customCodeToDesign(
      "links",
      design,
      contentItemIds(content),
      generated,
      { html: editedHtml, css: generated.css },
      liteHtmlParser(),
    );

    expect(result.changedBlocks).toEqual([]);
    expect(result.notes.some((note) => note.includes("máximo"))).toBe(true);
    expect(locateBlock(result.design, headingId)?.block.kind).toBe("heading");
  });
});
