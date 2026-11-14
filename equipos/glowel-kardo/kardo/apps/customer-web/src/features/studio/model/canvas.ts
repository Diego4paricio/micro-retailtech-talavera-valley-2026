import {
  type BrandButtonLook,
  boundBlockKinds,
  boundBlocksByType,
  CANVAS_WIDTH,
  type CanvasItem,
  type CanvasSection,
  canvasReadingOrder,
  DESIGN_DEFAULT_PAGE_PADDING,
  DESIGN_LIMITS,
  type DesignableExperienceType,
  type DesignBackground,
  type DesignBlock,
  type DesignStyle,
  type PageDesign,
  requiredBlockByType,
  sectionBlocks,
} from "@kardo/contracts";
import { createBlock } from "./blocks.js";
import {
  applyStack,
  BRAND_CIRCLE_SIZE,
  type CanvasBox,
  type CanvasPoint,
  canPlaceOnCanvas,
  clampItem,
  DUPLICATE_OFFSET,
  defaultItemSize,
  estimatedItemHeight,
  fillsItem,
  itemBox,
  itemHeight,
  lowestItemBottom,
  minCanvasHeight,
  squareCanvasItem,
  stackOrder,
  unsquareCanvasItem,
  withItemOnTop,
} from "./canvas-items.js";
import type { NewId } from "./ids.js";
import {
  addBlockBlocker,
  convertToCanvasBlocker,
  removeBlockBlocker,
} from "./limits.js";
import {
  addSection,
  type CanvasBlockLocation,
  createSection,
  findCanvasSection,
  findFlowSection,
  insertBlock,
  locateBlock,
  removeBlock,
  replaceSection,
  updateBlock,
  updateCanvasSection,
} from "./operations.js";

/**
 * Pure edits of canvas sections ("lienzo libre", design schema 2): blocks
 * placed at x/y/w/h in design px of a `CANVAS_WIDTH` phone. Like the rest of
 * the model, every function returns a new design and ignores ids it cannot
 * find. Positions are always clamped so each block keeps a piece of itself
 * on its canvas (see canvas-items.ts).
 */

export type { CanvasBox, CanvasPoint };

export const DEFAULT_CANVAS_HEIGHT = 640;

export type CanvasAlign =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

/** Stacking moves: one layer or all the way. */
export type CanvasLayerMove = "front" | "forward" | "backward" | "back";

/** The canvas block `blockId`, or `null` when it is not on a canvas. */
export function canvasItemOf(
  design: PageDesign,
  blockId: string,
): CanvasBlockLocation | null {
  const at = locateBlock(design, blockId);
  return at?.on === "canvas" ? at : null;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function createCanvasSection(
  newId: NewId,
  height = DEFAULT_CANVAS_HEIGHT,
): CanvasSection {
  return { id: newId("s"), kind: "canvas", height, items: [] };
}

/** Adds an empty canvas (640 px tall, no background) at `index`. */
export function addCanvasSection(
  design: PageDesign,
  newId: NewId,
  index = design.sections.length,
): { design: PageDesign; id: string } {
  const section = createCanvasSection(newId);
  return { design: addSection(design, section, index), id: section.id };
}

export function setCanvasHeight(
  design: PageDesign,
  sectionId: string,
  height: number,
): PageDesign {
  return updateCanvasSection(design, sectionId, (section) => {
    const next = Math.min(
      DESIGN_LIMITS.canvasHeight,
      Math.max(minCanvasHeight(section), Math.round(height)),
    );
    return next === section.height ? section : { ...section, height: next };
  });
}

/** What the 390 px preview measured of a flow section: its height and the
 * box of each block, relative to the section's top left corner (the left
 * edge of the phone), in design px. */
export type MeasuredSection = {
  height: number;
  blocks: Readonly<Record<string, CanvasBox>>;
};

export type ConvertResult =
  | { ok: true; design: PageDesign }
  | { ok: false; reason: string };

/**
 * "Convertir en lienzo": the flow section becomes a canvas with the same id
 * and every block where the phone preview showed it, so it keeps its look.
 * Blocks the preview did not draw are stacked below the rest. A card
 * becomes a plain surface-colored background (canvases have no card).
 */
export function convertToCanvas(
  design: PageDesign,
  type: DesignableExperienceType,
  sectionId: string,
  measured: MeasuredSection,
): ConvertResult {
  const blocked = convertToCanvasBlocker(design, type, sectionId);
  const section = findFlowSection(design, sectionId);
  if (blocked || !section)
    return { ok: false, reason: blocked ?? "Esta sección ya no existe." };

  const placed: CanvasItem[] = [];
  const missing: DesignBlock[] = [];
  for (const block of sectionBlocks(section)) {
    const box = measured.blocks[block.id];
    if (!box) {
      missing.push(block);
      continue;
    }
    placed.push({
      block,
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.max(8, Math.round(box.w)),
      ...(fillsItem(block.kind) ? { h: Math.max(8, Math.round(box.h)) } : {}),
    });
  }
  let cursor = placed.reduce(
    (bottom, item) =>
      Math.max(
        bottom,
        item.y + itemHeight(item, measured.blocks[item.block.id]?.h),
      ),
    0,
  );
  for (const block of missing) {
    const size = defaultItemSize(block.kind);
    const y = cursor + 16;
    placed.push({
      block,
      x: Math.round((CANVAS_WIDTH - size.w) / 2),
      y,
      w: size.w,
      ...(size.h ? { h: size.h } : {}),
    });
    cursor = y + (size.h ?? estimatedItemHeight(block.kind));
  }

  const height = Math.min(
    DESIGN_LIMITS.canvasHeight,
    Math.max(80, Math.round(measured.height), cursor),
  );
  const clamped = placed.map((item) =>
    clampItem(item, height, measured.blocks[item.block.id]?.h),
  );
  // Each block on its own layer, in reading order: later moves never
  // reshuffle what is drawn on top.
  const items = applyStack(
    clamped,
    canvasReadingOrder(clamped).map((item) => item.block.id),
  );
  const background: DesignBackground | undefined =
    section.background ??
    (section.card
      ? { kind: "solid", color: design.style.palette.surface }
      : undefined);
  const canvas: CanvasSection = {
    id: section.id,
    kind: "canvas",
    height,
    ...(background ? { background } : {}),
    items,
  };
  return {
    ok: true,
    design: replaceSection(design, sectionId, () => canvas),
  };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Places `block` on a canvas, on top, centered on `at` (or on the canvas),
 * with its default size (text 342 wide, images 200x200, shapes 120x120). */
export function addBlockToCanvas(
  design: PageDesign,
  sectionId: string,
  block: DesignBlock,
  at?: CanvasPoint,
): PageDesign {
  return insertBlock(design, block, {
    sectionId,
    columnIndex: 0,
    index: 0,
    at,
  });
}

export function deleteCanvasItem(
  design: PageDesign,
  blockId: string,
): PageDesign {
  return canvasItemOf(design, blockId) ? removeBlock(design, blockId) : design;
}

function updateItem(
  design: PageDesign,
  blockId: string,
  recipe: (item: CanvasItem, section: CanvasSection) => CanvasItem,
): PageDesign {
  const at = canvasItemOf(design, blockId);
  if (!at) return design;
  const next = recipe(at.item, at.section);
  if (JSON.stringify(next) === JSON.stringify(at.item)) return design;
  return updateCanvasSection(design, at.section.id, (section) => ({
    ...section,
    items: section.items.map((item) =>
      item.block.id === blockId ? next : item,
    ),
  }));
}

/**
 * Sets any of x, y, w and h (h only for images and shapes, the blocks that
 * fill it). `measuredHeight` is the rendered height of blocks that grow
 * with their text, so they stay reachable at the canvas bottom.
 */
export function setCanvasItemGeometry(
  design: PageDesign,
  blockId: string,
  patch: Partial<CanvasBox>,
  measuredHeight?: number,
): PageDesign {
  return updateItem(design, blockId, (item, section) => {
    const { h, ...position } = patch;
    const sized =
      h !== undefined && fillsItem(item.block.kind) ? { ...item, h } : item;
    return clampItem({ ...sized, ...position }, section.height, measuredHeight);
  });
}

/**
 * Sets a `brandButton`'s `look` (flow or canvas) and, on a canvas, keeps its
 * footprint matching what it looks like: switching to "circle" squares it to
 * `BRAND_CIRCLE_SIZE` around its own center (so it does not render much
 * bigger than its logo, the owner's complaint); switching away from it
 * restores a normal-width item, same center, only when the item still has
 * exactly the square footprint `squareCanvasItem` gave it (a size the person
 * chose on purpose is left alone).
 */
export function setBrandButtonLook(
  design: PageDesign,
  blockId: string,
  look: BrandButtonLook,
): PageDesign {
  const updated = updateBlock(design, blockId, (block) =>
    block.kind === "brandButton" ? { ...block, look } : block,
  );
  return updateItem(updated, blockId, (item) => {
    if (item.block.kind !== "brandButton") return item;
    if (look === "circle") return squareCanvasItem(item);
    if (item.w === BRAND_CIRCLE_SIZE && item.h === BRAND_CIRCLE_SIZE)
      return unsquareCanvasItem(item);
    return item;
  });
}

/**
 * "Redes en círculo" (addendum: forma): places `blocks` (brand buttons
 * already in círculo look) side by side on a canvas, centered on `at` (or
 * the canvas), so they read as a row of four from the moment they land.
 */
export function placeBrandCircleRow(
  section: CanvasSection,
  blocks: readonly DesignBlock[],
  at?: CanvasPoint,
): CanvasItem[] {
  const size = BRAND_CIRCLE_SIZE;
  const gap = 12;
  const totalWidth =
    blocks.length * size + Math.max(0, blocks.length - 1) * gap;
  const center = at ?? { x: CANVAS_WIDTH / 2, y: section.height / 2 };
  const startX = Math.round(center.x - totalWidth / 2);
  const y = Math.round(center.y - size / 2);
  return blocks.map((block, index) =>
    clampItem(
      { block, x: startX + index * (size + gap), y, w: size, h: size },
      section.height,
    ),
  );
}

/** Adds a row of círculo brand buttons to a canvas section, each on top, in
 * order. An unknown section leaves the design unchanged. */
export function addBrandCircleRowToCanvas(
  design: PageDesign,
  sectionId: string,
  blocks: readonly DesignBlock[],
  at?: CanvasPoint,
): PageDesign {
  const section = findCanvasSection(design, sectionId);
  if (!section) return design;
  let current = design;
  for (const item of placeBrandCircleRow(section, blocks, at)) {
    current = updateCanvasSection(current, sectionId, (canvas) => ({
      ...canvas,
      items: withItemOnTop(canvas.items, item),
    }));
  }
  return current;
}

export function moveCanvasItem(
  design: PageDesign,
  blockId: string,
  x: number,
  y: number,
  measuredHeight?: number,
): PageDesign {
  return setCanvasItemGeometry(design, blockId, { x, y }, measuredHeight);
}

/** Moves by a few px (arrow keys). */
export function nudgeCanvasItem(
  design: PageDesign,
  blockId: string,
  dx: number,
  dy: number,
  measuredHeight?: number,
): PageDesign {
  const at = canvasItemOf(design, blockId);
  if (!at) return design;
  return moveCanvasItem(
    design,
    blockId,
    at.item.x + dx,
    at.item.y + dy,
    measuredHeight,
  );
}

/** New size (and, from the left or top handles, new position). */
export function resizeCanvasItem(
  design: PageDesign,
  blockId: string,
  size: { w: number; h?: number | undefined; x?: number; y?: number },
  measuredHeight?: number,
): PageDesign {
  const { h, ...rest } = size;
  return setCanvasItemGeometry(
    design,
    blockId,
    h === undefined ? rest : { ...rest, h },
    measuredHeight,
  );
}

/** Where the block sits in its canvas's stack: 0 is the back. */
export function canvasLayerOf(
  design: PageDesign,
  blockId: string,
): { position: number; count: number } | null {
  const at = canvasItemOf(design, blockId);
  if (!at) return null;
  const order = stackOrder(at.section.items);
  return { position: order.indexOf(blockId), count: order.length };
}

/** Puts the block at `position` of its canvas's stack (0 = back). */
export function setCanvasItemLayer(
  design: PageDesign,
  blockId: string,
  position: number,
): PageDesign {
  const at = canvasItemOf(design, blockId);
  if (!at) return design;
  const order = stackOrder(at.section.items).filter((id) => id !== blockId);
  const index = Math.min(order.length, Math.max(0, Math.round(position)));
  order.splice(index, 0, blockId);
  const items = applyStack(at.section.items, order);
  if (JSON.stringify(items) === JSON.stringify(at.section.items)) return design;
  return updateCanvasSection(design, at.section.id, (section) => ({
    ...section,
    items,
  }));
}

export function moveCanvasLayer(
  design: PageDesign,
  blockId: string,
  move: CanvasLayerMove,
): PageDesign {
  const layer = canvasLayerOf(design, blockId);
  if (!layer) return design;
  const position =
    move === "front"
      ? layer.count - 1
      : move === "back"
        ? 0
        : layer.position + (move === "forward" ? 1 : -1);
  if (position < 0 || position >= layer.count || position === layer.position)
    return design;
  return setCanvasItemLayer(design, blockId, position);
}

/**
 * Lines the block up with an edge or the center of its canvas, or of
 * `reference` (another block's box). `height` is the measured height of
 * blocks that grow with their text.
 */
export function alignCanvasItem(
  design: PageDesign,
  blockId: string,
  align: CanvasAlign,
  options: { height?: number | undefined; reference?: CanvasBox } = {},
): PageDesign {
  const at = canvasItemOf(design, blockId);
  if (!at) return design;
  const ref = options.reference ?? {
    x: 0,
    y: 0,
    w: CANVAS_WIDTH,
    h: at.section.height,
  };
  const { w } = at.item;
  const h = itemHeight(at.item, options.height);
  const patch: Partial<CanvasBox> =
    align === "left"
      ? { x: ref.x }
      : align === "center"
        ? { x: Math.round(ref.x + (ref.w - w) / 2) }
        : align === "right"
          ? { x: ref.x + ref.w - w }
          : align === "top"
            ? { y: ref.y }
            : align === "middle"
              ? { y: Math.round(ref.y + (ref.h - h) / 2) }
              : { y: ref.y + ref.h - h };
  return setCanvasItemGeometry(design, blockId, patch, options.height);
}

/** Where the height handle snaps: the lowest bottom of the canvas's items. */
export function canvasContentBottom(
  section: CanvasSection,
  measured?: (blockId: string) => number | undefined,
): number {
  return lowestItemBottom(section, measured);
}

// ---------------------------------------------------------------------------
// Multi-select
// ---------------------------------------------------------------------------

/**
 * The items of `blockIds` that sit on the same canvas as the first id that
 * is on a canvas, in reading order. `null` when none of `blockIds` is on a
 * canvas.
 */
export function canvasSelection(
  design: PageDesign,
  blockIds: readonly string[],
): { section: CanvasSection; items: CanvasItem[] } | null {
  let target: CanvasSection | null = null;
  for (const blockId of blockIds) {
    const at = canvasItemOf(design, blockId);
    if (at) {
      target = at.section;
      break;
    }
  }
  if (!target) return null;
  const wanted = new Set(blockIds);
  const items = canvasReadingOrder(target.items).filter((item) =>
    wanted.has(item.block.id),
  );
  return { section: target, items };
}

/** The smallest box that contains every one of `boxes`; `null` when empty. */
export function boundsOf(boxes: readonly CanvasBox[]): CanvasBox | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The range an item's `axis` coordinate may take without `clampItem`
 * touching it (its own w/h decide the range, not its current position). */
function axisRange(
  axis: "x" | "y",
  item: CanvasItem,
  canvasHeight: number,
  measured?: number,
): [number, number] {
  const low = clampItem(
    { ...item, [axis]: Number.NEGATIVE_INFINITY },
    canvasHeight,
    measured,
  )[axis];
  const high = clampItem(
    { ...item, [axis]: Number.POSITIVE_INFINITY },
    canvasHeight,
    measured,
  )[axis];
  return [low, high];
}

/**
 * Moves the unlocked items of the selection by `dx`, `dy` as a group,
 * keeping their relative positions: the move is limited so every moved item
 * still satisfies `clampItem`'s bounds on its own. Locked items never move;
 * with a single item this matches `nudgeCanvasItem`.
 */
export function moveCanvasItems(
  design: PageDesign,
  blockIds: readonly string[],
  dx: number,
  dy: number,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  const selection = canvasSelection(design, blockIds);
  if (!selection) return design;
  const { section, items } = selection;
  const movable = items.filter((item) => !item.locked);
  if (!movable.length) return design;
  let dxMin = Number.NEGATIVE_INFINITY;
  let dxMax = Number.POSITIVE_INFINITY;
  let dyMin = Number.NEGATIVE_INFINITY;
  let dyMax = Number.POSITIVE_INFINITY;
  for (const item of movable) {
    const height = measured?.(item.block.id);
    const [xLow, xHigh] = axisRange("x", item, section.height, height);
    const [yLow, yHigh] = axisRange("y", item, section.height, height);
    dxMin = Math.max(dxMin, xLow - item.x);
    dxMax = Math.min(dxMax, xHigh - item.x);
    dyMin = Math.max(dyMin, yLow - item.y);
    dyMax = Math.min(dyMax, yHigh - item.y);
  }
  const boundedDx = Math.min(dxMax, Math.max(dxMin, dx));
  const boundedDy = Math.min(dyMax, Math.max(dyMin, dy));
  const moving = new Set(movable.map((item) => item.block.id));
  const nextItems = section.items.map((item) => {
    if (!moving.has(item.block.id)) return item;
    return clampItem(
      { ...item, x: item.x + boundedDx, y: item.y + boundedDy },
      section.height,
      measured?.(item.block.id),
    );
  });
  if (JSON.stringify(nextItems) === JSON.stringify(section.items))
    return design;
  return updateCanvasSection(design, section.id, (current) => ({
    ...current,
    items: nextItems,
  }));
}

function alignPatch(
  ref: CanvasBox,
  w: number,
  h: number,
  align: CanvasAlign,
): Partial<CanvasBox> {
  switch (align) {
    case "left":
      return { x: ref.x };
    case "center":
      return { x: Math.round(ref.x + (ref.w - w) / 2) };
    case "right":
      return { x: ref.x + ref.w - w };
    case "top":
      return { y: ref.y };
    case "middle":
      return { y: Math.round(ref.y + (ref.h - h) / 2) };
    case "bottom":
      return { y: ref.y + ref.h - h };
  }
}

/**
 * Aligns the selection. One item: to its canvas (same as `alignCanvasItem`).
 * Two or more: to the bounding box of every selected item (locked items
 * count for that box but never move themselves).
 */
export function alignCanvasItems(
  design: PageDesign,
  blockIds: readonly string[],
  align: CanvasAlign,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  const selection = canvasSelection(design, blockIds);
  if (!selection) return design;
  const { section, items } = selection;
  if (items.length === 1) {
    const only = items[0];
    if (!only) return design;
    return alignCanvasItem(design, only.block.id, align, {
      height: measured?.(only.block.id),
    });
  }
  const bounds = boundsOf(
    items.map((item) => itemBox(item, measured?.(item.block.id))),
  );
  if (!bounds) return design;
  const moving = new Set(
    items.filter((item) => !item.locked).map((item) => item.block.id),
  );
  if (!moving.size) return design;
  const nextItems = section.items.map((item) => {
    if (!moving.has(item.block.id)) return item;
    const height = measured?.(item.block.id);
    const patch = alignPatch(bounds, item.w, itemHeight(item, height), align);
    return clampItem({ ...item, ...patch }, section.height, height);
  });
  if (JSON.stringify(nextItems) === JSON.stringify(section.items))
    return design;
  return updateCanvasSection(design, section.id, (current) => ({
    ...current,
    items: nextItems,
  }));
}

export type CanvasDistribution = "horizontal" | "vertical";

/**
 * Spreads 3 or more unlocked items evenly along `axis` (locked ones are left
 * out entirely): sorted by their start edge, the first and last stay and the
 * others get equal gaps between consecutive boxes. When the boxes overlap
 * (negative free space), their centers are spread evenly instead. Fewer than
 * 3 unlocked items leaves the design unchanged.
 */
export function distributeCanvasItems(
  design: PageDesign,
  blockIds: readonly string[],
  axis: CanvasDistribution,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  const selection = canvasSelection(design, blockIds);
  if (!selection) return design;
  const { section, items } = selection;
  const unlocked = items.filter((item) => !item.locked);
  if (unlocked.length < 3) return design;
  const key: "x" | "y" = axis === "horizontal" ? "x" : "y";
  const sizeKey: "w" | "h" = axis === "horizontal" ? "w" : "h";
  const boxed = unlocked
    .map((item) => ({ item, box: itemBox(item, measured?.(item.block.id)) }))
    .sort((a, b) => a.box[key] - b.box[key]);
  const first = boxed[0];
  const last = boxed[boxed.length - 1];
  if (!first || !last) return design;
  const totalSize = boxed.reduce((sum, entry) => sum + entry.box[sizeKey], 0);
  const span = last.box[key] + last.box[sizeKey] - first.box[key];
  const freeSpace = span - totalSize;
  const patches = new Map<string, number>();
  if (freeSpace >= 0) {
    const gap = freeSpace / (boxed.length - 1);
    let cursor = first.box[key] + first.box[sizeKey] + gap;
    for (let index = 1; index < boxed.length - 1; index += 1) {
      const entry = boxed[index];
      if (!entry) continue;
      patches.set(entry.item.block.id, Math.round(cursor));
      cursor += entry.box[sizeKey] + gap;
    }
  } else {
    const firstCenter = first.box[key] + first.box[sizeKey] / 2;
    const lastCenter = last.box[key] + last.box[sizeKey] / 2;
    const step = (lastCenter - firstCenter) / (boxed.length - 1);
    for (let index = 1; index < boxed.length - 1; index += 1) {
      const entry = boxed[index];
      if (!entry) continue;
      const center = firstCenter + step * index;
      patches.set(
        entry.item.block.id,
        Math.round(center - entry.box[sizeKey] / 2),
      );
    }
  }
  if (!patches.size) return design;
  const nextItems = section.items.map((item) => {
    const value = patches.get(item.block.id);
    if (value === undefined) return item;
    return clampItem(
      { ...item, [key]: value },
      section.height,
      measured?.(item.block.id),
    );
  });
  if (JSON.stringify(nextItems) === JSON.stringify(section.items))
    return design;
  return updateCanvasSection(design, section.id, (current) => ({
    ...current,
    items: nextItems,
  }));
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/** Brings any angle into a whole degree from -179 to 180. */
export function normalizeRotation(degrees: number): number {
  const rounded = Math.round(degrees);
  const mod = ((rounded % 360) + 360) % 360;
  return mod > 180 ? mod - 360 : mod;
}

/** The nearest multiple of `step` (15° by default), normalized. */
export function snapRotation(degrees: number, step = 15): number {
  if (step <= 0) return normalizeRotation(degrees);
  return normalizeRotation(Math.round(degrees / step) * step);
}

/**
 * The angle from `center` to `pointer`, in degrees: 0 with the pointer
 * straight above the center, clockwise positive (screen y grows downward),
 * normalized to -180..180. Kept as a float for a smooth drag.
 */
export function rotationFromPointer(
  center: CanvasPoint,
  pointer: CanvasPoint,
): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Sets the item's rotation (0 removes it). A locked item is not changed. */
export function rotateCanvasItem(
  design: PageDesign,
  blockId: string,
  degrees: number,
): PageDesign {
  return updateItem(design, blockId, (item) => {
    if (item.locked) return item;
    const r = normalizeRotation(degrees);
    const { r: _r, ...rest } = item;
    return r === 0 ? rest : { ...rest, r };
  });
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function setItemFlag(
  design: PageDesign,
  blockId: string,
  flag: "locked" | "hidden",
  value: boolean,
): PageDesign {
  return updateItem(design, blockId, (item) => {
    if (value) return { ...item, [flag]: true };
    if (flag === "locked") {
      const { locked: _locked, ...rest } = item;
      return rest;
    }
    const { hidden: _hidden, ...rest } = item;
    return rest;
  });
}

/** Sets or clears `locked` or `hidden` on every item of `blockIds` (`true`
 * sets it, `false` removes the key). Ids not on a canvas are ignored. */
export function setCanvasItemsFlag(
  design: PageDesign,
  blockIds: readonly string[],
  flag: "locked" | "hidden",
  value: boolean,
): PageDesign {
  return blockIds.reduce(
    (current, blockId) => setItemFlag(current, blockId, flag, value),
    design,
  );
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/** Deep copies of the selection's items, in reading order. */
export function copyCanvasItems(
  design: PageDesign,
  blockIds: readonly string[],
): CanvasItem[] {
  const selection = canvasSelection(design, blockIds);
  if (!selection) return [];
  return selection.items.map((item) => structuredClone(item));
}

export type PasteResult = {
  design: PageDesign;
  ids: string[];
  skipped: number;
  reason: string | null;
};

/**
 * Pastes copies of `items` onto the canvas `sectionId`: each gets a new
 * block id, is offset by `offset` in x and y, clamped to that canvas and put
 * on top, in the given order. Bound blocks are always skipped (they may
 * appear only once); a block `addBlockBlocker` refuses is skipped with its
 * reason. The first skip reason found wins. An unknown or non-canvas section
 * leaves the design unchanged.
 */
export function pasteCanvasItems(
  design: PageDesign,
  type: DesignableExperienceType,
  sectionId: string,
  items: readonly CanvasItem[],
  newId: NewId,
  offset = DUPLICATE_OFFSET,
  canEditHtml = true,
): PasteResult {
  const section = findCanvasSection(design, sectionId);
  if (!section)
    return {
      design,
      ids: [],
      skipped: items.length,
      reason: "Pega en una sección de espacio libre.",
    };
  let current = design;
  const ids: string[] = [];
  let skipped = 0;
  let reason: string | null = null;
  for (const source of items) {
    if (boundBlockKinds.includes(source.block.kind)) {
      skipped += 1;
      reason ??= "Los bloques con tu contenido solo aparecen una vez.";
      continue;
    }
    const blocked = addBlockBlocker(
      current,
      type,
      source.block.kind,
      { sectionId, columnIndex: 0 },
      canEditHtml,
    );
    if (blocked) {
      skipped += 1;
      reason ??= blocked;
      continue;
    }
    const id = newId("b");
    const block: DesignBlock = { ...structuredClone(source.block), id };
    const placed = clampItem(
      {
        ...structuredClone(source),
        block,
        x: source.x + offset,
        y: source.y + offset,
      },
      section.height,
    );
    current = updateCanvasSection(current, sectionId, (canvas) => ({
      ...canvas,
      items: withItemOnTop(canvas.items, placed),
    }));
    ids.push(id);
  }
  return { design: current, ids, skipped, reason };
}

/** Copies of the selection, pasted onto their own canvas with the default
 * offset. */
export function duplicateCanvasItems(
  design: PageDesign,
  type: DesignableExperienceType,
  blockIds: readonly string[],
  newId: NewId,
  canEditHtml = true,
): PasteResult {
  const selection = canvasSelection(design, blockIds);
  if (!selection) return { design, ids: [], skipped: 0, reason: null };
  return pasteCanvasItems(
    design,
    type,
    selection.section.id,
    copyCanvasItems(design, blockIds),
    newId,
    DUPLICATE_OFFSET,
    canEditHtml,
  );
}

/** Removes every item of `blockIds` that `removeBlockBlocker` allows
 * (required blocks stay). `reason` is the first refusal found. */
export function removeCanvasItems(
  design: PageDesign,
  type: DesignableExperienceType,
  blockIds: readonly string[],
  canEditHtml = true,
): { design: PageDesign; removed: number; reason: string | null } {
  let current = design;
  let removed = 0;
  let reason: string | null = null;
  for (const blockId of blockIds) {
    if (!canvasItemOf(current, blockId)) continue;
    const blocked = removeBlockBlocker(current, type, blockId, canEditHtml);
    if (blocked) {
      reason ??= blocked;
      continue;
    }
    current = removeBlock(current, blockId);
    removed += 1;
  }
  return { design: current, removed, reason };
}

/**
 * Moves a canvas item to `sectionId` at (x, y) of that canvas, clamped there
 * and put on top; on its own canvas this is exactly `moveCanvasItem`. A
 * destination that is not a canvas, is full or refuses the kind leaves the
 * design unchanged. A locked item never moves.
 */
export function moveCanvasItemToSection(
  design: PageDesign,
  blockId: string,
  sectionId: string,
  x: number,
  y: number,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  const at = canvasItemOf(design, blockId);
  if (!at || at.item.locked) return design;
  if (at.section.id === sectionId)
    return moveCanvasItem(design, blockId, x, y, measured?.(blockId));
  const destination = findCanvasSection(design, sectionId);
  if (
    !destination ||
    !canPlaceOnCanvas(at.block.kind) ||
    destination.items.length >= DESIGN_LIMITS.canvasItems
  )
    return design;
  const moved = clampItem(
    { ...at.item, x, y },
    destination.height,
    measured?.(blockId),
  );
  return updateCanvasSection(
    removeBlock(design, blockId),
    sectionId,
    (canvas) => ({ ...canvas, items: withItemOnTop(canvas.items, moved) }),
  );
}

// ---------------------------------------------------------------------------
// Blank canvas design
// ---------------------------------------------------------------------------

/**
 * "Lienzo en blanco": a design with one canvas section and the type's
 * required bound block. A block that can go on a canvas (the profile, the
 * main image) sits on it, at the top center. Content that grows with its
 * items (links, the menu, the catalog, the form, the PDF) goes in a flow
 * section right after a shorter canvas that starts with the page title.
 */
export function blankCanvasDesign(
  type: DesignableExperienceType,
  style: DesignStyle,
  newId: NewId,
): PageDesign {
  const finalStyle: DesignStyle =
    style.pagePadding === undefined
      ? { ...style, pagePadding: DESIGN_DEFAULT_PAGE_PADDING }
      : style;
  const kind = requiredBlockByType[type];
  const place = (block: DesignBlock, height: number): CanvasItem => {
    const size = defaultItemSize(block.kind);
    return clampItem(
      {
        block,
        x: Math.round((CANVAS_WIDTH - size.w) / 2),
        y: 48,
        w: size.w,
        ...(size.h ? { h: size.h } : {}),
      },
      height,
    );
  };
  if (canPlaceOnCanvas(kind)) {
    const canvas = createCanvasSection(newId);
    const block = createBlock(kind, newId);
    return {
      schema: 2,
      style: finalStyle,
      sections: [{ ...canvas, items: [place(block, canvas.height)] }],
    };
  }
  const withTitle = boundBlocksByType[type].includes("contentTitle");
  const canvas = createCanvasSection(newId, withTitle ? 240 : 160);
  const title = withTitle ? createBlock("contentTitle", newId) : null;
  const block = createBlock(kind, newId);
  const flowSection = createSection(newId, "1");
  return {
    schema: 2,
    style: finalStyle,
    sections: [
      { ...canvas, items: title ? [place(title, canvas.height)] : [] },
      { ...flowSection, columns: [[block]] },
    ],
  };
}
