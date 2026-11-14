import {
  CANVAS_WIDTH,
  type CanvasItem,
  type CanvasSection,
  canvasBlockKinds,
  canvasReadingOrder,
  DESIGN_LIMITS,
  type DesignBlock,
  type DesignBlockKind,
} from "@kardo/contracts";

/**
 * Geometry of the blocks placed on a canvas section ("lienzo libre"). All
 * numbers are integer design px of a `CANVAS_WIDTH` wide phone. Shared by
 * the design operations and the canvas editor; nothing here reads the DOM.
 */

export type CanvasPoint = { x: number; y: number };
export type CanvasBox = { x: number; y: number; w: number; h: number };

/** A placed box always keeps this much of itself on the canvas, so it can
 * be grabbed again (the contract only asks for some overlap). */
export const CANVAS_GRIP = 8;
/** How far a duplicate lands from its original, in both axes. */
export const DUPLICATE_OFFSET = 16;

export function canPlaceOnCanvas(kind: DesignBlockKind): boolean {
  return canvasBlockKinds.includes(kind);
}

/** Images, the Experience's own main photo and shapes take the item's
 * height; the rest grow with their content and only resize their width. */
export function fillsItem(kind: DesignBlockKind): boolean {
  return kind === "image" || kind === "imageMain" || kind === "shape";
}

/** Size of a new item: most blocks span the phone minus 24 px margins. */
export function defaultItemSize(kind: DesignBlockKind): {
  w: number;
  h?: number;
} {
  if (kind === "image" || kind === "imageMain") return { w: 200, h: 200 };
  if (kind === "shape") return { w: 120, h: 120 };
  return { w: CANVAS_WIDTH - 48 };
}

/** A "Botón de red o app" in círculo look is always this big on a canvas
 * (`page-render`'s `.kd-brand--circle` keeps it square by itself; the
 * editor still needs an explicit box so handles, alignment and clamping all
 * agree with what is drawn). */
export const BRAND_CIRCLE_SIZE = 56;

/** Square footprint for a brand button switching to círculo look, keeping
 * its center. */
export function squareCanvasItem(
  item: CanvasItem,
  size: number = BRAND_CIRCLE_SIZE,
): CanvasItem {
  const cx = item.x + item.w / 2;
  const cy = item.y + (item.h ?? item.w) / 2;
  const { h: _h, ...rest } = item;
  return {
    ...rest,
    w: size,
    h: size,
    x: Math.round(cx - size / 2),
    y: Math.round(cy - size / 2),
  };
}

/** The inverse of `squareCanvasItem`: a normal-width brand button, same
 * center, its height left to grow with its content again (only applied when
 * leaving círculo look on an item `squareCanvasItem` actually squared). */
export function unsquareCanvasItem(
  item: CanvasItem,
  width: number = CANVAS_WIDTH - 48,
): CanvasItem {
  const cx = item.x + item.w / 2;
  const cy = item.y + (item.h ?? item.w) / 2;
  const estimated = estimatedItemHeight(item.block.kind);
  const { h: _h, ...rest } = item;
  return {
    ...rest,
    w: width,
    x: Math.round(cx - width / 2),
    y: Math.round(cy - estimated / 2),
  };
}

const estimatedHeights: Partial<Record<DesignBlockKind, number>> = {
  heading: 40,
  text: 72,
  button: 52,
  brandButton: 52,
  divider: 2,
  contentTitle: 80,
  profileHeader: 170,
  contentSocials: 40,
  html: 120,
};

/** Rough rendered height of blocks that grow with their content, used to
 * place and align them before the preview has measured them. */
export function estimatedItemHeight(kind: DesignBlockKind): number {
  return estimatedHeights[kind] ?? 48;
}

/** The height an item takes: its own `h` for images and shapes, else what
 * the preview measured, else an estimate. */
export function itemHeight(item: CanvasItem, measured?: number): number {
  if (item.h !== undefined && fillsItem(item.block.kind)) return item.h;
  const natural = measured ?? estimatedItemHeight(item.block.kind);
  return Math.max(item.h ?? 0, natural);
}

export function itemBox(item: CanvasItem, measured?: number): CanvasBox {
  return { x: item.x, y: item.y, w: item.w, h: itemHeight(item, measured) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps an item valid for the contract: integers inside the schema ranges
 * and at least `CANVAS_GRIP` px of it on a canvas `canvasHeight` tall.
 * `measured` is the rendered height of blocks without `h`.
 */
export function clampItem(
  item: CanvasItem,
  canvasHeight: number,
  measured?: number,
): CanvasItem {
  const w = clamp(Math.round(item.w), 8, CANVAS_WIDTH * 2);
  const h =
    item.h === undefined
      ? undefined
      : clamp(Math.round(item.h), 8, DESIGN_LIMITS.canvasHeight);
  const height = itemHeight(h === undefined ? item : { ...item, h }, measured);
  const x = clamp(
    Math.round(item.x),
    Math.max(-CANVAS_WIDTH, CANVAS_GRIP - w),
    CANVAS_WIDTH - CANVAS_GRIP,
  );
  const y = clamp(
    Math.round(item.y),
    Math.max(-400, CANVAS_GRIP - height),
    Math.max(
      0,
      Math.min(DESIGN_LIMITS.canvasHeight, canvasHeight - CANVAS_GRIP),
    ),
  );
  const { h: _h, z: _z, ...rest } = item;
  const z = item.z === undefined ? undefined : clamp(Math.round(item.z), 0, 99);
  return {
    ...rest,
    x,
    y,
    w,
    ...(h === undefined ? {} : { h }),
    ...(z ? { z } : {}),
  };
}

// ---------------------------------------------------------------------------
// Stacking. `z` orders what is drawn on top; items with the same `z` stack in
// reading order (the DOM order), so the effective stack is (z, reading index).
// ---------------------------------------------------------------------------

/** Item ids from the back to the front. */
export function stackOrder(items: readonly CanvasItem[]): string[] {
  const reading = canvasReadingOrder(items);
  return reading
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.z ?? 0) - (b.item.z ?? 0) || a.index - b.index)
    .map(({ item }) => item.block.id);
}

/** Rewrites `z` so the stack follows `order` (back to front). Every item
 * gets its own layer, so later moves never reshuffle the stack. */
export function applyStack(
  items: readonly CanvasItem[],
  order: readonly string[],
): CanvasItem[] {
  const layer = new Map(order.map((id, index) => [id, index]));
  return items.map((item) => {
    const z = layer.get(item.block.id) ?? 0;
    const { z: _old, ...rest } = item;
    return z ? { ...rest, z } : rest;
  });
}

export function topZ(items: readonly CanvasItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.z ?? 0), 0);
}

/** Adds `item` on top of every other one. */
export function withItemOnTop(
  items: readonly CanvasItem[],
  item: CanvasItem,
): CanvasItem[] {
  const { z: _z, ...rest } = item;
  if (!items.length) return [rest];
  const base =
    topZ(items) + 1 > 99 ? applyStack(items, stackOrder(items)) : [...items];
  return [...base, { ...rest, z: topZ(base) + 1 }];
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * A new item for `block` on `section`: its default size, centered on `at`
 * (or on the canvas) and nudged by `DUPLICATE_OFFSET` while another item
 * sits exactly there. Add it with `withItemOnTop`.
 */
export function placeNewItem(
  section: CanvasSection,
  block: DesignBlock,
  at?: CanvasPoint,
): CanvasItem {
  const size = defaultItemSize(block.kind);
  const height = size.h ?? estimatedItemHeight(block.kind);
  const center = at ?? { x: CANVAS_WIDTH / 2, y: section.height / 2 };
  let x = Math.round(center.x - size.w / 2);
  let y = Math.round(center.y - height / 2);
  for (
    let attempt = 0;
    attempt < DESIGN_LIMITS.canvasItems &&
    section.items.some((item) => item.x === x && item.y === y);
    attempt += 1
  ) {
    x += DUPLICATE_OFFSET;
    y += DUPLICATE_OFFSET;
  }
  return clampItem(
    { block, x, y, w: size.w, ...(size.h ? { h: size.h } : {}) },
    section.height,
  );
}

/** The lowest bottom edge of a canvas's items (for snapping its height). */
export function lowestItemBottom(
  section: CanvasSection,
  measured: (blockId: string) => number | undefined = () => undefined,
): number {
  return section.items.reduce(
    (max, item) =>
      Math.max(max, item.y + itemHeight(item, measured(item.block.id))),
    0,
  );
}

/** The shortest a canvas can be without leaving an item outside. */
export function minCanvasHeight(section: CanvasSection): number {
  const lowestTop = section.items.reduce(
    (max, item) => Math.max(max, item.y + CANVAS_GRIP),
    0,
  );
  return clamp(lowestTop, 80, DESIGN_LIMITS.canvasHeight);
}

// ---------------------------------------------------------------------------
// Multi-select (shift-click or marquee): align several items of one canvas
// to each other, or spread the middle ones evenly. Pure geometry; heights
// come from `measured` where given, else the same estimate as everywhere
// else (an aligned block can still be nudged afterwards).
// ---------------------------------------------------------------------------

export type MultiAlign =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom";

export function alignItems(
  items: readonly CanvasItem[],
  ids: readonly string[],
  align: MultiAlign,
  measured: (blockId: string) => number | undefined = () => undefined,
): CanvasItem[] {
  const idSet = new Set(ids);
  const boxed = items
    .filter((item) => idSet.has(item.block.id))
    .map((item) => ({ item, box: itemBox(item, measured(item.block.id)) }));
  if (boxed.length < 2) return [...items];
  const minX = Math.min(...boxed.map(({ box }) => box.x));
  const maxRight = Math.max(...boxed.map(({ box }) => box.x + box.w));
  const minY = Math.min(...boxed.map(({ box }) => box.y));
  const maxBottom = Math.max(...boxed.map(({ box }) => box.y + box.h));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;
  const patched = new Map<string, CanvasItem>();
  for (const { item, box } of boxed) {
    switch (align) {
      case "left":
        patched.set(item.block.id, { ...item, x: Math.round(minX) });
        break;
      case "right":
        patched.set(item.block.id, {
          ...item,
          x: Math.round(maxRight - box.w),
        });
        break;
      case "center-h":
        patched.set(item.block.id, {
          ...item,
          x: Math.round(centerX - box.w / 2),
        });
        break;
      case "top":
        patched.set(item.block.id, { ...item, y: Math.round(minY) });
        break;
      case "bottom":
        patched.set(item.block.id, {
          ...item,
          y: Math.round(maxBottom - box.h),
        });
        break;
      case "center-v":
        patched.set(item.block.id, {
          ...item,
          y: Math.round(centerY - box.h / 2),
        });
        break;
    }
  }
  return items.map((item) => patched.get(item.block.id) ?? item);
}

export type MultiDistributeAxis = "horizontal" | "vertical";

/** Spreads the selected items so the gaps between them (edge to edge) are
 * equal, keeping the outermost two where they are. Needs at least 3. */
export function distributeItems(
  items: readonly CanvasItem[],
  ids: readonly string[],
  axis: MultiDistributeAxis,
  measured: (blockId: string) => number | undefined = () => undefined,
): CanvasItem[] {
  const idSet = new Set(ids);
  const boxed = items
    .filter((item) => idSet.has(item.block.id))
    .map((item) => ({ item, box: itemBox(item, measured(item.block.id)) }));
  if (boxed.length < 3) return [...items];
  const start = (box: CanvasBox) => (axis === "horizontal" ? box.x : box.y);
  const size = (box: CanvasBox) => (axis === "horizontal" ? box.w : box.h);
  const sorted = [...boxed].sort((a, b) => start(a.box) - start(b.box));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [...items];
  const span = start(last.box) + size(last.box) - start(first.box);
  const sumSizes = sorted.reduce((sum, entry) => sum + size(entry.box), 0);
  const gap = (span - sumSizes) / (sorted.length - 1);
  const patched = new Map<string, CanvasItem>();
  let cursor = start(first.box);
  for (const { item, box } of sorted) {
    patched.set(
      item.block.id,
      axis === "horizontal"
        ? { ...item, x: Math.round(cursor) }
        : { ...item, y: Math.round(cursor) },
    );
    cursor += size(box) + gap;
  }
  return items.map((item) => patched.get(item.block.id) ?? item);
}
