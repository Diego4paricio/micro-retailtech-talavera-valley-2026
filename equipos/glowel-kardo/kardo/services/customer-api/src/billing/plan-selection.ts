import {
  type BillingPauseClient,
  defaultKeep,
  syncTouchpointPauses,
  type VisitsByTouchpoint,
} from "@kardo/billing";
import type {
  PlanSelection,
  PlanSelectionCandidate,
  SavedPlanSelection,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { ApiError, WorkspaceAccessError } from "../errors.js";
import {
  type CustomerIdentity,
  requireMembershipWithPermission,
  withCustomerContext,
} from "../repositories/context.js";
import { readEffectivePlan } from "./entitlements.js";

/**
 * Downgrade option B (ADR 023): what the organization has against its plan,
 * and the customer's choice of what stays active. The window, the limits
 * and every exclusion live in `kardo_billing` functions; this only reads
 * them and passes the choice through.
 */
export type PlanSelectionRepository = {
  read(identity: CustomerIdentity, workspaceId: string): Promise<PlanSelection>;
  save(
    identity: CustomerIdentity,
    workspaceId: string,
    keep: string[],
  ): Promise<SavedPlanSelection>;
};

type CandidateRow = {
  id: string;
  public_id: string;
  kind: string;
  name: string | null;
  excluded: boolean;
  workspace_id: string;
  updated_at: Date;
};

type OverageRow = {
  plan_code: string;
  plan_name: string | null;
  choose_by: Date;
  chosen_at: Date | null;
  applied_at: Date | null;
  resolved_at: Date | null;
  organizations_limit: number | null;
  touchpoints_limit: number | null;
  links_limit: number | null;
};

const iso = (value: Date | null) =>
  value ? new Date(value).toISOString() : null;

function limitOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function createPostgresPlanSelectionRepository(
  sql: Sql,
  deps: {
    visits: VisitsByTouchpoint | null;
    pause: BillingPauseClient | null;
    onError?: (error: unknown) => void;
  },
): PlanSelectionRepository {
  return {
    async read(identity, workspaceId) {
      const { candidates, overage, limits } = await withCustomerContext(
        sql,
        identity,
        async (tx) => {
          await requireMembershipWithPermission(
            tx,
            identity,
            workspaceId,
            "billing.read",
          );
          const plan = await readEffectivePlan(tx, workspaceId);
          // Choosing what stays active across the account is the holder's
          // (ADR 024). A non-holder Admin may read their own organization's
          // state, but must not enumerate the holder's other organizations and
          // their QRs through these candidates (security review 2026-10-12,
          // same tightening as `readAccount`).
          const [holderRow] = await tx<{ holder: boolean }[]>`
            select kardo_billing.is_account_holder(w.billing_account_id) as holder
            from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
          `;
          const isHolder = holderRow?.holder === true;
          // The window is the person's billing account's (ADR 024).
          const [overageRow] = await tx<OverageRow[]>`
            select o.plan_code, p.name as plan_name, o.choose_by, o.chosen_at,
              o.applied_at, o.resolved_at, o.organizations_limit,
              o.touchpoints_limit, o.links_limit
            from kardo_billing.plan_overages o
            join kardo_core.workspaces w on w.billing_account_id = o.account_id
            left join kardo_core.plans p on p.code = o.plan_code
            where w.id = ${workspaceId}::uuid
          `;
          return {
            candidates: await tx<CandidateRow[]>`
              select id, public_id, kind, name, excluded, workspace_id, updated_at
              from kardo_billing.plan_selection_candidates(${workspaceId}::uuid)
              ${isHolder ? tx`` : tx`where workspace_id = ${workspaceId}::uuid`}
            `,
            overage: overageRow ?? null,
            // An open window carries the limits it is enforcing, extras
            // included (ADR 024); the plan's base entitlements would show
            // more «fuera» than the server will pause (domain audit A2-59).
            limits:
              overageRow && overageRow.resolved_at === null
                ? {
                    organizations: overageRow.organizations_limit,
                    touchpoints: overageRow.touchpoints_limit,
                    links: overageRow.links_limit,
                  }
                : {
                    organizations: limitOf(
                      plan.entitlements["organizations.max"],
                    ),
                    touchpoints: limitOf(plan.entitlements["touchpoints.max"]),
                    links: limitOf(plan.entitlements["links.max"]),
                  },
          };
        },
      );
      let visits: Map<string, number> | null = null;
      const codes = candidates.filter((row) => row.kind !== "organization");
      if (deps.visits && codes.length > 0) {
        visits = await deps
          .visits({
            workspaceId,
            publicIds: codes.map((row) => row.public_id),
            days: 30,
          })
          .catch(() => null);
      }
      // An organization's visits are those of its codes.
      const byOrganization = new Map<string, number>();
      if (visits)
        for (const row of codes)
          byOrganization.set(
            row.workspace_id,
            (byOrganization.get(row.workspace_id) ?? 0) +
              (visits.get(row.public_id) ?? 0),
          );
      // What Kardo keeps by itself at `chooseBy`: the very rule the server
      // applies then (`defaultKeep`), so the chooser's first ticks never
      // disagree with it (domain audit A2-62).
      const suggestedKeep = defaultKeep(
        candidates.map((row) => ({
          id: row.id,
          publicId: row.public_id,
          kind: row.kind,
          name: row.name,
          excluded: row.excluded,
          updatedAt: new Date(row.updated_at),
          workspaceId: row.workspace_id,
        })),
        visits ?? new Map<string, number>(),
        limits,
      );
      return {
        suggestedKeep,
        overage: overage
          ? {
              planCode: overage.plan_code,
              planName: overage.plan_name ?? overage.plan_code,
              chooseBy: new Date(overage.choose_by).toISOString(),
              chosenAt: iso(overage.chosen_at),
              appliedAt: iso(overage.applied_at),
              resolved: overage.resolved_at !== null,
            }
          : null,
        limits,
        candidates: candidates.map(
          (row): PlanSelectionCandidate => ({
            id: row.id,
            publicId: row.public_id,
            kind:
              row.kind === "organization"
                ? "organization"
                : row.kind === "link"
                  ? "link"
                  : "touchpoint",
            format: row.kind,
            name: row.name,
            excluded: row.excluded,
            visits: !visits
              ? null
              : row.kind === "organization"
                ? (byOrganization.get(row.id) ?? 0)
                : (visits.get(row.public_id) ?? 0),
            workspaceId: row.workspace_id,
          }),
        ),
      };
    },

    async save(identity, workspaceId, keep) {
      let saved: SavedPlanSelection;
      try {
        saved = await withCustomerContext(sql, identity, async (tx) => {
          await requireMembershipWithPermission(
            tx,
            identity,
            workspaceId,
            "workspace.manage",
          );
          const [row] = await tx<{ result: SavedPlanSelection }[]>`
            select kardo_billing.save_plan_selection(${workspaceId}::uuid, ${keep}::uuid[]) as result
          `;
          return row?.result ?? { excluded: 0, included: 0 };
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("PLAN_SELECTION_OVER_LIMIT")
        )
          throw new ApiError(
            "PLAN_SELECTION_OVER_LIMIT",
            409,
            "The selection keeps more than the plan includes.",
          );
        if (
          error instanceof Error &&
          error.message.includes("PLAN_SELECTION_ORGANIZATIONS_REQUIRED")
        )
          throw new ApiError(
            "PLAN_SELECTION_ORGANIZATIONS_REQUIRED",
            409,
            "Choose which organizations stay in the plan.",
          );
        if (error instanceof Error && error.message.includes("FORBIDDEN"))
          throw new WorkspaceAccessError();
        throw error;
      }
      // The Resolver hears it now; the hourly task retries what fails.
      // Every organization of the account may change (ADR 024): the queue
      // only shows the person's own organizations.
      await syncTouchpointPauses({
        sql,
        pause: deps.pause,
        role: "kardo_customer_api",
        subject: identity.subject,
      }).catch((error: unknown) => deps.onError?.(error));
      return saved;
    },
  };
}

export function unavailablePlanSelectionRepository(): PlanSelectionRepository {
  const fail = () =>
    Promise.reject(new Error("Plan selection storage is not configured."));
  return { read: fail, save: fail };
}
