import {
  type DesignBackground,
  type DesignBlock,
  type DesignItemPhoto,
  designBlocks,
  designHtmlBlocks,
  type ExperienceContent,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import { createIdFactory, designIds } from "../model/ids.js";
import {
  addSection,
  createSection,
  findSection,
  insertBlock,
  removeBlock,
} from "../model/operations.js";

/**
 * "Usar este diseño" (the Estudio's AI-in-blocks panel, ADR 018 addendum 3):
 * what actually gets applied when the person accepts a generation. Pure so
 * it is easy to test and so the panel can show the warning ("avísalo antes
 * de aplicarlo") before the one undoable `change()` that applies it.
 *
 * A generated design keeps its `html` blocks only when the person applying
 * it may edit them (`canEditHtml`, same permission the server already used
 * to decide `allowHtmlBlocks` for this very generation) — checked again
 * here so a permission that changed between the request and the click (or
 * a stale client) can never slip code onto the page.
 *
 * Without that permission the page's own `html` blocks (an Administrator's)
 * are kept as they were: the server refuses any save that changes them, and
 * replacing the design would drop them (domain audit A2-35).
 */
export type PreparedGeneratedDesign = {
  design: PageDesign;
  /** `html` blocks the generation had that were dropped. */
  removedHtmlBlocks: number;
  /** The page's own `html` blocks that were kept (no permission to change). */
  keptHtmlBlocks: number;
};

export function prepareGeneratedDesign(
  design: PageDesign,
  canEditHtml: boolean,
  /** The design on the page right now (to keep its `html` blocks). */
  current?: PageDesign | undefined,
): PreparedGeneratedDesign {
  if (canEditHtml) return { design, removedHtmlBlocks: 0, keptHtmlBlocks: 0 };
  const generated = designHtmlBlocks(design);
  const stripped = generated.reduce(
    (next, block) => removeBlock(next, block.id),
    design,
  );
  const own = current ? designHtmlBlocks(current) : [];
  return {
    design: own.length ? withHtmlBlocks(stripped, own) : stripped,
    removedHtmlBlocks: generated.length,
    keptHtmlBlocks: own.length,
  };
}

/** `blocks` at the end of the last flow section (a new one when every
 * section is a canvas), exactly as they were. */
function withHtmlBlocks(
  design: PageDesign,
  blocks: readonly DesignBlock[],
): PageDesign {
  const newId = createIdFactory(designIds(design));
  let next = design;
  let section = [...next.sections]
    .reverse()
    .find((candidate) => !isCanvasSection(candidate));
  if (!section) {
    section = createSection(newId);
    next = addSection(next, section);
  }
  for (const block of blocks) {
    const target = findSection(next, section.id);
    const index =
      target && !isCanvasSection(target) ? (target.columns[0]?.length ?? 0) : 0;
    next = insertBlock(next, block, {
      sectionId: section.id,
      columnIndex: 0,
      index,
    });
  }
  return next;
}

/**
 * The owner's photos the AI matched to dishes or products (2026-10-03),
 * applied to the Menú or Catálogo content. Only fills dishes that still
 * have no photo (the person may have added one meanwhile); any other type
 * is returned as is.
 */
export function applyItemPhotos(
  content: ExperienceContent,
  itemPhotos: readonly DesignItemPhoto[] | undefined,
): ExperienceContent {
  if (!itemPhotos?.length) return content;
  const photos = new Map(
    itemPhotos.map((photo) => [photo.itemId, photo.imageRef]),
  );
  const fill = <T extends { id: string; imageAssetId?: string | undefined }>(
    item: T,
  ): T => {
    const ref = photos.get(item.id);
    return ref && !item.imageAssetId ? { ...item, imageAssetId: ref } : item;
  };
  const value = content as {
    sections?: { items: { id: string; imageAssetId?: string }[] }[];
    items?: { id: string; imageAssetId?: string }[];
  };
  if (Array.isArray(value.sections))
    return {
      ...content,
      sections: value.sections.map((section) => ({
        ...section,
        items: section.items.map(fill),
      })),
    } as ExperienceContent;
  if (Array.isArray(value.items))
    return { ...content, items: value.items.map(fill) } as ExperienceContent;
  return content;
}

/** An `image` background with no `imageRef` is a deliberate empty slot
 * (`studio/model/validate.ts`, B3b): it saves and publishes with its
 * fallback color, so it is a photo space, not an error. */
export function isOpenImageBackground(
  background: DesignBackground | undefined,
): background is DesignBackground {
  return background?.kind === "image" && !background.imageRef;
}

/** Photo spaces a design leaves for the owner (2026-10-03): image blocks,
 * gallery photos and page or section backgrounds, all without an image
 * yet (relevo 37, B3: a background space was missing from this count). */
export function photoSpacesIn(design: PageDesign): number {
  const blockSpaces = designBlocks(design).reduce((count, block) => {
    if (block.kind === "image") return count + (block.imageRef ? 0 : 1);
    if (block.kind === "gallery")
      return count + block.images.filter((image) => !image.imageRef).length;
    return count;
  }, 0);
  const pageSpace = isOpenImageBackground(design.style.background) ? 1 : 0;
  const sectionSpaces = design.sections.filter((section) =>
    isOpenImageBackground(section.background),
  ).length;
  return blockSpaces + pageSpace + sectionSpaces;
}

/**
 * "Usar este diseño", from the rail or from the Estudio's «Tu diseño de la
 * IA está listo» notice (relevo 31, finding 2: 2 of 2 owners who got a
 * design closed the rail without using it). One undoable change for the
 * design, one for the matched photos, and the line that tells what changed.
 */
export function applyAiResult(
  result: {
    design: PageDesign;
    itemPhotos: readonly DesignItemPhoto[];
  },
  studio: {
    canEditHtml: boolean;
    /** The design on the page now: its `html` blocks survive the swap when
     * the person may not change them. */
    currentDesign?: PageDesign | undefined;
    change: (recipe: (design: PageDesign) => PageDesign, key?: string) => void;
    changeContent: (
      recipe: (content: ExperienceContent) => ExperienceContent,
      key?: string,
    ) => void;
  },
): string {
  const prepared = prepareGeneratedDesign(
    result.design,
    studio.canEditHtml,
    studio.currentDesign,
  );
  studio.change(() => prepared.design, "ai-design");
  if (result.itemPhotos.length > 0)
    studio.changeContent(
      (current) => applyItemPhotos(current, result.itemPhotos),
      "ai-item-photos",
    );
  if (prepared.removedHtmlBlocks || prepared.keptHtmlBlocks)
    return `Aplicaste el diseño de la IA. ${
      prepared.keptHtmlBlocks
        ? "Tus bloques de código se quedaron como estaban"
        : "Quitamos sus bloques de código"
    }: tu rol no puede cambiarlos.`;
  const spaces = photoSpacesIn(prepared.design);
  const placed = result.itemPhotos.length;
  return [
    placed > 0
      ? `Aplicaste el diseño de la IA y ${placed === 1 ? "tu foto quedó en su platillo" : `${placed} fotos quedaron en sus platillos`}.`
      : "Aplicaste el diseño de la IA.",
    spaces > 0
      ? `Dejó ${spaces === 1 ? "un espacio para foto: tócalo" : `${spaces} espacios para foto: tócalos`} en la página para subir tus fotos.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// "Usar este diseño" guarda y publica (relevo 37, B3c/B3d/E6): Karla lost
// her applied design because it only changed the draft in memory; Fernanda
// and Sofía saved it and never knew their customers still saw the old page.
// This tiny state machine is the model behind that fix — pure, so the
// apply → save → undo story is testable without mounting the Estudio.
// ---------------------------------------------------------------------------

/** `before` is whatever the host wants back on "Deshacer" (the Estudio's
 * own `{ design, content }` draft); kept generic so this stays easy to test
 * with a plain value. */
export type AiApplyState<Draft> =
  | { phase: "idle" }
  | { phase: "pending"; before: Draft; mode: "apply" | "undo" }
  | { phase: "saved"; before: Draft }
  | { phase: "error"; before: Draft; mode: "apply" | "undo" };

export type AiApplyEvent<Draft> =
  /** A design was just applied to the draft (one undoable change already
   * made); `before` is the draft right before that change. */
  | { type: "apply"; before: Draft }
  /** "Reintentar": tries the same save again, from "error". */
  | { type: "retry" }
  /** "Deshacer": the caller restores `before` and saves that too. */
  | { type: "undo" }
  /** The save that "pending" triggered settled, one way or the other. */
  | { type: "save-settled"; ok: boolean };

export function idleAiApply<Draft>(): AiApplyState<Draft> {
  return { phase: "idle" };
}

export function aiApplyReducer<Draft>(
  state: AiApplyState<Draft>,
  event: AiApplyEvent<Draft>,
): AiApplyState<Draft> {
  switch (event.type) {
    case "apply":
      return { phase: "pending", before: event.before, mode: "apply" };
    case "retry":
      return state.phase === "error"
        ? { phase: "pending", before: state.before, mode: state.mode }
        : state;
    case "undo":
      return state.phase === "saved" || state.phase === "error"
        ? { phase: "pending", before: state.before, mode: "undo" }
        : state;
    case "save-settled":
      if (state.phase !== "pending") return state;
      if (!event.ok)
        return { phase: "error", before: state.before, mode: state.mode };
      // Undone and saved: back to exactly where this started: nothing of
      // the AI's design is left to publish or to undo again.
      return state.mode === "undo"
        ? { phase: "idle" }
        : { phase: "saved", before: state.before };
    default:
      return state;
  }
}

/** The draft "Deshacer" would restore, or null when there is none (nothing
 * applied yet, or a save is already in flight). */
export function aiApplyUndoTarget<Draft>(
  state: AiApplyState<Draft>,
): Draft | null {
  return state.phase === "saved" || state.phase === "error"
    ? state.before
    : null;
}

export type AiApplyNotice =
  | { kind: "saving" }
  | { kind: "saved"; live: boolean }
  | { kind: "published" }
  | { kind: "error" };

/** What the IA rail's banner says, from the apply state and whether the
 * Experience is already live somewhere (`publishStatusOf(...).live`): null
 * hides the banner (nothing applied this session, or already undone). */
export function aiApplyNoticeOf<Draft>(
  state: AiApplyState<Draft>,
  live: boolean,
  /** Live with nothing left to publish (the «Publicada» badge): the design
   * customers see is this one. Round 3: Javier published twice and the
   * banner still said «todavía ven el diseño anterior». */
  upToDate = false,
): AiApplyNotice | null {
  if (state.phase === "idle") return null;
  if (state.phase === "pending") return { kind: "saving" };
  if (state.phase === "error") return { kind: "error" };
  if (live && upToDate) return { kind: "published" };
  return { kind: "saved", live };
}
