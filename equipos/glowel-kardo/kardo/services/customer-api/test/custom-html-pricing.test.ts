import { describe, expect, it } from "vitest";
import {
  CUSTOM_HTML_MODEL_PRICING,
  pricingForModel,
  usageCostMicroUsd,
} from "../src/custom-html/pricing.js";

describe("pricingForModel", () => {
  it("returns the exact row for a known model", () => {
    expect(pricingForModel("claude-sonnet-5")).toEqual({
      input: 2,
      output: 10,
      cacheWrite: 2.5,
      cacheRead: 0.2,
    });
    expect(pricingForModel("claude-haiku-4-5")).toEqual({
      input: 1,
      output: 5,
      cacheWrite: 1.25,
      cacheRead: 0.1,
    });
  });

  it("falls back to the single most expensive row for an unknown model", () => {
    const mostExpensive = Object.values(CUSTOM_HTML_MODEL_PRICING).reduce(
      (worst, row) => (row.output > worst.output ? row : worst),
    );
    expect(pricingForModel("some-future-model")).toEqual(mostExpensive);
    expect(mostExpensive).toEqual(CUSTOM_HTML_MODEL_PRICING["claude-opus-5-5"]);
  });
});

describe("usageCostMicroUsd", () => {
  it("prices input, output, cache write and cache read tokens for claude-sonnet-5", () => {
    const cost = usageCostMicroUsd("claude-sonnet-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    });
    // $2 + $10 + $2.50 + $0.20 = $14.70 -> 14,700,000 micro-USD.
    expect(cost).toBe(14_700_000);
  });

  it("is zero for zero usage", () => {
    expect(
      usageCostMicroUsd("claude-sonnet-5", {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(0);
  });

  it("rounds to the nearest whole micro-USD", () => {
    const cost = usageCostMicroUsd("claude-haiku-4-5", {
      inputTokens: 3,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    // 3 tokens * $1 / 1,000,000 = $0.000003 -> 3 micro-USD.
    expect(cost).toBe(3);
  });

  it("prices an unknown model using the most expensive row", () => {
    const known = usageCostMicroUsd("claude-opus-5-5", {
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    const unknown = usageCostMicroUsd("mystery-model", {
      inputTokens: 1_000,
      outputTokens: 1_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(unknown).toBe(known);
  });
});
