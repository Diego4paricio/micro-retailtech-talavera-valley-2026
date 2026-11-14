import { describe, expect, it } from "vitest";
import {
  widgetCatalog,
  widgetTitle,
} from "../src/features/overview/dashboard/catalog.js";
import {
  createWidget,
  defaultWidgets,
  GRID_COLUMNS,
  MAX_WIDGETS,
  normalizeWidgets,
  toLayout,
} from "../src/features/overview/dashboard/layout-store.js";
import { widgetTypes } from "../src/features/overview/dashboard/types.js";

describe("widget catalog", () => {
  it("defines every widget type with consistent sizes and valid defaults", () => {
    for (const type of widgetTypes) {
      const definition = widgetCatalog[type];
      expect(definition.type).toBe(type);
      const { minSize, defaultSize, maxSize } = definition;
      expect(minSize.w).toBeLessThanOrEqual(defaultSize.w);
      expect(defaultSize.w).toBeLessThanOrEqual(maxSize.w);
      expect(maxSize.w).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(minSize.h).toBeLessThanOrEqual(defaultSize.h);
      expect(defaultSize.h).toBeLessThanOrEqual(maxSize.h);
      for (const field of definition.fields) {
        const value = definition.defaultConfig[field.key];
        if (field.kind === "toggle") expect(typeof value).toBe("boolean");
        else
          expect(field.options.map((option) => option.value)).toContain(value);
      }
      expect(
        widgetTitle(type, definition.defaultConfig).length,
      ).toBeGreaterThan(0);
    }
  });

  it("titles follow the options", () => {
    expect(widgetTitle("trend", { metric: "clicks" })).toBe("Clics por día");
    expect(widgetTitle("kpi", { metric: "conversionRate" })).toBe(
      "Tasa de conversión",
    );
    expect(
      widgetTitle("ranking", {
        dimension: "experiences",
        metric: "conversion",
      }),
    ).toBe("Páginas con más conversión");
  });
});

describe("default board", () => {
  it("fits the grid without overlaps", () => {
    const widgets = defaultWidgets();
    expect(normalizeWidgets(toLayout(widgets).widgets)).toEqual(widgets);
    const cells = new Set<string>();
    for (const widget of widgets) {
      expect(widget.x + widget.w).toBeLessThanOrEqual(GRID_COLUMNS);
      for (let x = widget.x; x < widget.x + widget.w; x += 1)
        for (let y = widget.y; y < widget.y + widget.h; y += 1) {
          const cell = `${x}:${y}`;
          expect(cells.has(cell)).toBe(false);
          cells.add(cell);
        }
    }
  });
});

describe("normalizeWidgets", () => {
  it("drops unknown types and duplicates, and clamps sizes and positions", () => {
    const widgets = normalizeWidgets([
      { id: "a", type: "trend", x: 11, y: 0, w: 20, h: 1, config: {} },
      { id: "a", type: "trend", x: 0, y: 0, w: 8, h: 5, config: {} },
      { id: "b", type: "ghost", x: 0, y: 0, w: 4, h: 4, config: {} },
    ]);
    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({ id: "a", x: 0, w: 12, h: 4 });
  });

  it("keeps valid options and restores invalid ones to their default", () => {
    const [widget] = normalizeWidgets([
      {
        id: "t",
        type: "trend",
        x: 0,
        y: 0,
        w: 8,
        h: 5,
        config: { metric: "leads", chart: "pie", compare: "yes", extra: 1 },
      },
    ]);
    expect(widget?.config).toEqual({
      metric: "leads",
      chart: "area",
      compare: true,
    });
  });

  it("never returns more than the maximum", () => {
    const many = Array.from({ length: MAX_WIDGETS + 5 }, (_, index) => ({
      id: `k-${index}`,
      type: "kpi",
      x: 0,
      y: index * 2,
      w: 3,
      h: 2,
      config: {},
    }));
    expect(normalizeWidgets(many)).toHaveLength(MAX_WIDGETS);
  });
});

describe("createWidget", () => {
  it("adds a widget below the board with its defaults and a fresh id", () => {
    const board = defaultWidgets();
    const widget = createWidget("funnel", board);
    const bottom = Math.max(...board.map((item) => item.y + item.h));
    expect(widget).toMatchObject({
      type: "funnel",
      x: 0,
      y: bottom,
      w: 4,
      h: 5,
    });
    expect(board.some((item) => item.id === widget.id)).toBe(false);
    expect(widget.id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(createWidget("kpi", board, { metric: "peakHour" }).config).toEqual({
      metric: "peakHour",
      sparkline: true,
    });
  });
});
