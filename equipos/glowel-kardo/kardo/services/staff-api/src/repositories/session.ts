import type { StaffDiagnostics, StaffSession } from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  insertStaffAuditEvent,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import { StaffAccessError, StaffRepositoryError } from "../http/errors.js";

export type SessionRepository = {
  /** Confirms `subject` is an active, non-revoked staff profile and returns
   * its permissions. Throws `StaffAccessError` otherwise — this is the gate
   * every route runs before any endpoint-specific work (see
   * `http/session.ts`). */
  getActiveStaffSession(subject: string, email: string): Promise<StaffSession>;
  readDiagnostics(subject: string): Promise<StaffDiagnostics>;
};

export function unavailableSessionRepository(): SessionRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    getActiveStaffSession: unavailable,
    readDiagnostics: unavailable,
  };
}

type StaffProfileRow = { display_name: string | null };
type PermissionRow = { permission: string };
type DiagnosticsRow = {
  touchpoints_awaiting_assignment: number;
  pending_publications: number;
  failed_publications_last_24_hours: number;
};

export function createPostgresSessionRepository(
  sql: Sql,
): SessionRepository & { close(): Promise<void> } {
  return {
    async getActiveStaffSession(subject, email) {
      const result = await withStaffContext(sql, subject, async (tx) => {
        const profileRows = await tx<StaffProfileRow[]>`
          select display_name
          from kardo_staff.staff_profiles
          where id = ${subject}::uuid
            and status = 'active'
            and revoked_at is null
        `;
        const profile = profileRows[0];
        if (!profile) return null;
        const permissionRows = await tx<PermissionRow[]>`
          select distinct permission.permission
          from kardo_staff.role_assignments assignment
          join kardo_staff.permissions permission on permission.role_id = assignment.role_id
          where assignment.staff_id = ${subject}::uuid
          order by permission.permission asc
        `;
        return {
          displayName: profile.display_name,
          permissions: permissionRows.map((row) => row.permission),
        };
      });
      if (!result) {
        throw new StaffAccessError();
      }
      return {
        subject,
        email,
        displayName: result.displayName,
        permissions: result.permissions,
      };
    },
    async readDiagnostics(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.diagnosticsRead,
        );
        const rows = await tx<DiagnosticsRow[]>`
          select
            (select count(*)::int from kardo_core.touchpoints where status in ('prepared', 'available')) as touchpoints_awaiting_assignment,
            (select count(*)::int from kardo_core.publications where status in ('pending', 'processing')) as pending_publications,
            (select count(*)::int from kardo_core.publications where status = 'failed' and created_at >= now() - interval '24 hours') as failed_publications_last_24_hours
        `;
        const result = rows[0];
        if (!result) {
          throw new StaffRepositoryError("Diagnostics were not available.");
        }
        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: "staff.diagnostics_viewed",
          targetType: "operations",
          result: "succeeded",
        });
        return {
          touchpointsAwaitingAssignment: result.touchpoints_awaiting_assignment,
          pendingPublications: result.pending_publications,
          failedPublicationsLast24Hours:
            result.failed_publications_last_24_hours,
        };
      });
    },
    close: () => sql.end(),
  };
}
