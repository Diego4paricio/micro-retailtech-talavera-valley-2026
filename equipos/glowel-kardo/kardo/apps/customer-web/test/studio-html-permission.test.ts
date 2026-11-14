import {
  DESIGN_LIMITS,
  type DesignBlock,
  type ExperienceContent,
  type PageDesign,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  addBlockToCanvas,
  addCanvasSection,
  copyCanvasItems,
  duplicateCanvasItems,
  pasteCanvasItems,
  removeCanvasItems,
} from "../src/features/studio/model/canvas.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import {
  createIdFactory,
  designIds,
} from "../src/features/studio/model/ids.js";
import {
  addBlockBlocker,
  designCounts,
  designHtmlBlocksChanged,
  duplicateBlockBlocker,
  duplicateSectionBlocker,
  htmlBlockPermissionBlocker,
  htmlBlocksBlocker,
  moveToSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
  saveHtmlBlocksBlocker,
} from "../src/features/studio/model/limits.js";
import {
  addSection,
  createSection,
  insertBlock,
  updateBlock,
} from "../src/features/studio/model/operations.js";

const content: ExperienceContent = {
  title: "Café Nube",
  links: [{ id: "a", label: "Menú", url: "https://cafe.example/menu" }],
};

const code = (id: string, html = "<p>hola</p>"): DesignBlock => ({
  id,
  kind: "html",
  html,
  css: "",
});

/** A links design with two flow sections; the first holds one code block. */
function withCode(): PageDesign {
  let design = designFromContent("links", content);
  const newId = createIdFactory(designIds(design));
  design = addSection(design, createSection(newId));
  const first = design.sections[0];
  if (!first) throw new Error("no section");
  return insertBlock(design, code("code-1"), {
    sectionId: first.id,
    columnIndex: 0,
    index: 0,
  });
}

describe("code blocks need the experiences.custom_html permission (A2-35)", () => {
  it("htmlBlocksBlocker only blocks code blocks, and only without the permission", () => {
    const html = [{ kind: "html" as const }];
    const text = [{ kind: "text" as const }];
    expect(htmlBlocksBlocker(false, html)).toBe(htmlBlockPermissionBlocker);
    expect(htmlBlocksBlocker(true, html)).toBeNull();
    expect(htmlBlocksBlocker(false, text)).toBeNull();
  });

  it("blocks deleting, duplicating and moving a code block", () => {
    const design = withCode();
    const second = design.sections[1]?.id ?? "";
    expect(removeBlockBlocker(design, "links", "code-1", false)).toBe(
      htmlBlockPermissionBlocker,
    );
    expect(duplicateBlockBlocker(design, "links", "code-1", false)).toBe(
      htmlBlockPermissionBlocker,
    );
    expect(moveToSectionBlocker(design, "links", "code-1", second, false)).toBe(
      htmlBlockPermissionBlocker,
    );
    // With the permission, or by default, nothing changes.
    expect(removeBlockBlocker(design, "links", "code-1")).toBeNull();
    expect(removeBlockBlocker(design, "links", "code-1", true)).toBeNull();
    expect(duplicateBlockBlocker(design, "links", "code-1", true)).toBeNull();
    expect(
      moveToSectionBlocker(design, "links", "code-1", second, true),
    ).toBeNull();
  });

  it("blocks removing or copying a section that holds a code block", () => {
    const design = withCode();
    const first = design.sections[0]?.id ?? "";
    const second = design.sections[1]?.id ?? "";
    expect(removeSectionBlocker(design, "links", first, false)).toBe(
      htmlBlockPermissionBlocker,
    );
    expect(duplicateSectionBlocker(design, first, false)).toBe(
      htmlBlockPermissionBlocker,
    );
    expect(removeSectionBlocker(design, "links", second, false)).toBeNull();
    expect(duplicateSectionBlocker(design, second, false)).toBeNull();
    expect(duplicateSectionBlocker(design, first, true)).toBeNull();
  });

  it("blocks adding a code block without the permission", () => {
    const design = withCode();
    const target = { sectionId: design.sections[1]?.id ?? "", columnIndex: 0 };
    expect(addBlockBlocker(design, "links", "html", target, false)).toBe(
      htmlBlockPermissionBlocker,
    );
    expect(addBlockBlocker(design, "links", "html", target, true)).toBeNull();
    expect(addBlockBlocker(design, "links", "text", target, false)).toBeNull();
  });

  it("blocks pasting, duplicating and removing code blocks on a canvas", () => {
    let design = designFromContent("links", content);
    const newId = createIdFactory(designIds(design));
    const added = addCanvasSection(design, newId);
    design = added.design;
    const canvas = { id: added.id };
    design = addBlockToCanvas(design, canvas.id, code("code-c"), {
      x: 100,
      y: 100,
    });
    const items = copyCanvasItems(design, ["code-c"]);
    const ids = createIdFactory(designIds(design));

    const pasted = pasteCanvasItems(
      design,
      "links",
      canvas.id,
      items,
      ids,
      undefined,
      false,
    );
    expect(pasted.ids).toEqual([]);
    expect(pasted.reason).toBe(htmlBlockPermissionBlocker);
    expect(
      pasteCanvasItems(design, "links", canvas.id, items, ids).ids,
    ).toHaveLength(1);

    const duplicated = duplicateCanvasItems(
      design,
      "links",
      ["code-c"],
      ids,
      false,
    );
    expect(duplicated.ids).toEqual([]);
    expect(duplicated.reason).toBe(htmlBlockPermissionBlocker);

    const removed = removeCanvasItems(design, "links", ["code-c"], false);
    expect(removed.removed).toBe(0);
    expect(removed.reason).toBe(htmlBlockPermissionBlocker);
    expect(removeCanvasItems(design, "links", ["code-c"]).removed).toBe(1);
  });
});

describe("saving code blocks (A2-35)", () => {
  it("sees a created, changed, removed or reordered code block", () => {
    const saved = withCode();
    expect(designHtmlBlocksChanged(saved, saved)).toBe(false);
    expect(designHtmlBlocksChanged(null, saved)).toBe(true);
    expect(
      designHtmlBlocksChanged(saved, designFromContent("links", content)),
    ).toBe(true);
    expect(
      designHtmlBlocksChanged(
        saved,
        updateBlock(saved, "code-1", (block) =>
          block.kind === "html" ? { ...block, html: "<b>otro</b>" } : block,
        ),
      ),
    ).toBe(true);
    const second = saved.sections[1]?.id ?? "";
    const two = insertBlock(saved, code("code-2"), {
      sectionId: second,
      columnIndex: 0,
      index: 0,
    });
    // Same blocks in another reading order are a change too.
    const swapped = {
      ...two,
      sections: [...two.sections].reverse(),
    } as PageDesign;
    expect(designHtmlBlocksChanged(two, swapped)).toBe(true);
  });

  it("ignores everything else in the design", () => {
    const saved = withCode();
    const restyled = {
      ...saved,
      style: { ...saved.style, pagePadding: 12 },
    } as PageDesign;
    expect(designHtmlBlocksChanged(saved, restyled)).toBe(false);
  });

  it("stops a save the server would refuse, and says why", () => {
    const saved = withCode();
    const changed = designFromContent("links", content);
    expect(saveHtmlBlocksBlocker(false, saved, changed)).toMatch(
      /Solo quien administra/,
    );
    expect(saveHtmlBlocksBlocker(true, saved, changed)).toBeNull();
    expect(saveHtmlBlocksBlocker(false, saved, saved)).toBeNull();
    // A page that never had code blocks saves freely.
    expect(
      saveHtmlBlocksBlocker(false, null, designFromContent("links", content)),
    ).toBeNull();
  });
});

describe("duplicateSectionBlocker counts like designCounts (A2-43 d)", () => {
  it("counts gallery photos and code blocks of the copy", () => {
    let design = designFromContent("links", content);
    const newId = createIdFactory(designIds(design));
    const section = createSection(newId);
    design = addSection(design, section);
    const gallery: DesignBlock = {
      id: "g1",
      kind: "gallery",
      images: Array.from({ length: DESIGN_LIMITS.images }, (_, index) => ({
        imageRef: `asset-${index}`,
        alt: "",
      })),
    } as unknown as DesignBlock;
    design = insertBlock(design, gallery, {
      sectionId: section.id,
      columnIndex: 0,
      index: 0,
    });
    expect(designCounts(design).images).toBe(DESIGN_LIMITS.images);
    expect(duplicateSectionBlocker(design, section.id)).toMatch(/imágenes/);

    let coded = designFromContent("links", content);
    const target = createSection(createIdFactory(designIds(coded)));
    coded = addSection(coded, target);
    for (let index = 0; index < DESIGN_LIMITS.htmlBlocks; index += 1)
      coded = insertBlock(coded, code(`c-${index}`), {
        sectionId: target.id,
        columnIndex: 0,
        index,
      });
    expect(duplicateSectionBlocker(coded, target.id)).toMatch(/bloques HTML/);
  });
});
