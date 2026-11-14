import { describe, expect, it } from "vitest";
import {
  applyGridLayout,
  breakpointFor,
  compactWidgets,
  describeWidth,
  duplicateWidget,
  gridLayouts,
  moveWidget,
  orderIndex,
  packInOrder,
  readingOrder,
  removeWidget,
  resizeWidget,
  restoreWidget,
  samePlacement,
  stepHeight,
  stepWidth,
  toGridItem,
} from "../src/features/overview/dashboard/grid-model.js";
import {
  defaultWidgets,
  MAX_WIDGETS,
} from "../src/features/overview/dashboard/layout-store.js";
import type { WidgetInstance } from "../src/features/overview/dashboard/types.js";

function kpi(id: string, x: number, y: number, w = 3): WidgetInstance {
  return { id, type: "kpi", x, y, w, h: 2, config: { metric: "taps" } };
}

function chart(
  id: string,
  x: number,
  y: number,
  w: number,
  h = 5,
): WidgetInstance {
  return {
    id,
    type: "trend",
    x,
    y,
    w,
    h,
    config: { metric: "taps", chart: "area", compare: true },
  };
}

const ids = (widgets: readonly WidgetInstance[]) =>
  readingOrder(widgets).map((widget) => widget.id);

const noOverlaps = (widgets: readonly WidgetInstance[]) =>
  widgets.every((a, index) =>
    widgets
      .slice(index + 1)
      .every(
        (b) =>
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      ),
  );

describe("breakpoints", () => {
  it("measures the board, not the window", () => {
    expect(breakpointFor(1184)).toBe("lg");
    expect(breakpointFor(867)).toBe("lg");
    expect(breakpointFor(700)).toBe("md");
    expect(breakpointFor(390)).toBe("sm");
  });
});

describe("grid items", () => {
  it("carries the catalog's size limits", () => {
    expect(toGridItem(kpi("a", 0, 0))).toMatchObject({
      i: "a",
      w: 3,
      h: 2,
      minW: 2,
      maxW: 6,
      minH: 2,
      maxH: 3,
    });
  });

  it("round-trips a layout from the grid, clamped to the limits", () => {
    const widgets = [kpi("a", 0, 0), kpi("b", 3, 0)];
    const next = applyGridLayout(widgets, [
      { i: "a", x: 6, y: 0, w: 3, h: 2 },
      { i: "b", x: 0, y: 0, w: 20, h: 1 },
    ]);
    expect(next[0]).toMatchObject({ x: 6, w: 3 });
    expect(next[1]).toMatchObject({ x: 0, w: 6, h: 2 });
    expect(next[1]?.config).toEqual({ metric: "taps" });
    expect(
      samePlacement(
        widgets,
        widgets.map((w) => ({ ...w })),
      ),
    ).toBe(true);
    expect(samePlacement(widgets, next)).toBe(false);
  });
});

describe("responsive layouts", () => {
  it("keeps 12 columns on wide boards and reflows smaller ones in order", () => {
    const widgets = defaultWidgets();
    const layouts = gridLayouts(widgets);
    expect(layouts.lg).toHaveLength(widgets.length);
    expect(layouts.lg[4]).toMatchObject({ i: "trend", x: 0, y: 2, w: 8 });
    // Six columns show the same board at half resolution: three KPIs per
    // row (the fourth wraps), the trend beside the channel split.
    expect(layouts.md.slice(0, 4).map(({ x, y, w }) => [x, y, w])).toEqual([
      [0, 0, 2],
      [2, 0, 2],
      [4, 0, 2],
      [0, 2, 2],
    ]);
    expect(layouts.md.find((item) => item.i === "trend")).toMatchObject({
      w: 4,
      minW: 2,
      maxW: 6,
    });
    expect(layouts.md.find((item) => item.i === "heatmap")).toMatchObject({
      x: 0,
      w: 6,
    });
    // Phones stack everything in reading order.
    const stacked = layouts.sm;
    expect(stacked.every((item) => item.x === 0 && item.w === 1)).toBe(true);
    expect(stacked.map((item) => item.i)).toEqual(ids(widgets));
    for (let index = 1; index < stacked.length; index += 1) {
      const previous = stacked[index - 1];
      expect(stacked[index]?.y).toBe((previous?.y ?? 0) + (previous?.h ?? 0));
    }
  });

  it("packs in order without placing anything before its predecessor", () => {
    const packed = packInOrder(
      [
        { i: "a", w: 6, h: 2 },
        { i: "b", w: 12, h: 1 },
        { i: "c", w: 3, h: 1 },
      ],
      12,
    );
    // "c" would fit next to "a", but it comes after "b".
    expect(packed.map(({ i, x, y }) => [i, x, y])).toEqual([
      ["a", 0, 0],
      ["b", 0, 2],
      ["c", 0, 3],
    ]);
  });
});

describe("compaction", () => {
  it("closes gaps and resolves overlaps like the grid", () => {
    const next = compactWidgets([kpi("a", 0, 4), kpi("b", 0, 4)]);
    expect(next.map(({ y }) => y)).toEqual([0, 2]);
  });

  it("lets a pinned widget keep its place", () => {
    const next = compactWidgets([kpi("a", 0, 0), kpi("b", 0, 0)], "b");
    expect(next.find((w) => w.id === "b")).toMatchObject({ x: 0, y: 0 });
    expect(next.find((w) => w.id === "a")).toMatchObject({ x: 0, y: 2 });
  });
});

describe("moving without a mouse", () => {
  const row = [kpi("a", 0, 0), kpi("b", 3, 0), kpi("c", 6, 0), kpi("d", 9, 0)];

  it("swaps side-by-side widgets within their row", () => {
    const next = moveWidget(row, "c", -1);
    expect(ids(next)).toEqual(["a", "c", "b", "d"]);
    expect(next.find((w) => w.id === "c")).toMatchObject({ x: 3, y: 0 });
    expect(next.find((w) => w.id === "b")).toMatchObject({ x: 6, y: 0 });
  });

  it("swaps different widths inside the pair's span", () => {
    const pair = [chart("trend", 0, 0, 8), chart("side", 8, 0, 4)];
    const next = moveWidget(pair, "side", -1);
    expect(next.find((w) => w.id === "side")).toMatchObject({ x: 0, w: 4 });
    expect(next.find((w) => w.id === "trend")).toMatchObject({ x: 4, w: 8 });
  });

  it("re-flows across rows and can be undone by moving back", () => {
    const board = [...row, chart("trend", 0, 2, 8), chart("side", 8, 2, 4)];
    const moved = moveWidget(board, "trend", -1);
    expect(ids(moved)).toEqual(["a", "b", "c", "trend", "d", "side"]);
    expect(noOverlaps(moved)).toBe(true);
    const back = moveWidget(moved, "trend", 1);
    expect(ids(back)).toEqual(ids(board));
    expect(samePlacement(back, board)).toBe(true);
  });

  it("does nothing past either end", () => {
    expect(samePlacement(moveWidget(row, "a", -1), row)).toBe(true);
    expect(samePlacement(moveWidget(row, "d", 1), row)).toBe(true);
    expect(orderIndex(row, "c")).toBe(2);
    expect(orderIndex(row, "missing")).toBe(-1);
  });
});

describe("resizing without a mouse", () => {
  it("steps through useful widths within the limits", () => {
    const widget = kpi("a", 0, 0);
    expect(stepWidth(widget, 1)).toBe(4);
    expect(stepWidth(widget, -1)).toBe(2);
    expect(stepWidth({ ...widget, w: 6 }, 1)).toBeNull();
    expect(stepWidth({ ...widget, w: 2 }, -1)).toBeNull();
    const trend = chart("t", 0, 0, 8);
    expect(stepWidth(trend, 1)).toBe(9);
    expect(stepWidth(trend, -1)).toBe(6);
    expect(stepWidth({ ...trend, w: 4 }, -1)).toBeNull();
  });

  it("steps one row at a time within the limits", () => {
    const widget = kpi("a", 0, 0);
    expect(stepHeight(widget, 1)).toBe(3);
    expect(stepHeight(widget, -1)).toBeNull();
    expect(stepHeight({ ...widget, h: 3 }, 1)).toBeNull();
  });

  it("pushes covered neighbours out of the way and never overlaps", () => {
    const row = [kpi("a", 0, 0), kpi("b", 3, 0)];
    const next = resizeWidget(row, "a", { w: 4 });
    expect(next.find((w) => w.id === "a")).toMatchObject({ x: 0, y: 0, w: 4 });
    expect(noOverlaps(next)).toBe(true);
  });

  it("stays inside the grid when growing at the right edge", () => {
    const next = resizeWidget([kpi("a", 9, 0)], "a", { w: 6 });
    expect(next[0]).toMatchObject({ x: 6, w: 6 });
  });
});

describe("duplicate, remove and restore", () => {
  it("duplicates beside the original when there is room", () => {
    const result = duplicateWidget([kpi("a", 0, 0)], "a");
    expect(result?.copy).toMatchObject({ type: "kpi", x: 3, y: 0, w: 3 });
    expect(result?.copy.id).not.toBe("a");
    expect(result?.copy.config).toEqual({ metric: "taps", sparkline: true });
    expect(result?.widgets).toHaveLength(2);
  });

  it("duplicates onto a new row when the row is full", () => {
    const row = [
      kpi("a", 0, 0),
      kpi("b", 3, 0),
      kpi("c", 6, 0),
      kpi("d", 9, 0),
    ];
    const result = duplicateWidget(row, "b");
    expect(result?.copy).toMatchObject({ x: 0, y: 2 });
    expect(noOverlaps(result?.widgets ?? [])).toBe(true);
  });

  it("refuses to duplicate past the widget limit", () => {
    const full = Array.from({ length: MAX_WIDGETS }, (_, index) =>
      kpi(`k${index}`, (index % 4) * 3, Math.floor(index / 4) * 2),
    );
    expect(duplicateWidget(full, "k0")).toBeNull();
  });

  it("removes and closes the gap, then restores in place", () => {
    const board = [kpi("a", 0, 0, 12), chart("t", 0, 2, 12)];
    const removed = board[0] as WidgetInstance;
    const without = removeWidget(board, "a");
    expect(without).toHaveLength(1);
    expect(without[0]).toMatchObject({ id: "t", y: 0 });
    const restored = restoreWidget(without, removed);
    expect(restored.find((w) => w.id === "a")).toMatchObject({ y: 0 });
    expect(restored.find((w) => w.id === "t")).toMatchObject({ y: 2 });
  });
});

describe("describeWidth", () => {
  it("names common fractions", () => {
    expect(describeWidth(6)).toBe("la mitad del ancho");
    expect(describeWidth(5)).toBe("5 de 12 columnas");
  });
});

describe("editing on smaller boards", () => {
  it("replays a new order from 6 columns on the 12-column board", () => {
    const widgets = defaultWidgets();
    const md = gridLayouts(widgets).md;
    // Drag the trend above the KPIs.
    const moved = md.map((item) =>
      item.i === "trend" ? { ...item, x: 0, y: 0 } : { ...item, y: item.y + 5 },
    );
    const next = applyGridLayout(widgets, moved, "md");
    const first = readingOrder(next)[0];
    expect(first?.id).toBe("trend");
    expect(first).toMatchObject({ x: 0, y: 0, w: 8 });
    expect(next.every((widget) => widget.x + widget.w <= 12)).toBe(true);
  });

  it("doubles a width resized on 6 columns, within the widget limits", () => {
    const widgets = defaultWidgets();
    const md = gridLayouts(widgets).md;
    const resized = md.map((item) =>
      item.i === "trend" ? { ...item, w: 6 } : item,
    );
    const next = applyGridLayout(widgets, resized, "md");
    expect(next.find((widget) => widget.id === "trend")?.w).toBe(12);
    const kpi = md.map((item) =>
      item.i === "kpi-taps" ? { ...item, w: 6 } : item,
    );
    // KPIs stop at 6 of 12 columns.
    expect(
      applyGridLayout(widgets, kpi, "md").find((w) => w.id === "kpi-taps")?.w,
    ).toBe(6);
  });

  it("leaves the board alone when a drop changes nothing", () => {
    const widgets = defaultWidgets();
    const same = applyGridLayout(widgets, gridLayouts(widgets).sm, "sm");
    expect(samePlacement(widgets, same)).toBe(true);
  });

  it("reorders from the phone stack without touching sizes", () => {
    const widgets = defaultWidgets();
    const sm = gridLayouts(widgets).sm;
    const last = sm[sm.length - 1];
    const moved = sm.map((item) =>
      item.i === last?.i ? { ...item, y: -1 } : item,
    );
    const next = applyGridLayout(widgets, moved, "sm");
    expect(readingOrder(next)[0]?.id).toBe(last?.i);
    expect(next.find((widget) => widget.id === last?.i)?.w).toBe(
      widgets.find((widget) => widget.id === last?.i)?.w,
    );
  });
});
