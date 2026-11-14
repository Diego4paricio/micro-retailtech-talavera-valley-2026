import { describe, expect, it } from "vitest";
import {
  formatDelta,
  formatDuration,
  formatEntitlement,
  formatNumber,
  formatPercent,
  formatRatio,
  trendDelta,
} from "../src/lib/format.js";

describe("formatNumber", () => {
  it("formats with the es-MX locale grouping", () => {
    expect(formatNumber(1_234_567)).toBe("1,234,567");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatPercent / formatRatio", () => {
  it("formatPercent guards against a zero total", () => {
    expect(formatPercent(5, 0)).toBe("0 %");
    expect(formatPercent(1, 4)).toBe("25%");
  });

  it("formatRatio renders null as an em dash", () => {
    expect(formatRatio(null)).toBe("—");
    expect(formatRatio(0.5)).toBe("50%");
  });
});

describe("trendDelta / formatDelta", () => {
  it("trendDelta is null without a positive baseline", () => {
    expect(trendDelta(10, 0)).toBeNull();
    expect(trendDelta(10, -5)).toBeNull();
  });

  it("trendDelta computes the relative change vs. the previous period", () => {
    expect(trendDelta(120, 100)).toBe(20);
    expect(trendDelta(80, 100)).toBe(-20);
  });

  it("formatDelta signs and rounds, and hides a null/NaN trend", () => {
    expect(formatDelta(12.4)).toBe("+12");
    expect(formatDelta(-8.6)).toBe("-9");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(null)).toBeNull();
    expect(formatDelta(Number.NaN)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("chooses seconds, minutes or hours based on magnitude", () => {
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(190)).toBe("3.2 min");
    expect(formatDuration(5_100)).toBe("1.4 h");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatEntitlement", () => {
  it("renders null as unlimited and booleans as sí/no", () => {
    expect(formatEntitlement(null)).toBe("Ilimitado");
    expect(formatEntitlement(true)).toBe("Sí");
    expect(formatEntitlement(false)).toBe("No");
    expect(formatEntitlement(25)).toBe("25");
  });
});
