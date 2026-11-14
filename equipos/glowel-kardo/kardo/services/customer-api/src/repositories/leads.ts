import type {
  Lead,
  LeadPage,
  LeadRetention,
  LeadStatus,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertFeature } from "../billing/entitlements.js";
import { NotFoundError } from "../errors.js";
import { decodeLeadCursor, encodeLeadCursor } from "../pagination.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

export type ListLeadsInput = {
  touchpointId?: string;
  status?: LeadStatus;
  cursor?: string;
  limit: number;
};

export type LeadRepository = {
  listLeads(
    identity: CustomerIdentity,
    workspaceId: string,
    input: ListLeadsInput,
  ): Promise<LeadPage>;
  /** All leads matching the filter, oldest limits removed, bounded to 10,000
   * rows for CSV export. Also writes the `leads.exported` audit event. */
  exportLeads(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string | undefined,
    status?: LeadStatus | undefined,
  ): Promise<readonly Lead[]>;
  /** Leads-per-day and leads-per-Touchpoint counts over the last `days`
   * days, restricted to `touchpointIds` when given. Used to complete the
   * Analytics summary (Analytics Engine has no notion of a lead's content,
   * only that a lead event happened; the customer-facing lead itself is
   * only ever in Postgres). */
  countLeadsForAnalytics(
    identity: CustomerIdentity,
    workspaceId: string,
    days: number,
    touchpointIds?: readonly string[],
  ): Promise<LeadAnalyticsCounts>;
  /** Lead counts grouped by `(touchpoint, publication revision)` over the
   * last `days` days — the join key the Analytics summary uses to resolve
   * each count back to the Experience that was actually live for that
   * revision. */
  countLeadsByRevision(
    identity: CustomerIdentity,
    workspaceId: string,
    days: number,
    touchpointIds?: readonly string[],
  ): Promise<readonly LeadRevisionCount[]>;
  updateLeadStatus(
    identity: CustomerIdentity,
    workspaceId: string,
    leadId: string,
    status: LeadStatus,
  ): Promise<Lead>;
  deleteLead(
    identity: CustomerIdentity,
    workspaceId: string,
    leadId: string,
  ): Promise<void>;
  getLeadRetention(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<LeadRetention>;
  setLeadRetention(
    identity: CustomerIdentity,
    workspaceId: string,
    retention: LeadRetention,
  ): Promise<LeadRetention>;
};

export type LeadRevisionCount = {
  touchpointId: string;
  revision: number;
  count: number;
};

export type LeadAnalyticsCounts = {
  total: number;
  byDay: Map<string, number>;
  byTouchpoint: Map<string, number>;
};

export class LeadRepositoryError extends Error {}

export function unavailableLeadRepository(): LeadRepository {
  const unavailable = () =>
    Promise.reject(new LeadRepositoryError("Lead storage is not configured."));
  return {
    listLeads: unavailable,
    exportLeads: unavailable,
    countLeadsForAnalytics: unavailable,
    countLeadsByRevision: unavailable,
    updateLeadStatus: unavailable,
    deleteLead: unavailable,
    getLeadRetention: unavailable,
    setLeadRetention: unavailable,
  };
}

type LeadRow = {
  id: string;
  touchpoint_id: string;
  touchpoint_name: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  message: string | null;
  publication_revision: number;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
};

/** Leads past the workspace's retention are hidden immediately, even before
 * the daily purge job deletes them. */
function withinRetention(tx: Sql) {
  return tx`
    and (
      w.lead_retention_days is null
      or l.created_at >= now() - make_interval(days => w.lead_retention_days)
    )
  `;
}

function leadColumns(tx: Sql) {
  return tx`
    l.id, l.touchpoint_id, t.operational_name as touchpoint_name,
    l.email, l.name, l.phone, l.message, l.publication_revision, l.status,
    l.created_at, l.updated_at
  `;
}

export function createPostgresLeadRepository(sql: Sql): LeadRepository {
  return {
    async listLeads(identity, workspaceId, input) {
      const cursor = input.cursor ? decodeLeadCursor(input.cursor) : null;
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.read",
        );
        return tx<LeadRow[]>`
          select ${leadColumns(tx)}
          from kardo_core.leads l
          join kardo_core.workspaces w on w.id = l.workspace_id
          left join kardo_core.touchpoints t on t.id = l.touchpoint_id
          where l.workspace_id = ${workspaceId}::uuid
            ${withinRetention(tx)}
            and (${input.touchpointId ?? null}::uuid is null or l.touchpoint_id = ${input.touchpointId ?? null}::uuid)
            and (${input.status ?? null}::text is null or l.status = ${input.status ?? null}::text)
            and (
              ${cursor === null}
              or (l.created_at, l.id) < (${cursor?.createdAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
            )
          order by l.created_at desc, l.id desc
          limit ${input.limit + 1}
        `;
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(toLead),
        nextCursor:
          hasMore && last
            ? encodeLeadCursor({
                createdAt: new Date(last.created_at).toISOString(),
                id: last.id,
              })
            : null,
      };
    },
    async exportLeads(identity, workspaceId, touchpointId, status) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.read",
        );
        await assertFeature(tx, workspaceId, "leads.export");
        const result = await tx<LeadRow[]>`
          select ${leadColumns(tx)}
          from kardo_core.leads l
          join kardo_core.workspaces w on w.id = l.workspace_id
          left join kardo_core.touchpoints t on t.id = l.touchpoint_id
          where l.workspace_id = ${workspaceId}::uuid
            ${withinRetention(tx)}
            and (${touchpointId ?? null}::uuid is null or l.touchpoint_id = ${touchpointId ?? null}::uuid)
            -- The same «Por atender / Atendidas / Cerradas» filter the list
            -- shows (domain audit A2-53).
            and (${status ?? null}::text is null or l.status::text = ${status ?? null}::text)
          order by l.created_at desc, l.id desc
          limit 10000
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "leads.exported",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: {
            touchpointId: touchpointId ?? null,
            status: status ?? null,
            count: result.length,
          },
        });
        return result;
      });
      return rows.map(toLead);
    },
    async countLeadsForAnalytics(identity, workspaceId, days, touchpointIds) {
      const filterToTouchpoints =
        touchpointIds !== undefined && touchpointIds.length > 0;
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "analytics.read",
        );
        type Row = { day: string; touchpoint_id: string; count: number };
        return filterToTouchpoints
          ? tx<Row[]>`
              select l.created_at::date::text as day, l.touchpoint_id, count(*)::int as count
              from kardo_core.leads l
              join kardo_core.workspaces w on w.id = l.workspace_id
              where l.workspace_id = ${workspaceId}::uuid
                and l.created_at >= now() - (${days}::text || ' days')::interval
                ${withinRetention(tx)}
                and l.touchpoint_id in ${tx(touchpointIds)}
              group by day, l.touchpoint_id
            `
          : tx<Row[]>`
              select l.created_at::date::text as day, l.touchpoint_id, count(*)::int as count
              from kardo_core.leads l
              join kardo_core.workspaces w on w.id = l.workspace_id
              where l.workspace_id = ${workspaceId}::uuid
                and l.created_at >= now() - (${days}::text || ' days')::interval
                ${withinRetention(tx)}
              group by day, l.touchpoint_id
            `;
      });
      const byDay = new Map<string, number>();
      const byTouchpoint = new Map<string, number>();
      let total = 0;
      for (const row of rows) {
        byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.count);
        byTouchpoint.set(
          row.touchpoint_id,
          (byTouchpoint.get(row.touchpoint_id) ?? 0) + row.count,
        );
        total += row.count;
      }
      return { total, byDay, byTouchpoint };
    },
    async countLeadsByRevision(identity, workspaceId, days, touchpointIds) {
      const filterToTouchpoints =
        touchpointIds !== undefined && touchpointIds.length > 0;
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "analytics.read",
        );
        type Row = { touchpoint_id: string; revision: number; count: number };
        const rows = filterToTouchpoints
          ? await tx<Row[]>`
              select l.touchpoint_id, l.publication_revision as revision, count(*)::int as count
              from kardo_core.leads l
              join kardo_core.workspaces w on w.id = l.workspace_id
              where l.workspace_id = ${workspaceId}::uuid
                and l.created_at >= now() - (${days}::text || ' days')::interval
                ${withinRetention(tx)}
                and l.touchpoint_id in ${tx(touchpointIds)}
              group by l.touchpoint_id, l.publication_revision
            `
          : await tx<Row[]>`
              select l.touchpoint_id, l.publication_revision as revision, count(*)::int as count
              from kardo_core.leads l
              join kardo_core.workspaces w on w.id = l.workspace_id
              where l.workspace_id = ${workspaceId}::uuid
                and l.created_at >= now() - (${days}::text || ' days')::interval
                ${withinRetention(tx)}
              group by l.touchpoint_id, l.publication_revision
            `;
        return rows.map((row) => ({
          touchpointId: row.touchpoint_id,
          revision: row.revision,
          count: row.count,
        }));
      });
    },
    async updateLeadStatus(identity, workspaceId, leadId, status) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.manage",
        );
        const updated = await tx<{ id: string }[]>`
          update kardo_core.leads
          set status = ${status}, updated_at = now()
          where id = ${leadId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!updated[0]) throw new NotFoundError("Lead was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "lead.status_changed",
          targetType: "lead",
          targetId: leadId,
          result: "succeeded",
          metadata: { status },
        });
        const rows = await tx<LeadRow[]>`
          select ${leadColumns(tx)}
          from kardo_core.leads l
          left join kardo_core.touchpoints t on t.id = l.touchpoint_id
          where l.id = ${leadId}::uuid
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Lead was not found.");
        return toLead(row);
      });
    },
    async deleteLead(identity, workspaceId, leadId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.manage",
        );
        const deleted = await tx<{ id: string }[]>`
          delete from kardo_core.leads
          where id = ${leadId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!deleted[0]) throw new NotFoundError("Lead was not found.");
        // No personal data in the audit trail: only that a lead was erased.
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "lead.deleted",
          targetType: "lead",
          targetId: leadId,
          result: "succeeded",
        });
      });
    },
    async getLeadRetention(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.read",
        );
        const rows = await tx<{ lead_retention_days: number | null }[]>`
          select lead_retention_days from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        return { days: row.lead_retention_days as LeadRetention["days"] };
      });
    },
    async setLeadRetention(identity, workspaceId, retention) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.manage",
        );
        const rows = await tx<{ lead_retention_days: number | null }[]>`
          update kardo_core.workspaces
          set lead_retention_days = ${retention.days}, updated_at = now()
          where id = ${workspaceId}::uuid
          returning lead_retention_days
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "leads.retention_changed",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { days: retention.days },
        });
        return { days: row.lead_retention_days as LeadRetention["days"] };
      });
    },
  };
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    touchpointId: row.touchpoint_id,
    touchpointName: row.touchpoint_name,
    email: row.email,
    name: row.name,
    phone: row.phone,
    message: row.message,
    revision: row.publication_revision,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
