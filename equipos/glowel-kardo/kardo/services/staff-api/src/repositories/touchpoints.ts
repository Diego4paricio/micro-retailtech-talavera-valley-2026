import type {
  StaffSuspendTouchpoint,
  StaffTouchpointDetail,
  StaffTouchpointPage,
  StaffTouchpointQuery,
} from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  type AnalyticsDays,
  type AnalyticsEngineClient,
  fetchTapsForPublicIds,
} from "../clients/analytics-engine.js";
import type { ResolverSuspensionClient } from "../clients/resolver-suspension.js";
import {
  containsPattern,
  insertStaffAuditEvent,
  prefixPattern,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import {
  StaffDependencyError,
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
  mapTouchpointRow,
  type PublicationRow,
  publicationRowFrom,
  publicationRowSelect,
  type TouchpointRow,
  touchpointRowFrom,
  touchpointRowSelect,
} from "./shared-rows.js";

const TAPS_WINDOW_DAYS: AnalyticsDays = 30;
const READ_PERMISSIONS = [
  staffPermissions.touchpointsRead,
  staffPermissions.customersRead,
] as const;

export type StaffTouchpointUrls = StaffTouchpointDetail["urls"];

export type StaffTouchpointRepository = {
  listTouchpoints(
    subject: string,
    query: StaffTouchpointQuery,
  ): Promise<StaffTouchpointPage>;
  getTouchpointDetail(
    subject: string,
    touchpointId: string,
  ): Promise<StaffTouchpointDetail>;
  suspendTouchpoint(
    subject: string,
    touchpointId: string,
    input: StaffSuspendTouchpoint,
    resolver: ResolverSuspensionClient,
  ): Promise<StaffTouchpointDetail>;
  unsuspendTouchpoint(
    subject: string,
    touchpointId: string,
    resolver: ResolverSuspensionClient,
  ): Promise<StaffTouchpointDetail>;
};

export function unavailableStaffTouchpointRepository(): StaffTouchpointRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    listTouchpoints: unavailable,
    getTouchpointDetail: unavailable,
    suspendTouchpoint: unavailable,
    unsuspendTouchpoint: unavailable,
  };
}

type SuspensionRow = {
  suspended_at: string | null;
  suspension_reason: string | null;
  suspended_by_email: string | null;
};

function buildUrls(
  resolverOrigin: string,
  publicId: string,
): StaffTouchpointUrls {
  const base = new URL(`/t/${publicId}`, resolverOrigin);
  const nfc = new URL(base);
  nfc.searchParams.set("src", "nfc");
  const qr = new URL(base);
  qr.searchParams.set("src", "qr");
  return { link: base.toString(), nfc: nfc.toString(), qr: qr.toString() };
}

async function fetchTouchpointRow(
  tx: Sql,
  touchpointId: string,
): Promise<TouchpointRow | undefined> {
  const rows = await tx<TouchpointRow[]>`
    select ${touchpointRowSelect(tx)}
    ${touchpointRowFrom(tx)}
    where t.id = ${touchpointId}::uuid
  `;
  return rows[0];
}

async function fetchTouchpointDetailPayload(
  tx: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
  resolverOrigin: string,
  touchpointId: string,
): Promise<StaffTouchpointDetail> {
  const touchpointRow = await fetchTouchpointRow(tx, touchpointId);
  if (!touchpointRow) {
    throw new StaffNotFoundError("Touchpoint was not found.");
  }

  const suspensionRows = await tx<SuspensionRow[]>`
    select t.suspended_at, t.suspension_reason, suspender.email as suspended_by_email
    from kardo_core.touchpoints t
    left join kardo_core.profiles suspender on suspender.id = t.suspended_by
    where t.id = ${touchpointId}::uuid
  `;
  const suspension = suspensionRows[0];

  const publicationRows = await tx<PublicationRow[]>`
    select ${publicationRowSelect(tx)}
    ${publicationRowFrom(tx)}
    where pub.touchpoint_id = ${touchpointId}::uuid
    order by pub.created_at desc
    limit 20
  `;

  let taps30Days: number | null = null;
  if (analyticsEngine) {
    try {
      taps30Days = await fetchTapsForPublicIds({
        client: analyticsEngine,
        dataset,
        environment,
        days: TAPS_WINDOW_DAYS,
        publicIds: [touchpointRow.public_id],
      });
    } catch {
      taps30Days = null;
    }
  }

  return {
    touchpoint: mapTouchpointRow(touchpointRow),
    urls: buildUrls(resolverOrigin, touchpointRow.public_id),
    suspension:
      suspension?.suspended_at && suspension.suspension_reason
        ? {
            suspendedAt: new Date(suspension.suspended_at).toISOString(),
            reason: suspension.suspension_reason,
            suspendedByEmail: suspension.suspended_by_email,
          }
        : null,
    publications: publicationRows.map(mapPublicationRow),
    taps30Days,
  };
}

export function createPostgresStaffTouchpointRepository(
  sql: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
  resolverOrigin: string,
): StaffTouchpointRepository {
  return {
    async listTouchpoints(subject, query) {
      const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
      const limit = resolveLimit(query.limit);
      const trimmedQuery = query.query?.trim();
      const hasQuery = Boolean(trimmedQuery && trimmedQuery.length > 0);
      const hasPrefixQuery = Boolean(trimmedQuery && trimmedQuery.length >= 6);
      const namePattern = hasQuery
        ? containsPattern(trimmedQuery as string)
        : "";
      const idPattern = hasPrefixQuery
        ? prefixPattern(trimmedQuery as string)
        : "";
      const status = query.status;
      const suspended = query.suspended;

      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, READ_PERMISSIONS);
        return tx<TouchpointRow[]>`
          select ${touchpointRowSelect(tx)}
          ${touchpointRowFrom(tx)}
          where (
            not ${hasQuery}
            or t.operational_name ilike ${namePattern} escape '\\'
            or (${hasPrefixQuery} and t.public_id ilike ${idPattern} escape '\\')
          )
          and (${status === undefined} or t.status::text = ${status ?? ""})
          and (
            ${suspended === undefined}
            or (${suspended === true} and t.suspended_at is not null)
            or (${suspended === false} and t.suspended_at is null)
          )
          and (
            ${cursor === null}
            or (t.created_at, t.id) < (${cursor?.timestamp ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
          order by t.created_at desc, t.id desc
          limit ${limit + 1}
        `;
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(mapTouchpointRow),
        nextCursor:
          hasMore && last
            ? encodeKeysetCursor({
                timestamp: new Date(last.created_at).toISOString(),
                id: last.id,
              })
            : null,
      };
    },

    async getTouchpointDetail(subject, touchpointId) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, READ_PERMISSIONS);
        const detail = await fetchTouchpointDetailPayload(
          tx,
          analyticsEngine,
          dataset,
          environment,
          resolverOrigin,
          touchpointId,
        );
        await insertStaffAuditEvent(tx, {
          workspaceId: detail.touchpoint.workspaceId,
          actorSubject: subject,
          action: "staff.touchpoint_viewed",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
        });
        return detail;
      });
    },

    async suspendTouchpoint(subject, touchpointId, input, resolver) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.touchpointsSuspend,
        );

        const current = await tx<
          {
            id: string;
            public_id: string;
            workspace_id: string | null;
            suspended_at: string | null;
          }[]
        >`
          select id, public_id, workspace_id, suspended_at
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid
          for update
        `;
        const touchpoint = current[0];
        if (!touchpoint) {
          throw new StaffNotFoundError("Touchpoint was not found.");
        }

        // Already suspended: idempotent no-op (no resolver call, no
        // duplicate audit entry), so a retry from the panel never errors.
        if (!touchpoint.suspended_at) {
          await tx`
            update kardo_core.touchpoints
            set suspended_at = now(), suspension_reason = ${input.reason},
                suspended_by = ${subject}::uuid, updated_at = now()
            where id = ${touchpointId}::uuid
          `;

          try {
            await resolver.setSuspended({
              publicId: touchpoint.public_id,
              suspended: true,
            });
          } catch {
            throw new StaffDependencyError(
              "The Resolver could not confirm this Touchpoint's suspension.",
            );
          }

          await insertStaffAuditEvent(tx, {
            workspaceId: touchpoint.workspace_id,
            actorSubject: subject,
            action: "staff.touchpoint_suspended",
            targetType: "touchpoint",
            targetId: touchpointId,
            result: "succeeded",
            reason: input.reason,
          });
        }

        return fetchTouchpointDetailPayload(
          tx,
          analyticsEngine,
          dataset,
          environment,
          resolverOrigin,
          touchpointId,
        );
      });
    },

    async unsuspendTouchpoint(subject, touchpointId, resolver) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.touchpointsSuspend,
        );

        const current = await tx<
          {
            id: string;
            public_id: string;
            workspace_id: string | null;
            suspended_at: string | null;
          }[]
        >`
          select id, public_id, workspace_id, suspended_at
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid
          for update
        `;
        const touchpoint = current[0];
        if (!touchpoint) {
          throw new StaffNotFoundError("Touchpoint was not found.");
        }

        if (touchpoint.suspended_at) {
          await tx`
            update kardo_core.touchpoints
            set suspended_at = null, suspension_reason = null,
                suspended_by = null, updated_at = now()
            where id = ${touchpointId}::uuid
          `;

          try {
            await resolver.setSuspended({
              publicId: touchpoint.public_id,
              suspended: false,
            });
          } catch {
            throw new StaffDependencyError(
              "The Resolver could not confirm this Touchpoint's suspension was lifted.",
            );
          }

          await insertStaffAuditEvent(tx, {
            workspaceId: touchpoint.workspace_id,
            actorSubject: subject,
            action: "staff.touchpoint_unsuspended",
            targetType: "touchpoint",
            targetId: touchpointId,
            result: "succeeded",
          });
        }

        return fetchTouchpointDetailPayload(
          tx,
          analyticsEngine,
          dataset,
          environment,
          resolverOrigin,
          touchpointId,
        );
      });
    },
  };
}
