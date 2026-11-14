import type { CustomHtmlModelUsage } from "./model.js";

/**
 * USD per million tokens, by model, for the global daily budget
 * (`custom-html/budget.ts`) and the per-generation audit. Verified against
 * the `claude-api` skill's cached pricing table (2026-09-29), which also
 * calls out Claude Opus 5.5's cache-read rate explicitly as $0.20/MTok
 * (not the usual 0.1x-of-input formula the other two rows follow).
 *
 * `dev-bridge` generations are free (a human/agent answers locally): the
 * caller never prices them through this table.
 */
export type CustomHtmlModelPricing = {
  /** USD per 1,000,000 input tokens. */
  input: number;
  /** USD per 1,000,000 output tokens. */
  output: number;
  /** USD per 1,000,000 tokens written to the 5-minute ephemeral cache. */
  cacheWrite: number;
  /** USD per 1,000,000 tokens read from the cache. */
  cacheRead: number;
};

export const CUSTOM_HTML_MODEL_PRICING: Record<string, CustomHtmlModelPricing> =
  {
    "claude-sonnet-5": {
      input: 2,
      output: 10,
      cacheWrite: 2.5,
      cacheRead: 0.2,
    },
    "claude-haiku-4-5": {
      input: 1,
      output: 5,
      cacheWrite: 1.25,
      cacheRead: 0.1,
    },
    "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  };

/** The single most expensive row, used for a model id this table does not
 * list — better to overestimate a generation's cost against the daily
 * budget than to let an unknown, possibly pricier model run unpriced. */
function mostExpensivePricing(): CustomHtmlModelPricing {
  return Object.values(CUSTOM_HTML_MODEL_PRICING).reduce((worst, row) =>
    row.output > worst.output ? row : worst,
  );
}

export function pricingForModel(model: string): CustomHtmlModelPricing {
  return CUSTOM_HTML_MODEL_PRICING[model] ?? mostExpensivePricing();
}

/** Cost of one model turn in micro-USD (1 / 1,000,000 of a dollar), so the
 * daily budget can be kept as an exact integer instead of a floating-point
 * dollar amount. */
export function usageCostMicroUsd(
  model: string,
  usage: CustomHtmlModelUsage,
): number {
  const pricing = pricingForModel(model);
  const dollars =
    (usage.inputTokens * pricing.input) / 1_000_000 +
    (usage.outputTokens * pricing.output) / 1_000_000 +
    (usage.cacheWriteTokens * pricing.cacheWrite) / 1_000_000 +
    (usage.cacheReadTokens * pricing.cacheRead) / 1_000_000;
  return Math.round(dollars * 1_000_000);
}
