import type { StaffPlan, StaffUpsertPlan } from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  insertStaffAuditEvent,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import {
  StaffConflictError,
  StaffNotFoundError,
  StaffRepositoryError,
} from "../http/errors.js";

export type StaffPlanRepository = {
  listPlans(subject: string): Promise<readonly StaffPlan[]>;
  createPlan(subject: string, input: StaffUpsertPlan): Promise<StaffPlan>;
  updatePlan(
    subject: string,
    planId: string,
    input: StaffUpsertPlan,
  ): Promise<StaffPlan>;
};

export function unavailableStaffPlanRepository(): StaffPlanRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    listPlans: unavailable,
    createPlan: unavailable,
    updatePlan: unavailable,
  };
}

type PlanRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  description: string | null;
  is_public: boolean;
  is_default: boolean;
  sort_order: number;
  trial_days: number | null;
  created_at: string;
  workspaces: number;
};
type PriceRow = {
  plan_id: string;
  stripe_price_id: string;
  billing_interval: string | null;
  unit_amount: string | null;
  currency: string;
  active: boolean;
  livemode: boolean;
};
type PlanPrice = StaffPlan["prices"][number];

/** Stripe Prices mapped to each plan. Only staff with `billing.read` see
 * them (RLS); everyone else gets empty lists. */
async function fetchPrices(
  tx: Sql,
  planIds: readonly string[],
): Promise<Map<string, PlanPrice[]>> {
  const byPlan = new Map<string, PlanPrice[]>();
  if (planIds.length === 0) return byPlan;
  const rows = await tx<PriceRow[]>`
    select plan_id, stripe_price_id, billing_interval, unit_amount, currency, active, livemode
    from kardo_billing.prices
    where plan_id = any(${planIds}::uuid[])
    order by active desc, billing_interval, unit_amount
  `;
  for (const row of rows) {
    const prices = byPlan.get(row.plan_id) ?? [];
    if (prices.length < 20) {
      prices.push({
        id: row.stripe_price_id,
        interval: row.billing_interval,
        unitAmount: row.unit_amount === null ? null : Number(row.unit_amount),
        currency: row.currency,
        active: row.active,
        livemode: row.livemode,
      });
    }
    byPlan.set(row.plan_id, prices);
  }
  return byPlan;
}

/** At most one default plan, and it must be active. */
async function prepareDefault(
  tx: Sql,
  planId: string | null,
  input: StaffUpsertPlan,
): Promise<void> {
  if (!input.isDefault) return;
  if (!input.isActive) {
    throw new StaffConflictError("The default plan must be active.");
  }
  await tx`
    update kardo_core.plans set is_default = false
    where is_default ${planId ? tx`and id <> ${planId}::uuid` : tx``}
  `;
}
type EntitlementRow = { plan_id: string; key: string; value: unknown };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function fetchEntitlements(
  tx: Sql,
  planIds: readonly string[],
): Promise<Map<string, Record<string, number | boolean | null>>> {
  if (planIds.length === 0) return new Map();
  const rows = await tx<EntitlementRow[]>`
    select plan_id, key, value
    from kardo_core.plan_entitlements
    where plan_id = any(${planIds}::uuid[])
  `;
  const byPlan = new Map<string, Record<string, number | boolean | null>>();
  for (const row of rows) {
    const entitlements = byPlan.get(row.plan_id) ?? {};
    entitlements[row.key] = row.value as number | boolean | null;
    byPlan.set(row.plan_id, entitlements);
  }
  return byPlan;
}

function toStaffPlan(
  row: PlanRow,
  entitlements: Record<string, number | boolean | null>,
  prices: PlanPrice[] = [],
): StaffPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    entitlements,
    description: row.description,
    isPublic: row.is_public,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    trialDays: row.trial_days,
    workspaces: row.workspaces,
    prices,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function replaceEntitlements(
  tx: Sql,
  planId: string,
  entitlements: StaffUpsertPlan["entitlements"],
): Promise<void> {
  await tx`delete from kardo_core.plan_entitlements where plan_id = ${planId}::uuid`;
  for (const [key, value] of Object.entries(entitlements)) {
    // "No limit" is stored as an absent key (ADR 019): `sql.json(null)` is
    // SQL NULL, which the not-null column rejects, and absence already
    // means unlimited everywhere limits are read.
    if (value === null) continue;
    await tx`
      insert into kardo_core.plan_entitlements (plan_id, key, value)
      values (${planId}::uuid, ${key}, ${tx.json(value as Parameters<Sql["json"]>[0])})
    `;
  }
}

export function createPostgresStaffPlanRepository(
  sql: Sql,
): StaffPlanRepository {
  return {
    async listPlans(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.plansRead);
        const planRows = await tx<PlanRow[]>`
          select p.id, p.code, p.name, p.is_active, p.description, p.is_public,
            p.is_default, p.sort_order, p.trial_days, p.created_at,
            -- Organizations with this plan by hand: their account's (ADR 024)
            -- or an internal one's own.
            (select count(*)::int from kardo_core.workspaces w
              where w.deleted_at is null and (
                exists (select 1 from kardo_billing.account_plans ap
                        where ap.account_id = w.billing_account_id and ap.plan_id = p.id)
                or exists (select 1 from kardo_core.workspace_plans wp
                           where wp.workspace_id = w.id and wp.plan_id = p.id))) as workspaces
          from kardo_core.plans p
          order by p.sort_order asc, p.created_at asc
        `;
        const ids = planRows.map((row) => row.id);
        const entitlements = await fetchEntitlements(tx, ids);
        const prices = await fetchPrices(tx, ids);
        return planRows.map((row) =>
          toStaffPlan(
            row,
            entitlements.get(row.id) ?? {},
            prices.get(row.id) ?? [],
          ),
        );
      });
    },

    async createPlan(subject, input) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.plansWrite);

        await prepareDefault(tx, null, input);
        let created: PlanRow[];
        try {
          created = await tx<PlanRow[]>`
            insert into kardo_core.plans (
              code, name, is_active, description, is_public, is_default, sort_order, trial_days
            ) values (
              ${input.code}, ${input.name}, ${input.isActive},
              ${input.description ?? null}, ${input.isPublic ?? false},
              ${input.isDefault ?? false}, ${input.sortOrder ?? 0}, ${input.trialDays ?? null}
            )
            returning id, code, name, is_active, description, is_public, is_default,
              sort_order, trial_days, created_at, 0 as workspaces
          `;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new StaffConflictError(
              "A plan with this code already exists.",
            );
          }
          throw error;
        }
        const plan = created[0];
        if (!plan) {
          throw new StaffRepositoryError("Plan was not created.");
        }

        await replaceEntitlements(tx, plan.id, input.entitlements);

        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: "staff.plan_created",
          targetType: "plan",
          targetId: plan.id,
          result: "succeeded",
          metadata: { code: input.code, name: input.name },
        });

        return toStaffPlan(plan, input.entitlements);
      });
    },

    async updatePlan(subject, planId, input) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.plansWrite);

        await prepareDefault(tx, planId, input);
        // Omitted catalog fields keep their value; `null` clears the
        // nullable ones.
        let updated: Omit<PlanRow, "workspaces">[];
        try {
          updated = await tx<Omit<PlanRow, "workspaces">[]>`
            update kardo_core.plans
            set code = ${input.code}, name = ${input.name}, is_active = ${input.isActive}
              ${input.description !== undefined ? tx`, description = ${input.description}` : tx``}
              ${input.isPublic !== undefined ? tx`, is_public = ${input.isPublic}` : tx``}
              ${input.isDefault !== undefined ? tx`, is_default = ${input.isDefault}` : tx``}
              ${input.sortOrder !== undefined ? tx`, sort_order = ${input.sortOrder}` : tx``}
              ${input.trialDays !== undefined ? tx`, trial_days = ${input.trialDays}` : tx``}
            where id = ${planId}::uuid
            returning id, code, name, is_active, description, is_public, is_default,
              sort_order, trial_days, created_at
          `;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new StaffConflictError(
              "A plan with this code already exists.",
            );
          }
          throw error;
        }
        const plan = updated[0];
        if (!plan) {
          throw new StaffNotFoundError("Plan was not found.");
        }

        await replaceEntitlements(tx, plan.id, input.entitlements);

        const workspaceRows = await tx<{ workspaces: number }[]>`
          select count(*)::int as workspaces from kardo_core.workspaces w
          where w.deleted_at is null and (
            exists (select 1 from kardo_billing.account_plans ap
                    where ap.account_id = w.billing_account_id and ap.plan_id = ${planId}::uuid)
            or exists (select 1 from kardo_core.workspace_plans wp
                       where wp.workspace_id = w.id and wp.plan_id = ${planId}::uuid))
        `;

        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: "staff.plan_updated",
          targetType: "plan",
          targetId: plan.id,
          result: "succeeded",
          metadata: { code: input.code, name: input.name },
        });

        const prices = await fetchPrices(tx, [plan.id]);
        return toStaffPlan(
          { ...plan, workspaces: workspaceRows[0]?.workspaces ?? 0 },
          input.entitlements,
          prices.get(plan.id) ?? [],
        );
      });
    },
  };
}
