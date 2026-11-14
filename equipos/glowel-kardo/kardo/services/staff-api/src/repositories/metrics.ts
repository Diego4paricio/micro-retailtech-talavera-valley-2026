import type { StaffMetricsOverview, StaffWorkspaceRow } from "@kardo/contracts";
import { staffPermissions } from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  type AnalyticsDays,
  type AnalyticsEngineClient,
  emptyChannelCounts,
  fetchPlatformTapSummary,
  fetchPreviousPlatformTapTotal,
  fetchTopTappedPublicIds,
} from "../clients/analytics-engine.js";
import { requireStaffPermission, withStaffContext } from "../http/context.js";
import { StaffRepositoryError } from "../http/errors.js";

export type StaffMetricsRepository = {
  getOverview(
    subject: string,
    days: AnalyticsDays,
    onAnalyticsWarning: (message: string, error: unknown) => void,
  ): Promise<StaffMetricsOverview>;
};

export function unavailableStaffMetricsRepository(): StaffMetricsRepository {
  return {
    getOverview: async () => Promise.reject(new StaffRepositoryError()),
  };
}

type TotalsRow = {
  customers: number;
  workspaces: number;
  organizations: number;
  touchpoints: number;
  active_touchpoints: number;
  suspended_touchpoints: number;
  experiences: number;
  live_experiences: number;
  leads: number;
  pending_publications: number;
  failed_publications_last_24_hours: number;
  succeeded_publications_period: number;
  failed_publications_period: number;
  pending_publications_period: number;
  median_publish_seconds: number | null;
};
type PeriodRow = {
  new_customers: number;
  new_workspaces: number;
  new_touchpoints: number;
  publications: number;
  leads: number;
  previous_new_customers: number;
  previous_new_touchpoints: number;
  previous_publications: number;
  previous_leads: number;
};
type DailyRow = {
  date: string;
  new_customers: number;
  new_touchpoints: number;
  publications: number;
  failed_publications: number;
  leads: number;
};
type ExperienceTypeRow = { type: string; total: number; live: number };
type TouchpointStatusRow = { status: string; total: number };
type PlanRow = { plan_code: string; name: string; workspaces: number };
type TopWorkspaceRow = {
  id: string;
  name: string;
  kind: StaffWorkspaceRow["kind"];
  touchpoints: number;
  leads: number;
};
type WorkspaceTapRow = {
  workspace_id: string;
  name: string;
  kind: StaffWorkspaceRow["kind"];
  taps: number;
  touchpoints: number;
  leads: number;
};

export function createPostgresStaffMetricsRepository(
  sql: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
): StaffMetricsRepository {
  return {
    async getOverview(subject, days, onAnalyticsWarning) {
      const base = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.metricsRead);

        const totalsRows = await tx<TotalsRow[]>`
          select
            (select count(*)::int from kardo_core.profiles) as customers,
            (select count(*)::int from kardo_core.workspaces) as workspaces,
            (select count(*)::int from kardo_core.workspaces where kind = 'organization') as organizations,
            (select count(*)::int from kardo_core.touchpoints) as touchpoints,
            (select count(*)::int from kardo_core.touchpoints where status = 'active') as active_touchpoints,
            (select count(*)::int from kardo_core.touchpoints where suspended_at is not null) as suspended_touchpoints,
            (select count(*)::int from kardo_core.experiences where archived_at is null) as experiences,
            (select count(*)::int from kardo_core.experiences e where e.archived_at is null and exists (
              select 1 from kardo_core.publications p
              join kardo_core.experience_versions ev on ev.id = p.experience_version_id
              where ev.experience_id = e.id and p.status = 'published' and p.superseded_at is null
            )) as live_experiences,
            (select count(l.id)::int from kardo_core.leads l) as leads,
            (select count(*)::int from kardo_core.publications where status in ('pending', 'processing')) as pending_publications,
            (select count(*)::int from kardo_core.publications where status = 'failed' and created_at >= now() - interval '24 hours') as failed_publications_last_24_hours,
            (select count(*)::int from kardo_core.publications where status = 'published' and published_at >= now() - make_interval(days => ${days})) as succeeded_publications_period,
            (select count(*)::int from kardo_core.publications where status = 'failed' and created_at >= now() - make_interval(days => ${days})) as failed_publications_period,
            (select count(*)::int from kardo_core.publications where status in ('pending', 'processing') and created_at >= now() - make_interval(days => ${days})) as pending_publications_period,
            (select percentile_cont(0.5) within group (order by extract(epoch from (published_at - created_at)))
               from kardo_core.publications
               where status = 'published' and published_at >= now() - make_interval(days => ${days})) as median_publish_seconds
        `;
        const totals = totalsRows[0];
        if (!totals) {
          throw new StaffRepositoryError("Metrics totals were not available.");
        }

        const periodRows = await tx<PeriodRow[]>`
          select
            (select count(*)::int from kardo_core.profiles where created_at >= now() - make_interval(days => ${days})) as new_customers,
            (select count(*)::int from kardo_core.workspaces where created_at >= now() - make_interval(days => ${days})) as new_workspaces,
            (select count(*)::int from kardo_core.touchpoints where created_at >= now() - make_interval(days => ${days})) as new_touchpoints,
            (select count(*)::int from kardo_core.publications where created_at >= now() - make_interval(days => ${days})) as publications,
            (select count(l.id)::int from kardo_core.leads l where l.created_at >= now() - make_interval(days => ${days})) as leads,
            (select count(*)::int from kardo_core.profiles where created_at >= now() - make_interval(days => ${days * 2}) and created_at < now() - make_interval(days => ${days})) as previous_new_customers,
            (select count(*)::int from kardo_core.touchpoints where created_at >= now() - make_interval(days => ${days * 2}) and created_at < now() - make_interval(days => ${days})) as previous_new_touchpoints,
            (select count(*)::int from kardo_core.publications where created_at >= now() - make_interval(days => ${days * 2}) and created_at < now() - make_interval(days => ${days})) as previous_publications,
            (select count(l.id)::int from kardo_core.leads l where l.created_at >= now() - make_interval(days => ${days * 2}) and l.created_at < now() - make_interval(days => ${days})) as previous_leads
        `;
        const period = periodRows[0];
        if (!period) {
          throw new StaffRepositoryError("Metrics period was not available.");
        }

        const dailyRows = await tx<DailyRow[]>`
          with series as (
            select generate_series(
              date_trunc('day', now() at time zone 'utc') - make_interval(days => ${days - 1}),
              date_trunc('day', now() at time zone 'utc'),
              interval '1 day'
            ) as day
          )
          select
            to_char(series.day, 'YYYY-MM-DD') as date,
            (select count(*)::int from kardo_core.profiles p where date_trunc('day', p.created_at at time zone 'utc') = series.day) as new_customers,
            (select count(*)::int from kardo_core.touchpoints t where date_trunc('day', t.created_at at time zone 'utc') = series.day) as new_touchpoints,
            (select count(*)::int from kardo_core.publications pub where date_trunc('day', pub.created_at at time zone 'utc') = series.day) as publications,
            (select count(*)::int from kardo_core.publications pub where pub.status = 'failed' and date_trunc('day', pub.created_at at time zone 'utc') = series.day) as failed_publications,
            (select count(l.id)::int from kardo_core.leads l where date_trunc('day', l.created_at at time zone 'utc') = series.day) as leads
          from series
          order by series.day asc
        `;

        const experienceTypeRows = await tx<ExperienceTypeRow[]>`
          select
            e.type::text as type,
            count(*)::int as total,
            count(*) filter (where exists (
              select 1 from kardo_core.publications p
              join kardo_core.experience_versions ev on ev.id = p.experience_version_id
              where ev.experience_id = e.id and p.status = 'published' and p.superseded_at is null
            ))::int as live
          from kardo_core.experiences e
          where e.archived_at is null
          group by e.type
          order by e.type
        `;

        const touchpointStatusRows = await tx<TouchpointStatusRow[]>`
          select status::text as status, count(*)::int as total
          from kardo_core.touchpoints
          group by status
          order by status
        `;

        const planRows = await tx<PlanRow[]>`
          select coalesce(plan.code, 'none') as plan_code, coalesce(plan.name, 'Sin plan') as name, count(workspace.id)::int as workspaces
          from kardo_core.workspaces workspace
          left join kardo_billing.account_plans ap on ap.account_id = workspace.billing_account_id
          left join kardo_core.workspace_plans wp on wp.workspace_id = workspace.id
          left join kardo_core.plans plan on plan.id = coalesce(ap.plan_id, wp.plan_id)
          group by plan.code, plan.name
          order by workspaces desc, plan_code asc
        `;

        const topByTouchpointsRows = await tx<TopWorkspaceRow[]>`
          select w.id, w.name, w.kind,
            (select count(*)::int from kardo_core.touchpoints t where t.workspace_id = w.id) as touchpoints,
            (select count(l.id)::int from kardo_core.leads l where l.workspace_id = w.id) as leads
          from kardo_core.workspaces w
          order by touchpoints desc, w.created_at asc
          limit 10
        `;

        return {
          totals,
          period,
          daily: dailyRows,
          experienceTypes: experienceTypeRows,
          touchpointStatuses: touchpointStatusRows,
          plans: planRows,
          topByTouchpoints: topByTouchpointsRows,
        };
      });

      let taps: StaffMetricsOverview["taps"] = null;
      let topWorkspaces = base.topByTouchpoints.map((row) => ({
        workspaceId: row.id,
        name: row.name,
        kind: row.kind,
        taps: 0,
        touchpoints: row.touchpoints,
        leads: row.leads,
      }));

      if (analyticsEngine) {
        try {
          const [summary, previousTotal, topTapped] = await Promise.all([
            fetchPlatformTapSummary({
              client: analyticsEngine,
              dataset,
              environment,
              days,
            }),
            fetchPreviousPlatformTapTotal({
              client: analyticsEngine,
              dataset,
              environment,
              days,
            }),
            fetchTopTappedPublicIds({
              client: analyticsEngine,
              dataset,
              environment,
              days,
              limit: 200,
            }),
          ]);

          const dailyChannels: NonNullable<
            StaffMetricsOverview["taps"]
          >["daily"] = [];
          for (let offset = days - 1; offset >= 0; offset -= 1) {
            const date = isoDateDaysAgo(offset);
            const counts = summary.daily.get(date) ?? emptyChannelCounts();
            dailyChannels.push({
              date,
              nfc: counts.nfc,
              qr: counts.qr,
              link: counts.link,
            });
          }

          taps = {
            total: summary.total,
            previousTotal,
            byChannel: summary.byChannel,
            daily: dailyChannels,
            clicks: summary.clicks,
          };

          if (topTapped.size > 0) {
            const workspaceTaps = await withStaffContext(
              sql,
              subject,
              async (tx) => {
                await requireStaffPermission(
                  tx,
                  subject,
                  staffPermissions.metricsRead,
                );
                return mapTappedPublicIdsToWorkspaces(tx, topTapped);
              },
            );
            if (workspaceTaps.length > 0) {
              topWorkspaces = workspaceTaps
                .sort((a, b) => b.taps - a.taps)
                .slice(0, 10)
                .map((row) => ({
                  workspaceId: row.workspace_id,
                  name: row.name,
                  kind: row.kind,
                  taps: row.taps,
                  touchpoints: row.touchpoints,
                  leads: row.leads,
                }));
            }
          }
        } catch (error) {
          onAnalyticsWarning(
            "Analytics Engine query failed for the metrics overview; taps are unavailable.",
            error,
          );
          taps = null;
        }
      }

      return {
        days,
        generatedAt: new Date().toISOString(),
        totals: {
          customers: base.totals.customers,
          workspaces: base.totals.workspaces,
          organizations: base.totals.organizations,
          touchpoints: base.totals.touchpoints,
          activeTouchpoints: base.totals.active_touchpoints,
          suspendedTouchpoints: base.totals.suspended_touchpoints,
          experiences: base.totals.experiences,
          liveExperiences: base.totals.live_experiences,
          leads: base.totals.leads,
          pendingPublications: base.totals.pending_publications,
          failedPublicationsLast24Hours:
            base.totals.failed_publications_last_24_hours,
        },
        period: {
          newCustomers: base.period.new_customers,
          newWorkspaces: base.period.new_workspaces,
          newTouchpoints: base.period.new_touchpoints,
          publications: base.period.publications,
          leads: base.period.leads,
          previousNewCustomers: base.period.previous_new_customers,
          previousNewTouchpoints: base.period.previous_new_touchpoints,
          previousPublications: base.period.previous_publications,
          previousLeads: base.period.previous_leads,
        },
        daily: base.daily.map((row) => ({
          date: row.date,
          newCustomers: row.new_customers,
          newTouchpoints: row.new_touchpoints,
          publications: row.publications,
          failedPublications: row.failed_publications,
          leads: row.leads,
        })),
        taps,
        experienceTypes: base.experienceTypes.map((row) => ({
          type: row.type,
          total: row.total,
          live: row.live,
        })),
        touchpointStatuses: base.touchpointStatuses.map((row) => ({
          status:
            row.status as StaffMetricsOverview["touchpointStatuses"][number]["status"],
          total: row.total,
        })),
        plans: base.plans.map((row) => ({
          planCode: row.plan_code,
          name: row.name,
          workspaces: row.workspaces,
        })),
        topWorkspaces,
        publicationHealth: {
          succeeded: base.totals.succeeded_publications_period,
          failed: base.totals.failed_publications_period,
          pending: base.totals.pending_publications_period,
          successRate: computeSuccessRate(
            base.totals.succeeded_publications_period,
            base.totals.failed_publications_period,
          ),
          medianSeconds: base.totals.median_publish_seconds,
        },
      };
    },
  };
}

function computeSuccessRate(succeeded: number, failed: number): number | null {
  const finished = succeeded + failed;
  if (finished === 0) return null;
  return succeeded / finished;
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const isoString = date.toISOString();
  return isoString.slice(0, 10);
}

async function mapTappedPublicIdsToWorkspaces(
  tx: Sql,
  tapped: Map<string, number>,
): Promise<WorkspaceTapRow[]> {
  const publicIds = [...tapped.keys()];
  const touchpointRows = await tx<
    { public_id: string; workspace_id: string | null }[]
  >`
    select public_id, workspace_id
    from kardo_core.touchpoints
    where public_id = any(${publicIds}::text[])
  `;
  const tapsByWorkspace = new Map<string, number>();
  for (const row of touchpointRows) {
    if (!row.workspace_id) continue;
    const taps = tapped.get(row.public_id) ?? 0;
    tapsByWorkspace.set(
      row.workspace_id,
      (tapsByWorkspace.get(row.workspace_id) ?? 0) + taps,
    );
  }
  if (tapsByWorkspace.size === 0) return [];
  const workspaceIds = [...tapsByWorkspace.keys()];
  const workspaceRows = await tx<
    {
      id: string;
      name: string;
      kind: StaffWorkspaceRow["kind"];
      touchpoints: number;
      leads: number;
    }[]
  >`
    select w.id, w.name, w.kind,
      (select count(*)::int from kardo_core.touchpoints t where t.workspace_id = w.id) as touchpoints,
      (select count(l.id)::int from kardo_core.leads l where l.workspace_id = w.id) as leads
    from kardo_core.workspaces w
    where w.id = any(${workspaceIds}::uuid[])
  `;
  return workspaceRows.map((row) => ({
    workspace_id: row.id,
    name: row.name,
    kind: row.kind,
    taps: tapsByWorkspace.get(row.id) ?? 0,
    touchpoints: row.touchpoints,
    leads: row.leads,
  }));
}
