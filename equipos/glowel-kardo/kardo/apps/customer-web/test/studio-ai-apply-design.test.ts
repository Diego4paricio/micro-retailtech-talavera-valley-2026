import {
  type DesignBlock,
  designBlocks,
  designHtmlBlocks,
  type ExperienceContent,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  type AiApplyState,
  aiApplyNoticeOf,
  aiApplyReducer,
  aiApplyUndoTarget,
  applyAiResult,
  idleAiApply,
  prepareGeneratedDesign,
} from "../src/features/studio/ai/apply-design.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import { insertBlock } from "../src/features/studio/model/operations.js";

const content: ExperienceContent = {
  title: "Café Nube",
  description: "Todo a un toque",
  links: [{ id: "a", label: "Menú", url: "https://cafe.example/menu" }],
  theme: {
    background: { kind: "solid", color: "#ffffff" },
    surface: "light",
    accent: "#0a6c78",
    buttonStyle: "solid",
    font: "sans",
  },
};

function designWithHtmlBlocks(count: number) {
  let design = designFromContent("links", content);
  const sectionId = design.sections[0]?.id ?? "";
  const newId = createIdFactory([]);
  for (let index = 0; index < count; index += 1)
    design = insertBlock(
      design,
      { id: newId("b"), kind: "html", html: `<p>${index}</p>`, css: "" },
      { sectionId, columnIndex: 0, index: 0 },
    );
  return design;
}

describe("prepareGeneratedDesign", () => {
  it("keeps a design with no html blocks untouched either way", () => {
    const design = designFromContent("links", content);
    expect(prepareGeneratedDesign(design, true)).toEqual({
      design,
      removedHtmlBlocks: 0,
      keptHtmlBlocks: 0,
    });
    expect(prepareGeneratedDesign(design, false)).toEqual({
      design,
      removedHtmlBlocks: 0,
      keptHtmlBlocks: 0,
    });
  });

  it("keeps html blocks when the person may edit them", () => {
    const design = designWithHtmlBlocks(2);
    const result = prepareGeneratedDesign(design, true);
    expect(result.removedHtmlBlocks).toBe(0);
    expect(designHtmlBlocks(result.design)).toHaveLength(2);
  });

  it("drops every html block when the person may not edit them", () => {
    const design = designWithHtmlBlocks(2);
    const result = prepareGeneratedDesign(design, false);
    expect(result.removedHtmlBlocks).toBe(2);
    expect(designHtmlBlocks(result.design)).toHaveLength(0);
    // Every other block the design had is untouched.
    const kinds = (blocks: readonly DesignBlock[]) =>
      blocks.map((block) => block.kind).sort();
    expect(kinds(designBlocks(result.design))).toEqual(
      kinds(designBlocks(design).filter((block) => block.kind !== "html")),
    );
  });
});

describe("prepareGeneratedDesign keeps the page's own code blocks (A2-35)", () => {
  it("keeps the blocks the page had, unchanged, when the person may not edit them", () => {
    const current = designWithHtmlBlocks(2);
    const generated = designFromContent("links", content);
    const result = prepareGeneratedDesign(generated, false, current);
    expect(result.keptHtmlBlocks).toBe(2);
    expect(result.removedHtmlBlocks).toBe(0);
    const signature = (design: typeof current) =>
      designHtmlBlocks(design).map(({ id, html, css }) => ({ id, html, css }));
    expect(signature(result.design)).toEqual(signature(current));
  });

  it("drops the blocks the AI made and keeps the page's", () => {
    const current = designWithHtmlBlocks(1);
    const generated = designWithHtmlBlocks(3);
    const result = prepareGeneratedDesign(generated, false, current);
    expect(result.removedHtmlBlocks).toBe(3);
    expect(result.keptHtmlBlocks).toBe(1);
    expect(designHtmlBlocks(result.design).map((block) => block.id)).toEqual(
      designHtmlBlocks(current).map((block) => block.id),
    );
  });

  it("replaces them when the person may edit them", () => {
    const current = designWithHtmlBlocks(2);
    const generated = designFromContent("links", content);
    const result = prepareGeneratedDesign(generated, true, current);
    expect(designHtmlBlocks(result.design)).toHaveLength(0);
    expect(result.keptHtmlBlocks).toBe(0);
  });

  it("applyAiResult keeps them and says so", () => {
    const current = designWithHtmlBlocks(1);
    let applied = current;
    const message = applyAiResult(
      { design: designFromContent("links", content), itemPhotos: [] },
      {
        canEditHtml: false,
        currentDesign: current,
        change: (recipe) => {
          applied = recipe(applied);
        },
        changeContent: () => undefined,
      },
    );
    expect(designHtmlBlocks(applied)).toHaveLength(1);
    expect(message).toMatch(/Tus bloques de código se quedaron/);
  });
});

// ---------------------------------------------------------------------------
// "Usar este diseño" guarda, con reintento y Deshacer (relevo 37, B3c/B3d):
// a pure model of apply → save → undo, with a plain string standing in for
// the Estudio's `{ design, content }` draft.
// ---------------------------------------------------------------------------

describe("aiApplyReducer", () => {
  it("starts idle", () => {
    expect(idleAiApply<string>()).toEqual({ phase: "idle" });
  });

  it("goes pending on apply, then saved once the save settles", () => {
    const applied = aiApplyReducer<string>(idleAiApply(), {
      type: "apply",
      before: "antes",
    });
    expect(applied).toEqual({
      phase: "pending",
      before: "antes",
      mode: "apply",
    });
    const saved = aiApplyReducer(applied, { type: "save-settled", ok: true });
    expect(saved).toEqual({ phase: "saved", before: "antes" });
  });

  it("goes to error when the save fails, and retry tries again", () => {
    const applied = aiApplyReducer<string>(idleAiApply(), {
      type: "apply",
      before: "antes",
    });
    const failed = aiApplyReducer(applied, {
      type: "save-settled",
      ok: false,
    });
    expect(failed).toEqual({
      phase: "error",
      before: "antes",
      mode: "apply",
    });
    const retried = aiApplyReducer(failed, { type: "retry" });
    expect(retried).toEqual({
      phase: "pending",
      before: "antes",
      mode: "apply",
    });
    expect(aiApplyReducer(retried, { type: "save-settled", ok: true })).toEqual(
      { phase: "saved", before: "antes" },
    );
  });

  it("ignores retry and undo outside of error/saved", () => {
    const idle = idleAiApply<string>();
    expect(aiApplyReducer(idle, { type: "retry" })).toBe(idle);
    expect(aiApplyReducer(idle, { type: "undo" })).toBe(idle);
    const pending: AiApplyState<string> = {
      phase: "pending",
      before: "antes",
      mode: "apply",
    };
    expect(aiApplyReducer(pending, { type: "retry" })).toBe(pending);
    expect(aiApplyReducer(pending, { type: "undo" })).toBe(pending);
  });

  it("deshacer vuelve al diseño anterior y guarda, luego queda idle", () => {
    const saved: AiApplyState<string> = { phase: "saved", before: "antes" };
    const undoing = aiApplyReducer(saved, { type: "undo" });
    expect(undoing).toEqual({
      phase: "pending",
      before: "antes",
      mode: "undo",
    });
    expect(aiApplyReducer(undoing, { type: "save-settled", ok: true })).toEqual(
      { phase: "idle" },
    );
  });

  it("a failed undo stays as error, with before still there to retry", () => {
    const saved: AiApplyState<string> = { phase: "saved", before: "antes" };
    const undoing = aiApplyReducer(saved, { type: "undo" });
    const failed = aiApplyReducer(undoing, {
      type: "save-settled",
      ok: false,
    });
    expect(failed).toEqual({ phase: "error", before: "antes", mode: "undo" });
  });
});

describe("aiApplyUndoTarget", () => {
  it("is the draft to restore once saved or stuck, else null", () => {
    expect(aiApplyUndoTarget(idleAiApply<string>())).toBeNull();
    expect(
      aiApplyUndoTarget({
        phase: "pending",
        before: "antes",
        mode: "apply",
      }),
    ).toBeNull();
    expect(aiApplyUndoTarget({ phase: "saved", before: "antes" })).toBe(
      "antes",
    );
    expect(
      aiApplyUndoTarget({ phase: "error", before: "antes", mode: "apply" }),
    ).toBe("antes");
  });
});

describe("aiApplyNoticeOf", () => {
  it("hides the rail's banner while idle", () => {
    expect(aiApplyNoticeOf(idleAiApply<string>(), true)).toBeNull();
  });

  it("says it's saving while pending", () => {
    const pending: AiApplyState<string> = {
      phase: "pending",
      before: "antes",
      mode: "apply",
    };
    expect(aiApplyNoticeOf(pending, true)).toEqual({ kind: "saving" });
  });

  it("carries whether the page is already live into the saved notice", () => {
    const saved: AiApplyState<string> = { phase: "saved", before: "antes" };
    expect(aiApplyNoticeOf(saved, true)).toEqual({
      kind: "saved",
      live: true,
    });
    expect(aiApplyNoticeOf(saved, false)).toEqual({
      kind: "saved",
      live: false,
    });
  });

  it("says customers already see it once it is published (round 3)", () => {
    const saved: AiApplyState<string> = { phase: "saved", before: "antes" };
    expect(aiApplyNoticeOf(saved, true, true)).toEqual({ kind: "published" });
    expect(aiApplyNoticeOf(saved, true, false)).toEqual({
      kind: "saved",
      live: true,
    });
  });

  it("flags the error regardless of live", () => {
    const failed: AiApplyState<string> = {
      phase: "error",
      before: "antes",
      mode: "apply",
    };
    expect(aiApplyNoticeOf(failed, true)).toEqual({ kind: "error" });
  });
});
