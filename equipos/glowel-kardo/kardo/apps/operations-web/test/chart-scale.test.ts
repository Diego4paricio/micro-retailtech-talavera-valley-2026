import { describe, expect, it } from "vitest";
import {
  barWidthFor,
  niceMax,
  scaleValue,
  slotWidth,
  tickValues,
} from "../src/lib/chart-scale.js";

describe("niceMax", () => {
  it("is at least 1, even for all-zero or empty data", () => {
    expect(niceMax([])).toBe(1);
    expect(niceMax([0, 0, 0])).toBe(1);
    expect(niceMax([3, 9, 5])).toBe(9);
  });
});

describe("scaleValue", () => {
  it("scales linearly and clamps to [0, size]", () => {
    expect(scaleValue(50, 100, 200)).toBe(100);
    expect(scaleValue(0, 100, 200)).toBe(0);
    expect(scaleValue(150, 100, 200)).toBe(200);
    expect(scaleValue(-10, 100, 200)).toBe(0);
  });

  it("returns 0 when max is not positive", () => {
    expect(scaleValue(5, 0, 200)).toBe(0);
  });
});

describe("tickValues", () => {
  it("returns count + 1 evenly spaced values from 0 to max", () => {
    expect(tickValues(100, 4)).toEqual([0, 25, 50, 75, 100]);
  });

  it("treats a zero or negative count as a single step", () => {
    expect(tickValues(10, 0)).toEqual([0, 10]);
  });
});

describe("slotWidth", () => {
  it("divides the total width evenly, or returns 0 for an empty series", () => {
    expect(slotWidth(4, 400)).toBe(100);
    expect(slotWidth(0, 400)).toBe(0);
  });
});

describe("barWidthFor", () => {
  it("keeps bar width within [min, max] of the slot", () => {
    expect(barWidthFor(10)).toBe(6.2);
    expect(barWidthFor(1)).toBe(3);
    expect(barWidthFor(1000)).toBe(36);
  });
});
