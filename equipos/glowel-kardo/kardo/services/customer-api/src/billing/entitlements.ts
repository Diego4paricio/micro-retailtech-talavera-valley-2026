import type {
  BillingEffectivePlan,
  BillingEntitlementKey,
  PlanSource,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { PlanLimitError } from "../errors.js";

// ---------------------------------------------------------------------------
// Plan limits (ADR 019). Call these inside the same `withCustomerContext`
// transaction as the write they guard, before creating anything. A key the
// plan does not set (or sets to null) means "no limit", so workspaces
// without a plan behave exactly as before.
// ---------------------------------------------------------------------------

export type EntitlementValue = number | boolean | null;

export type EffectivePlan = {
  plan: BillingEffectivePlan | null;
  entitlements: Record<string, EntitlementValue>;
};

type EffectivePlanRow = {
  plan_code: string;
  plan_name: string;
  source: PlanSource;
  entitlements: Record<string, unknown> | null;
};

function toEntitlementValue(value: unknown): EntitlementValue {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

/** The plan that governs the workspace today and its entitlements. */
export async function readEffectivePlan(
  tx: Sql,
  workspaceId: string,
): Promise<EffectivePlan> {
  const rows = await tx<EffectivePlanRow[]>`
    select plan_code, plan_name, source, entitlements
    from kardo_billing.effective_plan(${workspaceId}::uuid)
  `;
  const row = rows[0];
  if (!row) return { plan: null, entitlements: {} };
  const entitlements: Record<string, EntitlementValue> = {};
  for (const [key, value] of Object.entries(row.entitlements ?? {})) {
    entitlements[key] = toEntitlementValue(value);
  }
  return {
    plan: { code: row.plan_code, name: row.plan_name, source: row.source },
    entitlements,
  };
}

/** Current consumption of every countable limit. */
export async function readWorkspaceUsage(
  tx: Sql,
  workspaceId: string,
): Promise<Record<string, number>> {
  const rows = await tx<{ usage: Record<string, unknown> | null }[]>`
    select kardo_billing.workspace_usage(${workspaceId}::uuid) as usage
  `;
  const usage: Record<string, number> = {};
  for (const [key, value] of Object.entries(rows[0]?.usage ?? {})) {
    const count = Number(value);
    if (Number.isFinite(count) && count >= 0) usage[key] = Math.trunc(count);
  }
  return usage;
}

type LimitKey = Extract<
  BillingEntitlementKey,
  | "touchpoints.max"
  | "links.max"
  | "members.max"
  | "qr_designs.max"
  | "assets.storage_mb"
  | "ai.generations_month"
  | "ai.spend_cents_month"
>;
type FeatureKey = Extract<
  BillingEntitlementKey,
  "custom_html.enabled" | "leads.export" | "leads.webhook"
>;

/**
 * Throws `PlanLimitError` (403 `PLAN_LIMIT`) when adding `adding` units of
 * `key` would exceed the plan's limit. `adding` is in the key's unit: items
 * for `*.max`, megabytes for `assets.storage_mb`, generations for
 * `ai.generations_month`, US cents for `ai.spend_cents_month` (adding 1
 * cent blocks once the month's spend reached the cap).
 */
export async function assertWithinLimit(
  tx: Sql,
  workspaceId: string,
  key: LimitKey,
  adding = 1,
): Promise<void> {
  const { plan, entitlements } = await readEffectivePlan(tx, workspaceId);
  const limit = entitlements[key];
  if (typeof limit !== "number") return;
  // Two concurrent creations must not both pass on the same stale count:
  // serialize them per billing account (one pool since ADR 024) and key
  // until the transaction ends.
  const [scope] = await tx<{ account: string | null }[]>`
    select billing_account_id as account from kardo_core.workspaces
    where id = ${workspaceId}::uuid
  `;
  await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-limit:${scope?.account ?? workspaceId}:${key}`}, 0))`;
  const usage = (await readWorkspaceUsage(tx, workspaceId))[key] ?? 0;
  if (usage + adding > limit) {
    throw new PlanLimitError({
      key,
      limit,
      usage,
      planCode: plan?.code ?? null,
    });
  }
}

/** Throws `PlanLimitError` when the plan turns `key` off (`false`). */
export async function assertFeature(
  tx: Sql,
  workspaceId: string,
  key: FeatureKey,
): Promise<void> {
  const { plan, entitlements } = await readEffectivePlan(tx, workspaceId);
  if (entitlements[key] === false) {
    throw new PlanLimitError({
      key,
      limit: null,
      usage: null,
      planCode: plan?.code ?? null,
    });
  }
}
