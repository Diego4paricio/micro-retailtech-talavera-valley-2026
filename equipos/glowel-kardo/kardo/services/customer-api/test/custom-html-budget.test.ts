import { describe, expect, it, vi } from "vitest";
import { createInMemoryCustomHtmlBudget } from "../src/custom-html/budget.js";
import { UnavailableError } from "../src/errors.js";

describe("createInMemoryCustomHtmlBudget", () => {
  it("allows generations while under the daily budget", async () => {
    const budget = createInMemoryCustomHtmlBudget({ dailyBudgetUsd: 1 });
    await expect(budget.checkBeforeGeneration()).resolves.toBeUndefined();
    await budget.recordSpend(500_000); // $0.50
    await expect(budget.checkBeforeGeneration()).resolves.toBeUndefined();
  });

  it("fails fast with 503 CUSTOM_HTML_AI_BUDGET once today's spend reaches the cap", async () => {
    const budget = createInMemoryCustomHtmlBudget({ dailyBudgetUsd: 1 });
    await budget.recordSpend(1_000_000); // exactly $1.00
    await expect(budget.checkBeforeGeneration()).rejects.toMatchObject({
      code: "CUSTOM_HTML_AI_BUDGET",
      statusCode: 503,
    });
  });

  it("gives a Spanish message the panel can show as-is", async () => {
    const budget = createInMemoryCustomHtmlBudget({ dailyBudgetUsd: 0 });
    await expect(budget.checkBeforeGeneration()).rejects.toThrow(
      UnavailableError,
    );
    await expect(budget.checkBeforeGeneration()).rejects.toThrow(
      /IA de Kardo descansa/,
    );
  });

  it("logs a structured warning (no content) exactly once when crossing 50, 80 and 100 percent", async () => {
    const warn = vi.fn();
    const budget = createInMemoryCustomHtmlBudget({
      dailyBudgetUsd: 1,
      logger: { warn },
    });
    await budget.recordSpend(400_000); // 40% - no warning yet
    expect(warn).not.toHaveBeenCalled();

    await budget.recordSpend(150_000); // 55% - crosses 50%
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ threshold: 50 });
    expect(String(warn.mock.calls[0]?.[1])).toContain("50%");

    await budget.recordSpend(300_000); // 85% - crosses 80%
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toMatchObject({ threshold: 80 });

    await budget.recordSpend(200_000); // 105% - crosses 100%
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[2]?.[0]).toMatchObject({ threshold: 100 });

    // No content anywhere in the logged details.
    for (const call of warn.mock.calls) {
      const details = call[0] as Record<string, unknown>;
      expect(Object.keys(details).sort()).toEqual(
        ["budgetMicroUsd", "spentMicroUsd", "threshold"].sort(),
      );
    }
  });

  it("jumping straight past several thresholds in one add logs each of them once", async () => {
    const warn = vi.fn();
    const budget = createInMemoryCustomHtmlBudget({
      dailyBudgetUsd: 1,
      logger: { warn },
    });
    await budget.recordSpend(1_000_000); // straight to 100%
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map((call) => call[0].threshold)).toEqual([
      50, 80, 100,
    ]);
  });

  it("resets on the next UTC day", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
      const budget = createInMemoryCustomHtmlBudget({ dailyBudgetUsd: 1 });
      await budget.recordSpend(1_000_000);
      await expect(budget.checkBeforeGeneration()).rejects.toThrow(
        UnavailableError,
      );
      vi.setSystemTime(new Date("2026-01-02T00:00:01.000Z"));
      await expect(budget.checkBeforeGeneration()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
