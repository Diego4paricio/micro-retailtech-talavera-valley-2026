import { describe, expect, it } from "vitest";
import { topChannels } from "../src/features/overview/widgets/charts/aggregate.js";
import { donutLayout } from "../src/features/overview/widgets/charts/donut-layout.js";

/**
 * Pure geometry checks for the channel donut (owner report: "la leyenda...
 * si reduzco el tamaño a un 4x3 se salen del marco"). These mirror the
 * catalog's real widget sizes and the gallery/editor preview boxes instead
 * of arbitrary numbers, so a regression here is a regression the owner
 * would actually see.
 */

describe("donutLayout", () => {
  it("never returns a ring wider or taller than the measured box", () => {
    const sizes: [number, number][] = [
      [40, 40],
      [90, 60],
      [60, 90],
      [130, 90],
      [186, 225], // channels at its catalog minimum, 3×4, on a ~940 px board
      [960, 480], // channels at its catalog maximum, 8×7, on a wide board
      [232, 124], // gallery's small preview box
      [260, 240], // editor's larger preview box
    ];
    for (const [width, height] of sizes) {
      const layout = donutLayout(width, height, 3);
      expect(layout.diameter).toBeLessThanOrEqual(width);
      expect(layout.diameter).toBeLessThanOrEqual(height);
      expect(layout.diameter).toBeGreaterThanOrEqual(0);
    }
  });

  it("puts the legend beside the ring once there is width to spare", () => {
    const layout = donutLayout(360, 240, 3);
    expect(layout.legendPosition).toBe("side");
    expect(layout.compactLegend).toBe(false);
    expect(layout.visibleLegendItems).toBe(3);
  });

  it("fits the catalog's 3×4 minimum without shrinking the legend to zero", () => {
    // A widget item that is 3 of 12 columns wide, 4 rows tall, on a modest
    // ~940 px board — the exact shape the owner reported overflowing.
    const layout = donutLayout(186, 225, 3);
    expect(layout.diameter).toBeGreaterThan(0);
    expect(layout.diameter).toBeLessThanOrEqual(186);
    expect(layout.diameter).toBeLessThanOrEqual(225);
    expect(layout.visibleLegendItems).toBeGreaterThan(0);
  });

  it("keeps the original look (ring over its full legend) when it fits", () => {
    // Default channels widget (4×5) on a wide board, and its 3×4 minimum.
    const standard = donutLayout(316, 296, 3);
    expect(standard).toMatchObject({
      legendPosition: "below",
      compactLegend: false,
      visibleLegendItems: 3,
    });
    expect(standard.diameter).toBeGreaterThanOrEqual(160);
    const minimum = donutLayout(212, 226, 3);
    expect(minimum.legendPosition).toBe("below");
    expect(minimum.compactLegend).toBe(false);
    expect(minimum.diameter).toBeGreaterThanOrEqual(96);
  });

  it("falls back to a compact legend once neither full layout fits", () => {
    const layout = donutLayout(212, 180, 3);
    expect(layout.legendPosition).toBe("side");
    expect(layout.compactLegend).toBe(true);
    expect(layout.diameter).toBe(96);
  });

  it("stacks the legend under the ring when there is no width to spare", () => {
    const layout = donutLayout(70, 200, 3);
    expect(layout.legendPosition).toBe("below");
    expect(layout.diameter).toBeLessThanOrEqual(70);
  });

  it("shrinks the ring itself, rather than overflow, in a near-zero box", () => {
    const layout = donutLayout(20, 15, 3);
    expect(layout.diameter).toBeLessThanOrEqual(20);
    expect(layout.diameter).toBeLessThanOrEqual(15);
  });

  it("shows every legend row once there is height for all of them", () => {
    const layout = donutLayout(360, 400, 3);
    expect(layout.visibleLegendItems).toBe(3);
  });

  it("caps visible legend rows to what the measured height allows", () => {
    const layout = donutLayout(360, 50, 3);
    expect(layout.visibleLegendItems).toBeLessThan(3);
  });
});

describe("topChannels", () => {
  const channels = { nfc: 52, qr: 38, link: 10 };

  it("keeps every channel, in nfc/qr/link order, once the limit covers them all", () => {
    expect(topChannels(channels, 3)).toEqual(["nfc", "qr", "link"]);
    expect(topChannels(channels, 5)).toEqual(["nfc", "qr", "link"]);
  });

  it("drops the smallest channel first, keeping the rest in their usual order", () => {
    expect(topChannels(channels, 2)).toEqual(["nfc", "qr"]);
  });

  it("keeps only the single largest channel at the limit", () => {
    expect(topChannels(channels, 1)).toEqual(["nfc"]);
  });

  it("is empty at a zero limit", () => {
    expect(topChannels(channels, 0)).toEqual([]);
  });
});
