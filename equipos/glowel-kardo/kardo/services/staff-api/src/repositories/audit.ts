import type { StaffAuditPage, StaffAuditQuery } from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  prefixPattern,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import { StaffRepositoryError } from "../http/errors.js";
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  resolveLimit,
} from "../http/pagination.js";
import {
  type AuditEventRow,
  auditEventRowFrom,
  auditEventRowSelect,
  mapAuditEventRow,
} from "./shared-rows.js";

export type StaffAuditRepository = {
  listAuditEvents(
    subject: string,
    query: StaffAuditQuery,
  ): Promise<StaffAuditPage>;
};

export function unavailableStaffAuditRepository(): StaffAuditRepository {
  return {
    listAuditEvents: async () => Promise.reject(new StaffRepositoryError()),
  };
}

export function createPostgresStaffAuditRepository(
  sql: Sql,
): StaffAuditRepository {
  return {
    async listAuditEvents(subject, query) {
      const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
      const limit = resolveLimit(query.limit);
      const workspaceId = query.workspaceId;
      const actorType = query.actorType;
      const actionPrefix = query.action?.trim();
      const hasActionPrefix = Boolean(actionPrefix && actionPrefix.length > 0);
      const pattern = hasActionPrefix
        ? prefixPattern(actionPrefix as string)
        : "";

      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.auditRead);
        return tx<AuditEventRow[]>`
          select ${auditEventRowSelect(tx)}
          ${auditEventRowFrom(tx)}
          where (${workspaceId === undefined} or event.workspace_id = ${workspaceId ?? null}::uuid)
          and (${actorType === undefined} or event.actor_type = ${actorType ?? ""})
          and (not ${hasActionPrefix} or event.action ilike ${pattern} escape '\\')
          and (
            ${cursor === null}
            or (event.occurred_at, event.id) < (${cursor?.timestamp ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
          order by event.occurred_at desc, event.id desc
          limit ${limit + 1}
        `;
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(mapAuditEventRow),
        nextCursor:
          hasMore && last
            ? encodeKeysetCursor({
                timestamp: new Date(last.occurred_at).toISOString(),
                id: last.id,
              })
            : null,
      };
    },
  };
}
