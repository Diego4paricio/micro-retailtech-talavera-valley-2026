import type { CustomerRole } from "@kardo/contracts";
import { type CustomerPermission, canCustomer } from "@kardo/domain";
import type { Sql } from "postgres";
import type { CustomerIdentity } from "../customer-session.js";
import { PlanRequiredError, WorkspaceAccessError } from "../errors.js";

export type { CustomerIdentity } from "../customer-session.js";

/**
 * Every repository call that touches Postgres on behalf of a customer must go
 * through this helper. It centralizes two things that used to be duplicated
 * (and drift) across repositories:
 *
 *  1. the `kardo_customer_api` role (`SET LOCAL ROLE`, via `set_config`) —
 *     drops the connection to the least-privileged runtime role for the
 *     duration of the transaction.
 *  2. `set_config('kardo.subject', ...)` / `set_config('kardo.email', ...)` —
 *     the session variables real Row Level Security policies key off. Both
 *     are set with `is_local = true` so they never leak across pooled
 *     connections once the transaction ends.
 *
 * `action` runs fully inside the transaction, so callers can compose reads,
 * writes and audit log inserts atomically.
 */
export async function withCustomerContext<T>(
  sql: Sql,
  identity: CustomerIdentity,
  action: (transaction: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (transaction) => {
    // One statement instead of two: `set_config('role', …, true)` is exactly
    // `SET LOCAL ROLE` (the same GUC, the same membership check), and every
    // statement saved is a network round trip saved on every request.
    await transaction`
      select set_config('role', 'kardo_customer_api', true),
             set_config('kardo.subject', ${identity.subject}, true),
             set_config('kardo.email', ${identity.email.toLowerCase()}, true)
    `;
    return action(transaction);
  }) as Promise<T>;
}

type MembershipRow = { role: CustomerRole };

/** Reads the caller's membership role. Throws `WorkspaceAccessError` (which
 * the error handler renders as 404-shaped 403, revealing nothing about
 * whether the workspace exists) when there is none. */
export async function requireMembership(
  sql: Sql,
  identity: CustomerIdentity,
  workspaceId: string,
): Promise<CustomerRole> {
  const rows = await sql<MembershipRow[]>`
    select role
    from kardo_core.workspace_memberships
    where workspace_id = ${workspaceId}::uuid
      and profile_id = ${identity.subject}::uuid
  `;
  const membership = rows[0];
  if (!membership) {
    throw new WorkspaceAccessError();
  }
  return membership.role;
}

/** Throws `WorkspaceAccessError` unless `role` grants `permission`. Kept as a
 * free function (rather than a class method) so route handlers and
 * repositories share the exact same authorization decision as
 * `@kardo/domain`'s `canCustomer`. */
export function requirePermission(
  role: CustomerRole,
  permission: CustomerPermission,
): void {
  if (!canCustomer(role, permission)) {
    throw new WorkspaceAccessError();
  }
}

/**
 * Permissions that create or change content, and so need a plan (ADR 020
 * §4). Everything else stays available to an organization without one:
 * reading (`analytics.read`, `leads.read`), exporting, choosing a plan and
 * invoices (`billing.*`), handing over ownership, and managing leads it
 * already collected (status, deletion, retention: personal data of third
 * parties that the organization must be able to clean up).
 */
const planGatedPermissions: ReadonlySet<CustomerPermission> = new Set([
  "workspace.manage",
  "members.manage",
  "touchpoints.manage",
  "touchpoints.retire",
  "experiences.edit",
  "experiences.publish",
  "assets.manage",
  "experiences.custom_html",
]);

export const isPlanGated = (permission: CustomerPermission): boolean =>
  planGatedPermissions.has(permission);

/**
 * Throws `PlanRequiredError` (403 `PLAN_REQUIRED`) when the organization is
 * `limited` or `paused` (ADR 020 §4). Internal, active, trial and legacy
 * organizations pass. Runs inside the caller's transaction, as the customer
 * role; `kardo_billing.workspace_access` checks membership itself.
 */
export async function assertWorkspaceHasPlan(
  sql: Sql,
  workspaceId: string,
): Promise<void> {
  const rows = await sql<{ state: string }[]>`
    select state from kardo_billing.workspace_access(${workspaceId}::uuid)
  `;
  const state = rows[0]?.state;
  if (state === "limited" || state === "paused") {
    throw new PlanRequiredError(state);
  }
}

/** Convenience: fetch the membership role and immediately assert a
 * permission, inside an already-open transaction. This is the single point
 * every write goes through, so it also refuses writes to an organization
 * without a plan (ADR 020 §4) unless `allowWithoutPlan` (only for finishing
 * sign up, which is what starts the trial). */
export async function requireMembershipWithPermission(
  sql: Sql,
  identity: CustomerIdentity,
  workspaceId: string,
  permission: CustomerPermission,
  options: { allowWithoutPlan?: boolean } = {},
): Promise<CustomerRole> {
  const role = await requireMembership(sql, identity, workspaceId);
  requirePermission(role, permission);
  if (isPlanGated(permission) && !options.allowWithoutPlan) {
    await assertWorkspaceHasPlan(sql, workspaceId);
  }
  return role;
}

export type AuditEventInput = {
  workspaceId: string;
  actorSubject: string;
  action: string;
  targetType: string;
  targetId: string | null;
  result: "succeeded" | "failed";
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Inserts one row into `kardo_audit.events`. Callers pass the same
 * transaction used for the mutation itself so the audit trail is atomic with
 * the change it describes. */
export async function insertAuditEvent(
  sql: Sql,
  input: AuditEventInput,
): Promise<void> {
  await sql`
    insert into kardo_audit.events (
      workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
    ) values (
      ${input.workspaceId}::uuid,
      ${input.actorSubject}::uuid,
      'customer',
      ${input.action},
      ${input.targetType},
      ${input.targetId ? sql`${input.targetId}::uuid` : null},
      ${input.result},
      ${input.reason ?? null},
      ${sql.json((input.metadata ?? {}) as Parameters<Sql["json"]>[0])}
    )
  `;
}
