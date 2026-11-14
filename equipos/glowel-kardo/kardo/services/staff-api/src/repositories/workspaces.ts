import type {
  StaffAssignPlan,
  StaffWorkspaceDetail,
  StaffWorkspacePage,
  StaffWorkspaceQuery,
  StaffWorkspaceRow,
} from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  type AccessReconcile,
  noopAccessReconcile,
} from "../clients/access-reconcile.js";
import {
  type AnalyticsDays,
  type AnalyticsEngineClient,
  fetchTapsForPublicIds,
} from "../clients/analytics-engine.js";
import {
  containsPattern,
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
  type AuditEventRow,
  auditEventRowFrom,
  auditEventRowSelect,
  mapAuditEventRow,
  mapTouchpointRow,
  type TouchpointRow,
  touchpointRowFrom,
  touchpointRowSelect,
} from "./shared-rows.js";

const TAPS_WINDOW_DAYS: AnalyticsDays = 30;

export type StaffWorkspaceRepository = {
  listWorkspaces(
    subject: string,
    query: StaffWorkspaceQuery,
  ): Promise<StaffWorkspacePage>;
  getWorkspaceDetail(
    subject: string,
    workspaceId: string,
  ): Promise<StaffWorkspaceDetail>;
  assignPlan(
    subject: string,
    workspaceId: string,
    input: StaffAssignPlan,
  ): Promise<StaffWorkspaceDetail>;
};

export function unavailableStaffWorkspaceRepository(): StaffWorkspaceRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    listWorkspaces: unavailable,
    getWorkspaceDetail: unavailable,
    assignPlan: unavailable,
  };
}

type WorkspaceRow = {
  id: string;
  public_id: string;
  name: string;
  kind: string;
  created_at: string;
  owner_email: string | null;
  members: number;
  touchpoints: number;
  active_touchpoints: number;
  suspended_touchpoints: number;
  experiences: number;
  leads: number;
  plan_code: string | null;
  last_activity_at: string;
};

function workspaceRowSelect(sql: Sql) {
  return sql`
    w.id, w.public_id, w.name, w.kind::text as kind, w.created_at,
    (select p.email from kardo_core.workspace_memberships m
       join kardo_core.profiles p on p.id = m.profile_id
       where m.workspace_id = w.id and m.role = 'owner' limit 1) as owner_email,
    (select count(*)::int from kardo_core.workspace_memberships m2 where m2.workspace_id = w.id) as members,
    (select count(*)::int from kardo_core.touchpoints t2 where t2.workspace_id = w.id) as touchpoints,
    (select count(*)::int from kardo_core.touchpoints t3 where t3.workspace_id = w.id and t3.status = 'active') as active_touchpoints,
    (select count(*)::int from kardo_core.touchpoints t4 where t4.workspace_id = w.id and t4.suspended_at is not null) as suspended_touchpoints,
    (select count(*)::int from kardo_core.experiences e2 where e2.workspace_id = w.id and e2.archived_at is null) as experiences,
    (select count(l2.id)::int from kardo_core.leads l2 where l2.workspace_id = w.id) as leads,
    -- The manual plan: the person's account (ADR 024), or an internal
    -- organization's own.
    coalesce(
      (select plan.code from kardo_billing.account_plans ap
         join kardo_core.plans plan on plan.id = ap.plan_id
         where ap.account_id = w.billing_account_id
           and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)),
      (select plan.code from kardo_core.workspace_plans wp
         join kardo_core.plans plan on plan.id = wp.plan_id
         where wp.workspace_id = w.id)
    ) as plan_code,
    greatest(
      w.updated_at,
      coalesce((select max(t5.updated_at) from kardo_core.touchpoints t5 where t5.workspace_id = w.id), w.updated_at),
      coalesce((select max(e3.updated_at) from kardo_core.experiences e3 where e3.workspace_id = w.id), w.updated_at)
    ) as last_activity_at
  `;
}

function mapWorkspaceRow(row: WorkspaceRow): StaffWorkspaceRow {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    kind: row.kind as StaffWorkspaceRow["kind"],
    createdAt: new Date(row.created_at).toISOString(),
    ownerEmail: row.owner_email,
    members: row.members,
    touchpoints: row.touchpoints,
    activeTouchpoints: row.active_touchpoints,
    suspendedTouchpoints: row.suspended_touchpoints,
    experiences: row.experiences,
    leads: row.leads,
    planCode: row.plan_code,
    lastActivityAt: row.last_activity_at
      ? new Date(row.last_activity_at).toISOString()
      : null,
  };
}

async function fetchWorkspaceRow(
  tx: Sql,
  workspaceId: string,
): Promise<WorkspaceRow | undefined> {
  const rows = await tx<WorkspaceRow[]>`
    select ${workspaceRowSelect(tx)}
    from kardo_core.workspaces w
    where w.id = ${workspaceId}::uuid
  `;
  return rows[0];
}

type MemberRow = {
  profile_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

type ExperienceRow = {
  id: string;
  name: string;
  type: string;
  archived: boolean;
  live_touchpoints: number;
  versions: number;
  updated_at: string;
};

type PlanDetailRow = {
  plan_id: string;
  code: string;
  name: string;
  assigned_at: string;
};

/** Fetches the full detail payload without recording a view — used both by
 * the audited `getWorkspaceDetail` (the GET endpoint) and by `assignPlan`
 * (a write, which records its own `staff.plan_assigned` event instead of a
 * duplicate "viewed" one). */
async function fetchWorkspaceDetailPayload(
  tx: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
  workspaceId: string,
): Promise<StaffWorkspaceDetail> {
  const workspaceRow = await fetchWorkspaceRow(tx, workspaceId);
  if (!workspaceRow) {
    throw new StaffNotFoundError("Workspace was not found.");
  }

  const memberRows = await tx<MemberRow[]>`
    select m.profile_id, p.display_name, p.email, m.role::text as role, m.created_at
    from kardo_core.workspace_memberships m
    left join kardo_core.profiles p on p.id = m.profile_id
    where m.workspace_id = ${workspaceId}::uuid
    order by m.created_at asc
    limit 200
  `;

  const touchpointRows = await tx<TouchpointRow[]>`
    select ${touchpointRowSelect(tx)}
    ${touchpointRowFrom(tx)}
    where t.workspace_id = ${workspaceId}::uuid
    order by t.created_at desc
    limit 500
  `;

  const experienceRows = await tx<ExperienceRow[]>`
    select e.id, e.name, e.type::text as type, (e.archived_at is not null) as archived,
      (select count(distinct p.touchpoint_id)::int
         from kardo_core.publications p
         join kardo_core.experience_versions ev on ev.id = p.experience_version_id
         where ev.experience_id = e.id and p.status = 'published' and p.superseded_at is null) as live_touchpoints,
      (select count(*)::int from kardo_core.experience_versions ev2 where ev2.experience_id = e.id) as versions,
      e.updated_at
    from kardo_core.experiences e
    where e.workspace_id = ${workspaceId}::uuid
    order by e.updated_at desc
    limit 500
  `;

  const planRows = await tx<PlanDetailRow[]>`
    select plan.id as plan_id, plan.code, plan.name, ap.assigned_at
    from kardo_billing.account_plans ap
    join kardo_core.workspaces aw on aw.billing_account_id = ap.account_id
    join kardo_core.plans plan on plan.id = ap.plan_id
    where aw.id = ${workspaceId}::uuid
      and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = aw.id)
    union all
    select plan.id as plan_id, plan.code, plan.name, wp.assigned_at
    from kardo_core.workspace_plans wp
    join kardo_core.plans plan on plan.id = wp.plan_id
    where wp.workspace_id = ${workspaceId}::uuid
    limit 1
  `;

  const leadRows = await tx<{ total: number; last_30_days: number }[]>`
    select
      count(l.id)::int as total,
      count(l.id) filter (where l.created_at >= now() - interval '30 days')::int as last_30_days
    from kardo_core.leads l
    where l.workspace_id = ${workspaceId}::uuid
  `;

  const auditRows = await tx<AuditEventRow[]>`
    select ${auditEventRowSelect(tx)}
    ${auditEventRowFrom(tx)}
    where event.workspace_id = ${workspaceId}::uuid
    order by event.occurred_at desc
    limit 25
  `;

  let taps30Days: number | null = null;
  if (analyticsEngine) {
    const publicIdRows = await tx<{ public_id: string }[]>`
      select public_id from kardo_core.touchpoints where workspace_id = ${workspaceId}::uuid
    `;
    try {
      taps30Days = await fetchTapsForPublicIds({
        client: analyticsEngine,
        dataset,
        environment,
        days: TAPS_WINDOW_DAYS,
        publicIds: publicIdRows.map((row) => row.public_id),
      });
    } catch {
      taps30Days = null;
    }
  }

  return {
    workspace: mapWorkspaceRow(workspaceRow),
    members: memberRows.map((row) => ({
      profileId: row.profile_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role as StaffWorkspaceDetail["members"][number]["role"],
      joinedAt: new Date(row.created_at).toISOString(),
    })),
    touchpoints: touchpointRows.map(mapTouchpointRow),
    experiences: experienceRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      archived: row.archived,
      liveTouchpoints: row.live_touchpoints,
      versions: row.versions,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    plan: planRows[0]
      ? {
          planId: planRows[0].plan_id,
          code: planRows[0].code,
          name: planRows[0].name,
          assignedAt: new Date(planRows[0].assigned_at).toISOString(),
        }
      : null,
    leads: {
      total: leadRows[0]?.total ?? 0,
      last30Days: leadRows[0]?.last_30_days ?? 0,
    },
    taps30Days,
    recentAudit: auditRows.map(mapAuditEventRow),
  };
}

export function createPostgresStaffWorkspaceRepository(
  sql: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
  reconcile: AccessReconcile = noopAccessReconcile,
): StaffWorkspaceRepository {
  return {
    async listWorkspaces(subject, query) {
      const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
      const limit = resolveLimit(query.limit);
      const trimmedQuery = query.query?.trim();
      const hasQuery = Boolean(trimmedQuery && trimmedQuery.length > 0);
      const pattern = hasQuery ? containsPattern(trimmedQuery as string) : "";
      const kind = query.kind;

      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.customersRead,
        );
        return tx<WorkspaceRow[]>`
          select ${workspaceRowSelect(tx)}
          from kardo_core.workspaces w
          where (
            not ${hasQuery}
            or w.name ilike ${pattern} escape '\\'
            or w.public_id ilike ${pattern} escape '\\'
            or exists (
              select 1 from kardo_core.workspace_memberships m
              join kardo_core.profiles p on p.id = m.profile_id
              where m.workspace_id = w.id and p.email ilike ${pattern} escape '\\'
            )
            or exists (
              select 1 from kardo_core.touchpoints t
              where t.workspace_id = w.id and t.public_id ilike ${pattern} escape '\\'
            )
          )
          and (${kind === undefined} or w.kind::text = ${kind ?? ""})
          and (
            ${cursor === null}
            or (w.created_at, w.id) < (${cursor?.timestamp ?? null}::timestamptz, ${cursor?.id ?? null}::uuid)
          )
          order by w.created_at desc, w.id desc
          limit ${limit + 1}
        `;
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      return {
        items: page.map(mapWorkspaceRow),
        nextCursor:
          hasMore && last
            ? encodeKeysetCursor({
                timestamp: new Date(last.created_at).toISOString(),
                id: last.id,
              })
            : null,
      };
    },

    async getWorkspaceDetail(subject, workspaceId) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.customersRead,
        );
        const detail = await fetchWorkspaceDetailPayload(
          tx,
          analyticsEngine,
          dataset,
          environment,
          workspaceId,
        );
        await insertStaffAuditEvent(tx, {
          workspaceId,
          actorSubject: subject,
          action: "staff.workspace_viewed",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
        });
        return detail;
      });
    },

    async assignPlan(subject, workspaceId, input) {
      // ADR 024: every organization of the person's account changes plan.
      let covered: string[] = [workspaceId];
      const detail = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.plansWrite);

        const workspaceExists = await tx<{ id: string }[]>`
          select id from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        if (!workspaceExists[0]) {
          throw new StaffNotFoundError("Workspace was not found.");
        }
        const [deletedMark] = await tx<{ deleted_at: Date | null }[]>`
          select deleted_at from kardo_core.workspaces
          where id = ${workspaceId}::uuid
        `;
        if (deletedMark?.deleted_at) {
          throw new StaffConflictError("La organización fue eliminada.");
        }
        const planExists = await tx<{ id: string }[]>`
          select id from kardo_core.plans where id = ${input.planId}::uuid
        `;
        if (!planExists[0]) {
          throw new StaffNotFoundError("Plan was not found.");
        }

        // `until` (ADR 019): a courtesy plan that lapses on its own; after
        // it the subscription or the default plan governs again.
        const until = input.until ? new Date(input.until) : null;
        // ADR 024: the plan is the person's. A manual plan goes to the
        // billing account of the organization (it covers all of that
        // person's organizations); an internal one keeps its own.
        const [scope] = await tx<
          { account_id: string | null; internal: boolean }[]
        >`
          select w.billing_account_id as account_id,
            exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id) as internal
          from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
        `;
        if (scope?.account_id && !scope.internal) {
          await tx`
            insert into kardo_billing.account_plans (
              account_id, plan_id, organizations_max, override_until, assigned_by, assigned_at
            ) values (
              ${scope.account_id}::uuid, ${input.planId}::uuid, ${input.organizationsMax ?? null},
              ${until}, ${subject}::uuid, now()
            )
            on conflict (account_id) do update
              set plan_id = excluded.plan_id, organizations_max = excluded.organizations_max,
                override_until = excluded.override_until, assigned_by = excluded.assigned_by,
                assigned_at = now()
          `;
          const rows = await tx<{ id: string }[]>`
            select id from kardo_core.workspaces
            where billing_account_id = ${scope.account_id}::uuid and deleted_at is null
          `;
          covered = [
            workspaceId,
            ...rows.map((row) => row.id).filter((id) => id !== workspaceId),
          ];
        } else {
          await tx`
            insert into kardo_core.workspace_plans (workspace_id, plan_id, assigned_by, assigned_at, override_until)
            values (${workspaceId}::uuid, ${input.planId}::uuid, ${subject}::uuid, now(), ${until})
            on conflict (workspace_id) do update
              set plan_id = excluded.plan_id, assigned_by = excluded.assigned_by,
                assigned_at = now(), override_until = excluded.override_until
          `;
        }

        await insertStaffAuditEvent(tx, {
          workspaceId,
          actorSubject: subject,
          action: "staff.plan_assigned",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          reason: input.reason,
          metadata: {
            planId: input.planId,
            until: input.until ?? null,
            organizationsMax: input.organizationsMax ?? null,
          },
        });

        return fetchWorkspaceDetailPayload(
          tx,
          analyticsEngine,
          dataset,
          environment,
          workspaceId,
        );
      });
      // A courtesy plan reopens the public pages at once (ADR 020 §4), after
      // the transaction commits; best effort, the hourly tick retries (and
      // the hourly plan check brings back what was out of the plan).
      for (const id of covered) await reconcile(id);
      return detail;
    },
  };
}
