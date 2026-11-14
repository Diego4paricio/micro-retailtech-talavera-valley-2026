import type {
  StaffPublicationPage,
  StaffPublicationQuery,
  StaffPublicationRow,
} from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import type { PublisherKick } from "../clients/publisher-kick.js";
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
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  resolveLimit,
} from "../http/pagination.js";
import {
  mapPublicationRow,
  type PublicationRow,
  publicationRowFrom,
  publicationRowSelect,
} from "./shared-rows.js";

const READ_PERMISSIONS = [
  staffPermissions.touchpointsRead,
  staffPermissions.customersRead,
] as const;

export type StaffPublicationRepository = {
  listPublications(
    subject: string,
    query: StaffPublicationQuery,
  ): Promise<StaffPublicationPage>;
  retryPublication(
    subject: string,
    publicationId: string,
    publisherKick: PublisherKick,
  ): Promise<StaffPublicationRow>;
};

export function unavailableStaffPublicationRepository(): StaffPublicationRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    listPublications: unavailable,
    retryPublication: unavailable,
  };
}

async function fetchPublicationRow(
  tx: Sql,
  publicationId: string,
): Promise<PublicationRow | undefined> {
  const rows = await tx<PublicationRow[]>`
    select ${publicationRowSelect(tx)}
    ${publicationRowFrom(tx)}
    where pub.id = ${publicationId}::uuid
  `;
  return rows[0];
}

export function createPostgresStaffPublicationRepository(
  sql: Sql,
): StaffPublicationRepository {
  return {
    async listPublications(subject, query) {
      const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
      const limit = resolveLimit(query.limit);
      const status = query.status;
      const workspaceId = query.workspaceId;

      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, READ_PERMISSIONS);
        return tx<PublicationRow[]>`
          select ${publicationRowSelect(tx)}
          ${publicationRowFrom(tx)}
          where (${status === undefined} or pub.status::text = ${status ?? ""})
          and (${workspaceId === undefined} or t.workspace_id = ${workspaceId ?? null}::uuid)
          and (
            ${cursor === null}
            or (pub.created_at, pub.id) < (${cursor?.timestamp ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
          order by pub.created_at desc, pub.id desc
          limit ${limit + 1}
        `;
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(mapPublicationRow),
        nextCursor:
          hasMore && last
            ? encodeKeysetCursor({
                timestamp: new Date(last.created_at).toISOString(),
                id: last.id,
              })
            : null,
      };
    },

    async retryPublication(subject, publicationId, publisherKick) {
      const result = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.publicationsRetry,
        );

        const current = await tx<
          { id: string; status: string; workspace_id: string | null }[]
        >`
          select pub.id, pub.status::text as status, t.workspace_id
          from kardo_core.publications pub
          join kardo_core.touchpoints t on t.id = pub.touchpoint_id
          where pub.id = ${publicationId}::uuid
        `;
        // No `for update` here: under RLS it would also apply the UPDATE
        // policy (only failed rows) and lock the joined Touchpoint, turning a
        // non-failed publication into a 404 and failing for roles without
        // touchpoints.suspend.write. The guarded UPDATE below is the barrier.
        const publication = current[0];
        if (!publication) {
          throw new StaffNotFoundError("Publication was not found.");
        }
        if (publication.status !== "failed") {
          throw new StaffConflictError(
            "Only a failed publication can be retried.",
          );
        }

        const reset = await tx<{ id: string }[]>`
          update kardo_core.publications
          set status = 'pending'
          where id = ${publicationId}::uuid and status = 'failed'
          returning id
        `;
        if (!reset[0]) {
          throw new StaffConflictError(
            "Only a failed publication can be retried.",
          );
        }
        await tx`
          update kardo_core.publication_jobs
          set status = 'pending', attempts = 0, last_error = null, updated_at = now()
          where id = (
            select id from kardo_core.publication_jobs
            where publication_id = ${publicationId}::uuid
            order by created_at desc
            limit 1
          )
        `;

        await insertStaffAuditEvent(tx, {
          workspaceId: publication.workspace_id,
          actorSubject: subject,
          action: "staff.publication_retried",
          targetType: "publication",
          targetId: publicationId,
          result: "succeeded",
        });

        const row = await fetchPublicationRow(tx, publicationId);
        if (!row) {
          throw new StaffRepositoryError("Publication was not updated.");
        }
        return row;
      });

      // Fire-and-forget, after commit: never let a Publisher hiccup turn an
      // already-successful retry into an error response.
      publisherKick();

      return mapPublicationRow(result);
    },
  };
}
