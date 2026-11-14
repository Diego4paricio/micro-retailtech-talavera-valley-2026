import type { DesignAiUsage } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  assertFeature,
  assertWithinLimit,
  readEffectivePlan,
  readWorkspaceUsage,
} from "../billing/entitlements.js";
import {
  type CustomerIdentity,
  requireMembership,
  withCustomerContext,
} from "../repositories/context.js";

// Estudio de Experiences, modo HTML: "Pídele a la IA de Kardo" is capped at
// 20 generations per organization per UTC day. Every generation costs
// money, so the Postgres limiter keeps the count in
// `kardo_core.custom_html_ai_usage` (migration 20260929010000): the cap then
// holds across every Customer API instance and restart. A generation is
// reserved atomically BEFORE calling the AI and released if it fails, so
// concurrent requests can never go over the cap.
/**
 * What a generation produces (domain audit 2026-10-13, A2-36): `html` is
 * the modo HTML (a full page or a code block), which the plan may turn off
 * (`custom_html.enabled`); `design` is a block design or its ideas, which
 * only the AI's own monthly quota and spend limit gate. Before, every AI
 * call required `custom_html.enabled`, so a plan without modo HTML would
 * also have lost the block designs.
 */
export type AiGenerationKind = "html" | "design";

export type CustomHtmlLimiter = {
  /** Reserves one generation for today (UTC). Returns what remains after
   * it, or null when the organization already reached the cap. */
  reserve(
    identity: CustomerIdentity,
    workspaceId: string,
    kind?: AiGenerationKind,
  ): Promise<number | null>;
  /** Gives a reservation back after a failed generation. */
  release(identity: CustomerIdentity, workspaceId: string): Promise<void>;
  /** The same checks as `reserve` without taking a generation: what
   * remains today, or null at the cap. Asking the AI for design ideas
   * (2026-10-03) only runs while a design could still follow. */
  check(
    identity: CustomerIdentity,
    workspaceId: string,
    kind?: AiGenerationKind,
  ): Promise<number | null>;
  /** What is left today and this month (2026-10-03), for the Estudio to
   * show before generating. Reads only: takes nothing. */
  usage(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<DesignAiUsage>;
};

export const CUSTOM_HTML_DAILY_LIMIT = 20;

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Per-process fallback for tests and for running without a database. */
export function createCustomHtmlLimiter(
  limit: number = CUSTOM_HTML_DAILY_LIMIT,
): CustomHtmlLimiter {
  const counts = new Map<string, number>();
  const key = (workspaceId: string) => `${workspaceId}:${utcDay(Date.now())}`;
  return {
    async reserve(_identity, workspaceId) {
      const used = counts.get(key(workspaceId)) ?? 0;
      if (used >= limit) return null;
      counts.set(key(workspaceId), used + 1);
      return limit - used - 1;
    },
    async release(_identity, workspaceId) {
      const used = counts.get(key(workspaceId)) ?? 0;
      if (used > 0) counts.set(key(workspaceId), used - 1);
    },
    async check(_identity, workspaceId) {
      const used = counts.get(key(workspaceId)) ?? 0;
      return used >= limit ? null : limit - used;
    },
    async usage(_identity, workspaceId) {
      const used = counts.get(key(workspaceId)) ?? 0;
      return {
        enabled: true,
        htmlEnabled: true,
        day: { used, limit, remaining: Math.max(0, limit - used) },
        month: { used, limit: null, remaining: null },
        spendCapReached: false,
      };
    },
  };
}

export function createPostgresCustomHtmlLimiter(
  sql: Sql,
  limit: number = CUSTOM_HTML_DAILY_LIMIT,
): CustomHtmlLimiter {
  return {
    async reserve(identity, workspaceId, kind = "html") {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        // The plan may turn modo HTML off (only for HTML generations, A2-36)
        // or cap the month (billing, 403 PLAN_LIMIT); no plan means no plan
        // limit. The daily cap below stays as an abuse guard on top.
        if (kind === "html")
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        await assertWithinLimit(tx, workspaceId, "ai.generations_month");
        // And the month's spend in dollars (table D, 2026-10-01): one more
        // generation only while the organization is under its cap.
        await assertWithinLimit(tx, workspaceId, "ai.spend_cents_month");
        // One statement: create today's row or add one, only while under
        // the cap. No row back means the cap was already reached.
        const rows = await tx<{ generations: number }[]>`
          insert into kardo_core.custom_html_ai_usage (workspace_id, usage_day, generations)
          values (${workspaceId}::uuid, (now() at time zone 'utc')::date, 1)
          on conflict (workspace_id, usage_day) do update
            set generations = kardo_core.custom_html_ai_usage.generations + 1,
                updated_at = now()
            where kardo_core.custom_html_ai_usage.generations < ${limit}
          returning generations
        `;
        const used = rows[0]?.generations;
        return used === undefined ? null : Math.max(0, limit - used);
      });
    },
    async release(identity, workspaceId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        await tx`
          update kardo_core.custom_html_ai_usage
          set generations = greatest(generations - 1, 0), updated_at = now()
          where workspace_id = ${workspaceId}::uuid
            and usage_day = (now() at time zone 'utc')::date
        `;
      });
    },
    async check(identity, workspaceId, kind = "html") {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        if (kind === "html")
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        await assertWithinLimit(tx, workspaceId, "ai.generations_month");
        await assertWithinLimit(tx, workspaceId, "ai.spend_cents_month");
        const rows = await tx<{ generations: number }[]>`
          select generations from kardo_core.custom_html_ai_usage
          where workspace_id = ${workspaceId}::uuid
            and usage_day = (now() at time zone 'utc')::date
        `;
        const used = rows[0]?.generations ?? 0;
        return used >= limit ? null : limit - used;
      });
    },
    async usage(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const { entitlements } = await readEffectivePlan(tx, workspaceId);
        const usage = await readWorkspaceUsage(tx, workspaceId);
        const rows = await tx<{ generations: number }[]>`
          select generations from kardo_core.custom_html_ai_usage
          where workspace_id = ${workspaceId}::uuid
            and usage_day = (now() at time zone 'utc')::date
        `;
        const dayUsed = rows[0]?.generations ?? 0;
        const monthLimit = entitlements["ai.generations_month"];
        const monthUsed = usage["ai.generations_month"] ?? 0;
        const spendLimit = entitlements["ai.spend_cents_month"];
        return {
          // The AI is on while the plan gives it generations (A2-36); the
          // modo HTML has its own switch.
          enabled: monthLimit !== 0,
          htmlEnabled: entitlements["custom_html.enabled"] !== false,
          day: {
            used: dayUsed,
            limit,
            remaining: Math.max(0, limit - dayUsed),
          },
          month:
            typeof monthLimit === "number"
              ? {
                  used: monthUsed,
                  limit: monthLimit,
                  remaining: Math.max(0, monthLimit - monthUsed),
                }
              : { used: monthUsed, limit: null, remaining: null },
          // Same rule as `assertWithinLimit`: one more cent must still fit.
          spendCapReached:
            typeof spendLimit === "number" &&
            (usage["ai.spend_cents_month"] ?? 0) + 1 > spendLimit,
        };
      });
    },
  };
}
