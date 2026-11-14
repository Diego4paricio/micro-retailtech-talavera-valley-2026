import type { StaffPermission } from "@kardo/contracts";
import type { Sql } from "postgres";
import { StaffPermissionError } from "./errors.js";

/**
 * Every repository call that touches Postgres on behalf of staff must go
 * through this helper. It centralizes:
 *
 *  1. `set local role kardo_staff_api` — drops the connection to the
 *     least-privileged runtime role for the duration of the transaction.
 *  2. `set_config('kardo.staff_subject', ...)` — the session variable real
 *     Row Level Security policies key off (`kardo_private.is_active_staff()`,
 *     `kardo_private.staff_has_permission()`). Set with `is_local = true` so
 *     it never leaks across pooled connections once the transaction ends.
 *
 * `action` runs fully inside the transaction, so callers can compose reads,
 * writes and audit log inserts atomically — RLS is a second barrier here,
 * not the only one: every route still checks the specific permission in code
 * via `requireStaffPermission` before doing anything else in the callback.
 */
export async function withStaffContext<T>(
  sql: Sql,
  subject: string,
  action: (transaction: Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (transaction) => {
    await transaction.unsafe("set local role kardo_staff_api");
    await transaction`select set_config('kardo.staff_subject', ${subject}, true)`;
    return action(transaction);
  }) as Promise<T>;
}

/**
 * Throws `StaffPermissionError` unless the given subject is an active staff
 * profile holding at least one of the listed permissions. Callers pass a
 * single permission for a plain requirement, or a short list for an "any of"
 * requirement (e.g. `touchpoints.operations.read` OR `customers.read`).
 *
 * This must run inside a transaction already opened by `withStaffContext`
 * (it does not itself set the role or session config), and must be the first
 * thing a repository method does after that — before any query that could
 * leak whether a resource exists to a caller who should not see it at all.
 */
export async function requireStaffPermission(
  sql: Sql,
  subject: string,
  permission: StaffPermission | readonly StaffPermission[],
): Promise<void> {
  const permissions = Array.isArray(permission) ? permission : [permission];
  const rows = await sql<{ granted: boolean }[]>`
    select exists(
      select 1
      from kardo_staff.staff_profiles staff
      join kardo_staff.role_assignments assignment on assignment.staff_id = staff.id
      join kardo_staff.permissions granted_permission on granted_permission.role_id = assignment.role_id
      where staff.id = ${subject}::uuid
        and staff.status = 'active'
        and staff.revoked_at is null
        and granted_permission.permission = any(${permissions}::text[])
    ) as granted
  `;
  if (!rows[0]?.granted) {
    throw new StaffPermissionError();
  }
}

export type StaffAuditEventInput = {
  workspaceId?: string | null;
  actorSubject: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: "succeeded" | "failed" | "denied";
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

/** Inserts one row into `kardo_audit.events` with `actor_type = 'staff'`.
 * The insert policy requires `actor_subject` to be exactly the caller's own
 * subject, which every call site here already satisfies. Callers pass the
 * same transaction used for the mutation (or view) itself so the audit trail
 * is atomic with the change/read it describes.
 *
 * `metadata` must always go through `sql.json` — never
 * `${JSON.stringify(x)}::jsonb`, which postgres.js double-encodes. */
export async function insertStaffAuditEvent(
  sql: Sql,
  input: StaffAuditEventInput,
): Promise<void> {
  await sql`
    insert into kardo_audit.events (
      workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
    ) values (
      ${input.workspaceId ? sql`${input.workspaceId}::uuid` : null},
      ${input.actorSubject}::uuid,
      'staff',
      ${input.action},
      ${input.targetType},
      ${input.targetId ? sql`${input.targetId}::uuid` : null},
      ${input.result},
      ${input.reason ?? null},
      ${sql.json((input.metadata ?? {}) as Parameters<Sql["json"]>[0])}
    )
  `;
}

/** Escapes `%`, `_` and `\` so a client-supplied search term can be safely
 * embedded in an `ilike` pattern (with `escape '\'`) without letting the
 * caller inject their own wildcards. */
export function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/** Wraps an already-escaped term as a `%term%` contains-pattern. */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}

/** Wraps an already-escaped term as a `term%` prefix-pattern. */
export function prefixPattern(value: string): string {
  return `${escapeLikePattern(value)}%`;
}
