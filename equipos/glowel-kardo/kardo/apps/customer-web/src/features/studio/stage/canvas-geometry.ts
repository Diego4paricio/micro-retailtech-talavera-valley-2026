import {
  CANVAS_WIDTH,
  type CanvasItem,
  type DesignBlock,
} from "@kardo/contracts";
import {
  type CanvasBox,
  defaultItemSize,
  fillsItem,
} from "../model/canvas-items.js";

/**
 * Geometry of the canvas editor that depends on rotation, in design px.
 * The page rotates an item around its center (`r`, degrees, clockwise), so
 * resizing a rotated item keeps the opposite side (or corner) still on the
 * screen instead of in the item's own axes.
 */

export type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type Point = { x: number; y: number };

export function rotatePoint(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/**
 * The new box after dragging `handle` by (dx, dy) screen-aligned design px.
 * `fills` says whether the block takes its height from the box (images,
 * shapes); other blocks only change their width. With `keepAspect` a corner
 * keeps the box's proportions.
 */
export function resizeBox(
  box: CanvasBox,
  rotation: number,
  handle: Handle,
  dx: number,
  dy: number,
  fills: boolean,
  keepAspect: boolean,
  minSize = 8,
): CanvasBox {
  // The pointer move in the item's own axes.
  const local = rotatePoint({ x: dx, y: dy }, -rotation);
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = !fills
    ? 0
    : handle.includes("s")
      ? 1
      : handle.includes("n")
        ? -1
        : 0;
  let w = Math.max(minSize, box.w + sx * local.x);
  let h = Math.max(minSize, box.h + sy * local.y);
  if (keepAspect && fills && sx !== 0 && sy !== 0) {
    const ratio = box.w / box.h;
    if (Math.abs(w / box.w - 1) >= Math.abs(h / box.h - 1)) h = w / ratio;
    else w = h * ratio;
  }
  // The side or corner opposite the handle stays where it is.
  const anchor = { x: (-sx * box.w) / 2, y: (-sy * box.h) / 2 };
  const nextAnchor = { x: (-sx * w) / 2, y: (-sy * h) / 2 };
  const before = rotatePoint(anchor, rotation);
  const after = rotatePoint(nextAnchor, rotation);
  const center = {
    x: box.x + box.w / 2 + before.x - after.x,
    y: box.y + box.h / 2 + before.y - after.y,
  };
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

/** A flow block copied onto a canvas takes its default size there. */
export function itemForBlock(block: DesignBlock): CanvasItem {
  const size = defaultItemSize(block.kind);
  return {
    block,
    x: Math.round((CANVAS_WIDTH - size.w) / 2),
    y: 40,
    w: size.w,
    ...(size.h && fillsItem(block.kind) ? { h: size.h } : {}),
  };
}
