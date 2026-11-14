import { designBlocks, type PageDesign } from "@kardo/contracts";
import type { CanvasBox } from "../model/canvas-items.js";
import { locateBlock } from "../model/operations.js";
import type { Selection } from "../StudioContext.js";

/**
 * Selection rules of the stage, as pure functions: Shift adds canvas
 * blocks of the same canvas to a selection (or takes them out), a marquee
 * selects what it touches, and Tab walks the blocks in reading order.
 */

/** The canvas section of a block, or null for a flow block. */
function canvasOf(design: PageDesign, blockId: string): string | null {
  const at = locateBlock(design, blockId);
  return at?.on === "canvas" ? at.section.id : null;
}

/** A selection of `ids`: one block, several, or nothing. */
export function selectionOf(ids: readonly string[]): Selection {
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  if (unique.length === 1) return { kind: "block", id: unique[0] ?? "" };
  return { kind: "blocks", ids: unique };
}

/**
 * Shift+click on `blockId`: adds it to (or removes it from) the current
 * selection when both are blocks of the same canvas; otherwise it becomes
 * the selection on its own.
 */
export function toggleInSelection(
  design: PageDesign,
  current: Selection,
  blockId: string,
): Selection {
  const canvas = canvasOf(design, blockId);
  const ids =
    current?.kind === "block"
      ? [current.id]
      : current?.kind === "blocks"
        ? current.ids
        : [];
  if (
    !canvas ||
    !ids.length ||
    ids.some((id) => canvasOf(design, id) !== canvas)
  )
    return { kind: "block", id: blockId };
  return ids.includes(blockId)
    ? selectionOf(ids.filter((id) => id !== blockId))
    : selectionOf([...ids, blockId]);
}

/** Boxes (design px) touched by a marquee rectangle. */
export function boxesInRect(
  boxes: ReadonlyMap<string, CanvasBox>,
  rect: CanvasBox,
): string[] {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return [...boxes.entries()]
    .filter(
      ([, box]) =>
        box.x < right &&
        box.x + box.w > rect.x &&
        box.y < bottom &&
        box.y + box.h > rect.y,
    )
    .map(([id]) => id);
}

/** The rectangle between two points. */
export function rectBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): CanvasBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** Tab and Shift+Tab: the next block of the page in reading order. */
export function stepBlock(
  design: PageDesign,
  current: Selection,
  direction: 1 | -1,
): string | null {
  const ids = designBlocks(design).map((block) => block.id);
  if (!ids.length) return null;
  const at =
    current?.kind === "block"
      ? ids.indexOf(current.id)
      : current?.kind === "blocks"
        ? ids.indexOf(current.ids[current.ids.length - 1] ?? "")
        : -1;
  if (at < 0) return direction === 1 ? (ids[0] ?? null) : (ids.at(-1) ?? null);
  return ids[at + direction] ?? null;
}

/** Drops ids that are no longer in the design (after an undo, say). */
export function pruneSelection(
  design: PageDesign,
  current: Selection,
): Selection {
  if (!current) return current;
  if (current.kind === "blocks") {
    const kept = current.ids.filter((id) => locateBlock(design, id) !== null);
    if (kept.length === current.ids.length) return current;
    return selectionOf(kept);
  }
  if (current.kind === "block")
    return locateBlock(design, current.id) ? current : null;
  return design.sections.some((section) => section.id === current.id)
    ? current
    : null;
}
