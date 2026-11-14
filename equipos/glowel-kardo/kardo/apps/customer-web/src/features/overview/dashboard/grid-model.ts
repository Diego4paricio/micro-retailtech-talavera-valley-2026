import type { Layout, LayoutItem } from "react-grid-layout";
import { collides, verticalCompactor } from "react-grid-layout/core";
import { widgetCatalog } from "./catalog.js";
import { createWidget, GRID_COLUMNS, MAX_WIDGETS } from "./layout-store.js";
import type { WidgetInstance } from "./types.js";

/**
 * Pure geometry of the Resumen board: how saved widgets (always on a
 * 12-column grid) become react-grid-layout layouts per breakpoint, and the
 * keyboard alternatives to dragging (move, resize, duplicate, remove).
 */

export type GridBreakpoint = "lg" | "md" | "sm";

/**
 * Minimum width of the board itself (not the window) for each breakpoint.
 * The sidebar and page margins take ~370 px, so a 1280 px laptop still gets
 * the 12 editable columns.
 */
export const gridBreakpoints: Record<GridBreakpoint, number> = {
  lg: 800,
  md: 540,
  sm: 0,
};
export const gridCols: Record<GridBreakpoint, number> = {
  lg: GRID_COLUMNS,
  md: 6,
  sm: 1,
};
export const ROW_HEIGHT = 64;
export const GRID_GAP = 16;

export function breakpointFor(width: number): GridBreakpoint {
  if (width >= gridBreakpoints.lg) return "lg";
  if (width >= gridBreakpoints.md) return "md";
  return "sm";
}

/** Pixel height of a widget `h` rows tall (gaps between rows included). */
export function rowsToPixels(h: number): number {
  return h * ROW_HEIGHT + Math.max(0, h - 1) * GRID_GAP;
}

/** A column of the board on a full-width page (74rem, 12 columns). */
const REFERENCE_COLUMN = 84;

/** Pixel width of a widget `w` columns wide on a full-width page, so a
 * preview can show it at the size it will take on the board. */
export function columnsToPixels(w: number): number {
  return w * REFERENCE_COLUMN + Math.max(0, w - 1) * GRID_GAP;
}

type Box = { x: number; y: number; w: number; h: number };

export type SizeLimits = {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
};

export function sizeLimits(widget: Pick<WidgetInstance, "type">): SizeLimits {
  const { minSize, maxSize } = widgetCatalog[widget.type];
  return {
    minW: Math.min(minSize.w, GRID_COLUMNS),
    maxW: Math.min(maxSize.w, GRID_COLUMNS),
    minH: minSize.h,
    maxH: maxSize.h,
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Top to bottom, then left to right: the order the grid compacts in. */
export function readingOrder<T extends Box>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** A widget as a 12-column react-grid-layout item, with its size limits. */
export function toGridItem(widget: WidgetInstance): LayoutItem {
  const limits = sizeLimits(widget);
  return {
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    ...limits,
  };
}

/**
 * On 6 columns a widget keeps its share of the row (half its 12-column
 * width), never narrower than a third: tablets and laptops with the sidebar
 * open see the desktop board scaled, and an edit there maps back exactly.
 */
export function mediumWidth(w: number): number {
  return clamp(Math.round(w / 2), 2, gridCols.md);
}

function mediumLimits(widget: Pick<WidgetInstance, "type">): SizeLimits {
  const limits = sizeLimits(widget);
  const minW = clamp(Math.ceil(limits.minW / 2), 2, gridCols.md);
  const maxW = clamp(Math.floor(limits.maxW / 2), minW, gridCols.md);
  return { minW, maxW, minH: limits.minH, maxH: limits.maxH };
}

/**
 * Places items in the given order, each as high (then as far left) as it
 * fits but never before the previous one, so the visual order is the list
 * order. Heights and widths are kept (widths capped to `cols`).
 */
export function packInOrder(
  items: readonly { i: string; w: number; h: number }[],
  cols: number,
): LayoutItem[] {
  const placed: LayoutItem[] = [];
  let cursor = { x: 0, y: 0 };
  for (const item of items) {
    const w = Math.max(1, Math.min(item.w, cols));
    let { x, y } = cursor;
    for (;;) {
      if (x + w > cols) {
        x = 0;
        y += 1;
        continue;
      }
      const candidate = { i: item.i, x, y, w, h: item.h };
      if (!placed.some((other) => collides(other, candidate))) break;
      x += 1;
    }
    placed.push({ i: item.i, x, y, w, h: item.h });
    cursor = { x: x + w, y };
  }
  return placed;
}

/**
 * Layouts for every breakpoint: the saved 12 columns on wide boards, the same
 * board at half resolution on 6 columns, and one stacked column on phones —
 * the smaller two in reading order. All three can be edited by dragging.
 */
export function gridLayouts(
  widgets: readonly WidgetInstance[],
): Record<GridBreakpoint, LayoutItem[]> {
  const ordered = readingOrder(widgets);
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const withLimits = (
    items: LayoutItem[],
    limits: (widget: WidgetInstance) => SizeLimits,
  ) =>
    items.map((item) => {
      const widget = byId.get(item.i);
      return widget ? { ...item, ...limits(widget) } : item;
    });
  return {
    lg: widgets.map(toGridItem),
    md: withLimits(
      packInOrder(
        ordered.map((widget) => ({
          i: widget.id,
          w: mediumWidth(widget.w),
          h: widget.h,
        })),
        gridCols.md,
      ),
      mediumLimits,
    ),
    sm: withLimits(
      packInOrder(
        ordered.map((widget) => ({ i: widget.id, w: 1, h: widget.h })),
        gridCols.sm,
      ),
      (widget) => ({ ...sizeLimits(widget), minW: 1, maxW: 1 }),
    ),
  };
}

function withBox(widget: WidgetInstance, box: Partial<Box>): WidgetInstance {
  const limits = sizeLimits(widget);
  const w = clamp(box.w ?? widget.w, limits.minW, limits.maxW);
  const h = clamp(box.h ?? widget.h, limits.minH, limits.maxH);
  return {
    ...widget,
    w,
    h,
    x: clamp(box.x ?? widget.x, 0, GRID_COLUMNS - w),
    y: Math.max(0, box.y ?? widget.y),
  };
}

/**
 * Resolves overlaps and closes vertical gaps exactly like the grid does, so
 * what is saved is what is drawn. A `pinned` widget keeps its place and the
 * others flow around it (what dragging or resizing it would do).
 */
export function compactWidgets(
  widgets: readonly WidgetInstance[],
  pinnedId?: string,
): WidgetInstance[] {
  const items = widgets.map((widget) => ({
    ...toGridItem(widget),
    static: widget.id === pinnedId,
  }));
  const compacted = verticalCompactor.compact(items, GRID_COLUMNS);
  const placed = widgets.map((widget, index) => {
    const item = compacted[index];
    return item ? { ...widget, x: item.x, y: item.y } : widget;
  });
  // The pinned widget may now sit under a gap: close it like the grid will.
  return pinnedId === undefined ? placed : compactWidgets(placed);
}

/**
 * Takes positions and sizes from the grid after a drag or a resize. On 12
 * columns they are the saved geometry; on 6 or 1 column the new reading order
 * (and, on 6, a width at half resolution) is replayed on the 12-column board.
 */
export function applyGridLayout(
  widgets: readonly WidgetInstance[],
  layout: Layout,
  breakpoint: GridBreakpoint = "lg",
): WidgetInstance[] {
  const byId = new Map(layout.map((item) => [item.i, item]));
  if (breakpoint === "lg") {
    return widgets.map((widget) => {
      const item = byId.get(widget.id);
      return item
        ? withBox(widget, { x: item.x, y: item.y, w: item.w, h: item.h })
        : widget;
    });
  }

  const before = gridLayouts(widgets)[breakpoint];
  const beforeById = new Map(before.map((item) => [item.i, item]));
  const order = readingOrder(
    layout.filter((item) => beforeById.has(item.i)),
  ).map((item) => item.i);
  const unchanged =
    order.join() ===
      readingOrder(before)
        .map((item) => item.i)
        .join() &&
    layout.every((item) => {
      const previous = beforeById.get(item.i);
      return !previous || (previous.w === item.w && previous.h === item.h);
    });
  if (unchanged) return [...widgets];

  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]));
  const sized = order.flatMap((id) => {
    const widget = widgetById.get(id);
    const item = byId.get(id);
    const previous = beforeById.get(id);
    if (!widget || !item || !previous) return [];
    const w =
      breakpoint === "md" && item.w !== previous.w ? item.w * 2 : widget.w;
    const h = item.h !== previous.h ? item.h : widget.h;
    return [withBox(widget, { w, h })];
  });
  // Anything the grid did not report keeps its relative place at the end.
  for (const widget of readingOrder(widgets))
    if (!order.includes(widget.id)) sized.push(widget);
  const packed = packInOrder(
    sized.map((widget) => ({ i: widget.id, w: widget.w, h: widget.h })),
    GRID_COLUMNS,
  );
  return sized.map((widget, index) => {
    const item = packed[index];
    return item ? { ...widget, x: item.x, y: item.y } : widget;
  });
}

/** True when every widget keeps its place and size. */
export function samePlacement(
  a: readonly WidgetInstance[],
  b: readonly WidgetInstance[],
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((widget) => [widget.id, widget]));
  return a.every((widget) => {
    const other = byId.get(widget.id);
    return (
      other !== undefined &&
      other.x === widget.x &&
      other.y === widget.y &&
      other.w === widget.w &&
      other.h === widget.h
    );
  });
}

// ---------------------------------------------------------------------------
// Keyboard alternatives to dragging
// ---------------------------------------------------------------------------

/** Position (0-based) of a widget in reading order, or -1. */
export function orderIndex(
  widgets: readonly WidgetInstance[],
  id: string,
): number {
  return readingOrder(widgets).findIndex((widget) => widget.id === id);
}

/**
 * Moves a widget one place earlier (-1) or later (+1) in reading order.
 * Peers side by side (same row and height) swap places within the row;
 * otherwise the board is re-flowed in the new order (so moving back
 * restores it).
 */
export function moveWidget(
  widgets: readonly WidgetInstance[],
  id: string,
  offset: -1 | 1,
): WidgetInstance[] {
  const order = readingOrder(widgets);
  const index = order.findIndex((widget) => widget.id === id);
  const target = order[index + offset];
  const current = order[index];
  if (index === -1 || !current || !target) return [...widgets];

  if (current.y === target.y && current.h === target.h) {
    const [left, right] =
      current.x < target.x ? [current, target] : [target, current];
    const moved = new Map<string, number>([
      [right.id, left.x],
      [left.id, right.x + right.w - left.w],
    ]);
    return compactWidgets(
      widgets.map((widget) => {
        const x = moved.get(widget.id);
        return x === undefined ? widget : withBox(widget, { x });
      }),
    );
  }

  const reordered = [...order];
  reordered[index] = target;
  reordered[index + offset] = current;
  const packed = packInOrder(
    reordered.map((widget) => ({ i: widget.id, w: widget.w, h: widget.h })),
    GRID_COLUMNS,
  );
  return reordered.map((widget, position) => {
    const box = packed[position];
    return box ? { ...widget, x: box.x, y: box.y } : widget;
  });
}

/** Widths the menu steps through: quarters, thirds, halves and full. */
const widthSteps = [3, 4, 6, 8, 9, 12];

/** The next width up (+1) or down (-1) within the widget's limits. */
export function stepWidth(
  widget: WidgetInstance,
  direction: -1 | 1,
): number | null {
  const { minW, maxW } = sizeLimits(widget);
  const options = [...new Set([minW, maxW, ...widthSteps])]
    .filter((value) => value >= minW && value <= maxW)
    .sort((a, b) => a - b);
  const next =
    direction > 0
      ? options.find((value) => value > widget.w)
      : options.reverse().find((value) => value < widget.w);
  return next ?? null;
}

/** One row taller (+1) or shorter (-1), within the widget's limits. */
export function stepHeight(
  widget: WidgetInstance,
  direction: -1 | 1,
): number | null {
  const { minH, maxH } = sizeLimits(widget);
  const next = widget.h + direction;
  return next >= minH && next <= maxH ? next : null;
}

/** New size for a widget; neighbours it now covers move out of its way. */
export function resizeWidget(
  widgets: readonly WidgetInstance[],
  id: string,
  size: { w?: number; h?: number },
): WidgetInstance[] {
  const next = widgets.map((widget) =>
    widget.id === id ? withBox(widget, size) : widget,
  );
  return compactWidgets(next, id);
}

export function removeWidget(
  widgets: readonly WidgetInstance[],
  id: string,
): WidgetInstance[] {
  return compactWidgets(widgets.filter((widget) => widget.id !== id));
}

/**
 * Puts a removed widget back where it was (for "Deshacer"); whatever took
 * its place moves out of the way.
 */
export function restoreWidget(
  widgets: readonly WidgetInstance[],
  removed: WidgetInstance,
): WidgetInstance[] {
  if (widgets.some((widget) => widget.id === removed.id)) return [...widgets];
  return compactWidgets([...widgets, removed], removed.id);
}

/** Appends a widget below everything else. */
export function appendWidget(
  widgets: readonly WidgetInstance[],
  widget: WidgetInstance,
): WidgetInstance[] {
  return compactWidgets([...widgets, widget]);
}

/**
 * A copy with the same options and size: beside the original when that spot
 * is free, otherwise on a new row at the bottom. Null at the widget limit.
 */
export function duplicateWidget(
  widgets: readonly WidgetInstance[],
  id: string,
): { widgets: WidgetInstance[]; copy: WidgetInstance } | null {
  const source = widgets.find((widget) => widget.id === id);
  if (!source || widgets.length >= MAX_WIDGETS) return null;
  const base = createWidget(source.type, widgets, source.config);
  const beside = {
    i: base.id,
    x: source.x + source.w,
    y: source.y,
    w: source.w,
    h: source.h,
  };
  const fits =
    beside.x + beside.w <= GRID_COLUMNS &&
    !widgets.some((widget) => collides(toGridItem(widget), beside));
  const copy: WidgetInstance = {
    ...base,
    w: source.w,
    h: source.h,
    x: fits ? beside.x : 0,
    y: fits ? beside.y : base.y,
  };
  return { widgets: compactWidgets([...widgets, copy], copy.id), copy };
}

/** "la mitad", "un tercio"… for announcing a width. */
export function describeWidth(w: number): string {
  switch (w) {
    case 12:
      return "todo el ancho";
    case 9:
      return "tres cuartos del ancho";
    case 8:
      return "dos tercios del ancho";
    case 6:
      return "la mitad del ancho";
    case 4:
      return "un tercio del ancho";
    case 3:
      return "un cuarto del ancho";
    default:
      return `${w} de ${GRID_COLUMNS} columnas`;
  }
}
