import type { Sql } from "postgres";
import { UnavailableError } from "../errors.js";

/**
 * Estudio de Experiences, modo HTML: global daily budget in USD for
 * "Pídele a la IA de Kardo" (`CUSTOM_HTML_AI_DAILY_BUDGET_USD`, default 10),
 * on top of the existing per-organization daily cap
 * (`custom-html/limiter.ts`) and the per-plan monthly cap (billing). Spend
 * lives in `kardo_core.custom_html_ai_spend` (migration `20260929160000`),
 * written only through `kardo_private` SECURITY DEFINER functions, so it is
 * checked BEFORE calling the provider and topped up with the real cost
 * after — same "reserve, then commit" shape as `CustomHtmlLimiter`, but for
 * money instead of a generation count.
 */
export type CustomHtmlBudget = {
  /** Throws `UnavailableError("CUSTOM_HTML_AI_BUDGET", ...)` when today's
   * spend is already at or over the daily cap. Call before any provider
   * call so a maxed-out day never spends another cent. */
  checkBeforeGeneration(): Promise<void>;
  /** Adds one generation's real cost to today's spend, after the call. */
  recordSpend(costMicroUsd: number): Promise<void>;
};

export type CustomHtmlBudgetLogger = {
  warn(details: Record<string, unknown>, message: string): void;
};

const noopLogger: CustomHtmlBudgetLogger = { warn: () => undefined };

const WARNING_THRESHOLDS_PERCENT = [50, 80, 100] as const;

/** Which of `WARNING_THRESHOLDS_PERCENT` were not yet reached before this
 * add but are reached now, so the caller logs each crossing exactly once
 * per day rather than on every request past it. */
function newlyCrossedThresholds(
  previousMicroUsd: number,
  newMicroUsd: number,
  budgetMicroUsd: number,
): number[] {
  if (budgetMicroUsd <= 0) return [];
  const previousPercent = (previousMicroUsd / budgetMicroUsd) * 100;
  const newPercent = (newMicroUsd / budgetMicroUsd) * 100;
  return WARNING_THRESHOLDS_PERCENT.filter(
    (threshold) => previousPercent < threshold && newPercent >= threshold,
  );
}

function budgetMicroUsdFrom(dailyBudgetUsd: number): number {
  return Math.round(dailyBudgetUsd * 1_000_000);
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function createPostgresCustomHtmlBudget(
  sql: Sql,
  input: { dailyBudgetUsd: number; logger?: CustomHtmlBudgetLogger },
): CustomHtmlBudget {
  const budgetMicroUsd = budgetMicroUsdFrom(input.dailyBudgetUsd);
  const logger = input.logger ?? noopLogger;
  // The login role cannot reach kardo_private: like every other query of
  // this API, switch to kardo_customer_api for the transaction. The budget
  // is global, so no customer subject is set.
  const asApi = <T>(action: (transaction: Sql) => Promise<T>): Promise<T> =>
    sql.begin(async (transaction) => {
      await transaction`select set_config('role', 'kardo_customer_api', true)`;
      return action(transaction);
    }) as Promise<T>;

  return {
    async checkBeforeGeneration() {
      const rows = await asApi(
        (transaction) => transaction<{ spent: string }[]>`
          select kardo_private.custom_html_ai_spend_today() as spent
        `,
      );
      const spentMicroUsd = Number(rows[0]?.spent ?? 0);
      if (spentMicroUsd >= budgetMicroUsd) {
        throw new UnavailableError(
          "CUSTOM_HTML_AI_BUDGET",
          "La IA de Kardo descansa por hoy. Vuelve mañana o usa tu propia IA.",
        );
      }
    },
    async recordSpend(costMicroUsd) {
      const rows = await asApi(
        (transaction) => transaction<{ total: string }[]>`
          select kardo_private.custom_html_ai_spend_add(${Math.max(0, Math.round(costMicroUsd))}::bigint) as total
        `,
      );
      const newTotal = Number(rows[0]?.total ?? costMicroUsd);
      const previousTotal = newTotal - Math.max(0, Math.round(costMicroUsd));
      for (const threshold of newlyCrossedThresholds(
        previousTotal,
        newTotal,
        budgetMicroUsd,
      )) {
        logger.warn(
          { threshold, spentMicroUsd: newTotal, budgetMicroUsd },
          `Kardo AI daily budget crossed ${threshold}%`,
        );
      }
    },
  };
}

/** Per-process fallback for tests and for running without a database
 * (mirrors `createCustomHtmlLimiter` in `limiter.ts`). */
export function createInMemoryCustomHtmlBudget(input: {
  dailyBudgetUsd: number;
  logger?: CustomHtmlBudgetLogger;
  now?: () => number;
}): CustomHtmlBudget {
  const budgetMicroUsd = budgetMicroUsdFrom(input.dailyBudgetUsd);
  const logger = input.logger ?? noopLogger;
  const now = input.now ?? Date.now;
  const spentByDay = new Map<string, number>();

  return {
    async checkBeforeGeneration() {
      const spentMicroUsd = spentByDay.get(utcDay(now())) ?? 0;
      if (spentMicroUsd >= budgetMicroUsd) {
        throw new UnavailableError(
          "CUSTOM_HTML_AI_BUDGET",
          "La IA de Kardo descansa por hoy. Vuelve mañana o usa tu propia IA.",
        );
      }
    },
    async recordSpend(costMicroUsd) {
      const day = utcDay(now());
      const previousTotal = spentByDay.get(day) ?? 0;
      const addedCost = Math.max(0, Math.round(costMicroUsd));
      const newTotal = previousTotal + addedCost;
      spentByDay.set(day, newTotal);
      for (const threshold of newlyCrossedThresholds(
        previousTotal,
        newTotal,
        budgetMicroUsd,
      )) {
        logger.warn(
          { threshold, spentMicroUsd: newTotal, budgetMicroUsd },
          `Kardo AI daily budget crossed ${threshold}%`,
        );
      }
    },
  };
}
