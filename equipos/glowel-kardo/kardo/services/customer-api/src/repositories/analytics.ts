import type {
  AnalyticsSummary,
  ChannelCounts,
  CustomerRole,
  ExperienceType,
  PieceModel,
  TouchpointKind,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  type AnalyticsDays,
  type AnalyticsEngineClient,
  createEngineSummaryCache,
  type EngineSummary,
  type EngineSummaryCache,
  emptyChannelCounts,
  engineSummaryKey,
  fetchEngineSummary,
  type RevisionTotal,
} from "../analytics-engine.js";
import { buildKpis } from "../analytics-kpis.js";
import { NotFoundError, WorkspaceAccessError } from "../errors.js";
import { localHourParts, shiftDateKey } from "../timezone.js";
import {
  type CustomerIdentity,
  requirePermission,
  withCustomerContext,
} from "./context.js";

export type AnalyticsSummaryQuery = {
  days: AnalyticsDays;
  touchpointId?: string;
  groupId?: string;
  /** Already resolved (falls back to UTC) by the route layer. */
  timeZone: string;
};

export type AnalyticsRepository = {
  getSummary(
    identity: CustomerIdentity,
    workspaceId: string,
    query: AnalyticsSummaryQuery,
  ): Promise<AnalyticsSummary>;
};

export class AnalyticsRepositoryError extends Error {}

export function unavailableAnalyticsRepository(): AnalyticsRepository {
  return {
    getSummary: () =>
      Promise.reject(
        new AnalyticsRepositoryError("Analytics storage is not configured."),
      ),
  };
}

type WorkspaceTouchpointRow = {
  id: string;
  public_id: string;
  name: string;
  status: "assigned" | "active" | "paused" | "retired";
  group_id: string | null;
  /** Its group's chain, root first (groups nest, ADR 021). */
  group_path?: string[] | null;
  /** `link` is the shareable-link product, never a physical object (A9-24):
   * «QR y etiquetas activos» and reach must not count it. */
  kind: TouchpointKind;
  /** A Kardo piece's model, for its picture (ADR 026). */
  piece_model?: PieceModel | null;
};

type WorkspaceGroupRow = { id: string; name: string; parent_id: string | null };

type LeadHourRow = {
  /** Start of the UTC hour, in epoch seconds. */
  hour: number;
  touchpoint_id: string;
  revision: number;
  count: number;
};

type PublicationRow = {
  touchpoint_id: string;
  revision: number;
  experience_id: string;
  name: string;
  type: ExperienceType;
};

type WorkspaceAnalyticsRow = {
  role: CustomerRole | null;
  touchpoints: WorkspaceTouchpointRow[];
  groups: WorkspaceGroupRow[];
  leads: LeadHourRow[];
  /** Previous-period leads per UTC hour (epoch seconds) and Touchpoint. */
  previous_leads: { hour: number; touchpoint_id: string; count: number }[];
  publications: PublicationRow[];
};

type TouchpointHint = Pick<
  WorkspaceTouchpointRow,
  "id" | "public_id" | "group_id" | "group_path"
>;

/** Last Touchpoint set seen for a workspace by an authorized request. */
type TouchpointHintCache = Map<
  string,
  { at: number; touchpoints: TouchpointHint[] }
>;

/**
 * A lead older than the organization's retention no longer counts, the
 * same rule `repositories/leads.ts` applies to the list and its counts
 * (`w.lead_retention_days`, null = keep forever). Requires `l` (leads) and
 * `w` (workspaces) aliased in the query's `from`/`join`.
 */
function withinLeadRetention(tx: Sql) {
  return tx`
    and (
      w.lead_retention_days is null
      or l.created_at >= now() - make_interval(days => w.lead_retention_days)
    )
  `;
}

const HINT_TTL_MS = 5 * 60_000;
const HINT_MAX_ENTRIES = 200;
/** Very large workspaces skip the early read instead of holding big hints. */
const HINT_MAX_TOUCHPOINTS = 1_000;

/** In the group's tree (the group itself or any subgroup below it). */
export function inGroupTree(
  row: Pick<TouchpointHint, "group_id" | "group_path">,
  groupId: string,
): boolean {
  return row.group_path
    ? row.group_path.includes(groupId)
    : row.group_id === groupId;
}

function selectTouchpoints<T extends TouchpointHint>(
  touchpoints: readonly T[],
  query: Pick<AnalyticsSummaryQuery, "touchpointId" | "groupId">,
): T[] {
  if (query.touchpointId)
    return touchpoints.filter((row) => row.id === query.touchpointId);
  // Groups nest (ADR 021): a group's numbers include its whole tree.
  if (query.groupId) {
    const groupId = query.groupId;
    return touchpoints.filter((row) => inGroupTree(row, groupId));
  }
  return [...touchpoints];
}

/**
 * Everything the summary needs from Postgres, in ONE statement inside the
 * customer's RLS context: membership, Touchpoints, groups, current and
 * previous-period lead counts, and the publications that were live during
 * the window (to attribute taps to Experiences).
 *
 * The Customer API runs postgres.js with `prepare: false` (pooler-safe), so
 * every parameterized statement costs two network round trips; the summary
 * used to spend ~25 of them across four transactions (≈3.5 s from a remote
 * client). Folding the reads into one statement keeps it at six.
 *
 * Non-members get `role = null` and — because RLS scopes every subquery to the
 * caller's memberships — empty arrays; the caller throws before using them.
 */
async function readWorkspaceAnalytics(
  sql: Sql,
  identity: CustomerIdentity,
  workspaceId: string,
  days: AnalyticsDays,
): Promise<WorkspaceAnalyticsRow> {
  const rows = await withCustomerContext(
    sql,
    identity,
    (tx) => tx<WorkspaceAnalyticsRow[]>`
      select
        (
          select m.role
          from kardo_core.workspace_memberships m
          where m.workspace_id = ${workspaceId}::uuid
            and m.profile_id = ${identity.subject}::uuid
        ) as role,
        coalesce((
          select json_agg(json_build_object(
            'id', t.id, 'public_id', t.public_id, 'name', t.operational_name,
            'status', t.status, 'group_id', t.group_id, 'group_path', tg.path,
            'kind', t.kind, 'piece_model', t.piece_model
          ) order by t.created_at)
          from kardo_core.touchpoints t
          left join kardo_core.touchpoint_groups tg on tg.id = t.group_id
          where t.workspace_id = ${workspaceId}::uuid
        ), '[]'::json) as touchpoints,
        coalesce((
          select json_agg(json_build_object(
            'id', g.id, 'name', g.name, 'parent_id', g.parent_id
          ))
          from kardo_core.touchpoint_groups g
          where g.workspace_id = ${workspaceId}::uuid
        ), '[]'::json) as groups,
        coalesce((
          select json_agg(json_build_object(
            'hour', x.hour, 'touchpoint_id', x.touchpoint_id,
            'revision', x.revision, 'count', x.count
          ))
          from (
            select extract(epoch from date_trunc('hour', l.created_at, 'UTC'))::bigint as hour,
                   l.touchpoint_id, l.publication_revision as revision,
                   count(l.id)::int as count
            from kardo_core.leads l
            join kardo_core.workspaces w on w.id = l.workspace_id
            where l.workspace_id = ${workspaceId}::uuid
              and l.created_at >= now() - make_interval(days => ${days}::int)
              ${withinLeadRetention(tx)}
            group by 1, 2, 3
          ) x
        ), '[]'::json) as leads,
        coalesce((
          select json_agg(json_build_object(
            'hour', x.hour, 'touchpoint_id', x.touchpoint_id, 'count', x.count
          ))
          from (
            select extract(epoch from date_trunc('hour', l.created_at, 'UTC'))::bigint as hour,
                   l.touchpoint_id, count(l.id)::int as count
            from kardo_core.leads l
            join kardo_core.workspaces w on w.id = l.workspace_id
            where l.workspace_id = ${workspaceId}::uuid
              and l.created_at > now() - make_interval(days => ${days * 2}::int)
              and l.created_at <= now() - make_interval(days => ${days}::int)
              ${withinLeadRetention(tx)}
            group by 1, 2
          ) x
        ), '[]'::json) as previous_leads,
        coalesce((
          select json_agg(json_build_object(
            'touchpoint_id', p.touchpoint_id, 'revision', p.revision,
            'experience_id', e.id, 'name', e.name, 'type', e.type
          ))
          from kardo_core.publications p
          join kardo_core.touchpoints t on t.id = p.touchpoint_id
          join kardo_core.experience_versions ev on ev.id = p.experience_version_id
          join kardo_core.experiences e on e.id = ev.experience_id
          where t.workspace_id = ${workspaceId}::uuid
            and e.workspace_id = ${workspaceId}::uuid
            -- Live now, or superseded after the window opened (one day of
            -- margin for events recorded right around a switch).
            and (
              (p.status = 'published' and p.superseded_at is null)
              or p.superseded_at > now() - make_interval(days => ${days + 1}::int)
            )
        ), '[]'::json) as publications
    `,
  );
  const row = rows[0];
  if (!row) throw new WorkspaceAccessError();
  return row;
}

/** Fallback for the rare `(Touchpoint, revision)` pair seen in the data but
 * not among the publications live during the window (clock skew around a
 * switch, very old revisions). */
async function resolvePublications(
  sql: Sql,
  identity: CustomerIdentity,
  workspaceId: string,
  pairs: readonly { touchpointId: string; revision: number }[],
): Promise<PublicationRow[]> {
  if (pairs.length === 0) return [];
  return withCustomerContext(
    sql,
    identity,
    (tx) => tx<PublicationRow[]>`
      select v.touchpoint_id, v.revision, e.id as experience_id, e.name, e.type
      from unnest(
        ${pairs.map((pair) => pair.touchpointId)}::uuid[],
        ${pairs.map((pair) => pair.revision)}::int[]
      ) as v(touchpoint_id, revision)
      join kardo_core.publications p
        on p.touchpoint_id = v.touchpoint_id and p.revision = v.revision
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      join kardo_core.experiences e on e.id = ev.experience_id
      where e.workspace_id = ${workspaceId}::uuid
    `,
  );
}

export function createPostgresAnalyticsRepository(
  sql: Sql,
  analyticsEngine: AnalyticsEngineClient | null,
  dataset: string,
  environment: string,
  options?: { engineCache?: EngineSummaryCache },
): AnalyticsRepository {
  const engineCache = options?.engineCache ?? createEngineSummaryCache();
  const hints: TouchpointHintCache = new Map();

  function engineRead(days: AnalyticsDays, publicIds: readonly string[]) {
    if (!analyticsEngine) return null;
    return fetchEngineSummary({
      client: analyticsEngine,
      cache: engineCache,
      dataset,
      environment,
      days,
      publicIds,
    });
  }

  function rememberTouchpoints(
    key: string,
    touchpoints: readonly WorkspaceTouchpointRow[],
  ) {
    hints.delete(key);
    if (touchpoints.length > HINT_MAX_TOUCHPOINTS) return;
    hints.set(key, {
      at: Date.now(),
      touchpoints: touchpoints.map(
        ({ id, public_id, group_id, group_path }) => ({
          id,
          public_id,
          group_id,
          group_path: group_path ?? null,
        }),
      ),
    });
    while (hints.size > HINT_MAX_ENTRIES) {
      const oldest = hints.keys().next().value;
      if (oldest === undefined) break;
      hints.delete(oldest);
    }
  }

  return {
    async getSummary(identity, workspaceId, query) {
      // Start the Analytics Engine read in parallel with Postgres when an
      // earlier authorized request told us which Touchpoints this workspace
      // has. The answer is only used after the membership check below passes
      // and only if the Touchpoint set still matches; otherwise it is ignored.
      // Keyed by person and workspace: only someone already authorized for
      // this workspace can start the early read, so a stranger who knows the
      // workspace id cannot make Kardo query Cloudflare (security review
      // 2026-10).
      const hintKey = `${identity.subject}:${workspaceId}`;
      const hint = hints.get(hintKey);
      const hintedIds =
        hint && Date.now() - hint.at < HINT_TTL_MS
          ? selectTouchpoints(hint.touchpoints, query).map(
              (row) => row.public_id,
            )
          : null;
      const early =
        hintedIds && hintedIds.length > 0
          ? engineRead(query.days, hintedIds)
          : null;
      // Never let an early read that ends up unused surface as unhandled.
      early?.catch(() => undefined);

      const db = await readWorkspaceAnalytics(
        sql,
        identity,
        workspaceId,
        query.days,
      );
      if (!db.role) throw new WorkspaceAccessError();
      requirePermission(db.role, "analytics.read");
      rememberTouchpoints(hintKey, db.touchpoints);

      if (
        query.touchpointId &&
        !db.touchpoints.some((row) => row.id === query.touchpointId)
      ) {
        throw new NotFoundError("Touchpoint was not found.");
      }
      if (
        !query.touchpointId &&
        query.groupId &&
        !db.groups.some((group) => group.id === query.groupId)
      ) {
        throw new NotFoundError("Group was not found.");
      }
      const selected = selectTouchpoints(db.touchpoints, query);
      const selectedIds = new Set(selected.map((row) => row.id));
      const selectedPublicIds = selected.map((row) => row.public_id);

      let source: AnalyticsSummary["source"] = "unavailable";
      let engine: EngineSummary | null = null;
      if (analyticsEngine && selected.length > 0) {
        const sameSet =
          hintedIds !== null &&
          engineSummaryKey({
            dataset,
            environment,
            days: query.days,
            publicIds: hintedIds,
          }) ===
            engineSummaryKey({
              dataset,
              environment,
              days: query.days,
              publicIds: selectedPublicIds,
            });
        try {
          const pending =
            (sameSet ? early : null) ??
            engineRead(query.days, selectedPublicIds);
          engine = pending ? await pending : null;
          source = "analytics_engine";
        } catch {
          // Analytics Engine did not answer usefully within the timeout, or
          // rejected the query. Fail open: the panel still renders, with
          // Tap/click metrics zeroed and `source: "unavailable"` telling the
          // customer why. Leads (Postgres-backed, independent of Analytics
          // Engine) remain accurate regardless.
          source = "unavailable";
        }
      } else if (analyticsEngine) {
        source = "analytics_engine";
      }

      const periodHourly = engine?.aggregates.periodHourly ?? new Map();
      const hourly = engine?.aggregates.hourly ?? new Map<string, number>();
      const perTouchpoint = engine?.aggregates.perTouchpoint ?? new Map();
      const totals = engine?.aggregates.totals ?? {
        taps: 0,
        clicks: 0,
        channels: emptyChannelCounts(),
        clickChannels: emptyChannelCounts(),
      };
      const previousEngine = engine?.previous ?? null;
      const revisionTotals = engine?.aggregates.revisions ?? [];

      // Leads, restricted to the selection (Postgres already scoped them to
      // the workspace through RLS and the where clause).
      const leadRows = db.leads.filter((row) =>
        selectedIds.has(row.touchpoint_id),
      );
      const leadsByTouchpoint = new Map<string, number>();
      let leadTotal = 0;
      for (const row of leadRows) {
        leadsByTouchpoint.set(
          row.touchpoint_id,
          (leadsByTouchpoint.get(row.touchpoint_id) ?? 0) + row.count,
        );
        leadTotal += row.count;
      }
      const previousLeadRows = db.previous_leads.filter((row) =>
        selectedIds.has(row.touchpoint_id),
      );
      const previousLeads = previousLeadRows.reduce(
        (sum, row) => sum + row.count,
        0,
      );

      const now = new Date();
      const timeZone = query.timeZone;

      // `daily` and `weekdayHour` both re-bucket the same UTC-hour data into
      // the requested time zone — Analytics Engine only ever aggregates in
      // UTC, so this reprojection happens here, in Node, once per request.
      const dailyByLocalDate = new Map<
        string,
        { taps: number; clicks: number; leads: number; channels: ChannelCounts }
      >();
      const dayBucket = (dateKey: string) => {
        const existing = dailyByLocalDate.get(dateKey);
        if (existing) return existing;
        const created = {
          taps: 0,
          clicks: 0,
          leads: 0,
          channels: emptyChannelCounts(),
        };
        dailyByLocalDate.set(dateKey, created);
        return created;
      };
      const weekdayHourMatrix: number[][] = Array.from({ length: 7 }, () =>
        Array<number>(24).fill(0),
      );
      for (const [hourKey, bucket] of periodHourly) {
        const parsed = new Date(hourKey);
        if (Number.isNaN(parsed.getTime())) continue;
        const { dateKey, weekday, hour } = localHourParts(parsed, timeZone);
        const existing = dayBucket(dateKey);
        existing.taps += bucket.taps;
        existing.clicks += bucket.clicks;
        existing.channels.nfc += bucket.channels.nfc;
        existing.channels.qr += bucket.channels.qr;
        existing.channels.link += bucket.channels.link;
        const weekdayRow = weekdayHourMatrix[weekday];
        if (weekdayRow) {
          weekdayRow[hour] = (weekdayRow[hour] ?? 0) + bucket.taps;
        }
      }
      for (const row of leadRows) {
        const parsed = new Date(Number(row.hour) * 1000);
        if (Number.isNaN(parsed.getTime())) continue;
        dayBucket(localHourParts(parsed, timeZone).dateKey).leads += row.count;
      }

      const todayKey = localHourParts(now, timeZone).dateKey;
      const dailyList: AnalyticsSummary["daily"] = [];
      for (let offset = query.days - 1; offset >= 0; offset -= 1) {
        const dateKey = shiftDateKey(todayKey, -offset);
        const bucket = dailyByLocalDate.get(dateKey);
        dailyList.push({
          date: dateKey,
          taps: bucket?.taps ?? 0,
          clicks: bucket?.clicks ?? 0,
          leads: bucket?.leads ?? 0,
          channels: bucket?.channels ?? emptyChannelCounts(),
        });
      }

      // The previous period, re-bucketed the same way and aligned with
      // `daily`: previousDaily[i] is `days` days before daily[i].
      const previousByDate = new Map<
        string,
        { taps: number; clicks: number; leads: number }
      >();
      const previousBucket = (dateKey: string) => {
        const existing = previousByDate.get(dateKey);
        if (existing) return existing;
        const created = { taps: 0, clicks: 0, leads: 0 };
        previousByDate.set(dateKey, created);
        return created;
      };
      const hoursOfDay = Array<number>(24).fill(0);
      for (const row of weekdayHourMatrix) {
        row.forEach((value, hour) => {
          hoursOfDay[hour] = (hoursOfDay[hour] ?? 0) + value;
        });
      }
      const previousHoursOfDay = previousEngine
        ? Array<number>(24).fill(0)
        : null;
      for (const [hourKey, bucket] of previousEngine?.periodHourly ?? []) {
        const parsed = new Date(hourKey);
        if (Number.isNaN(parsed.getTime())) continue;
        const { dateKey, hour } = localHourParts(parsed, timeZone);
        const day = previousBucket(dateKey);
        day.taps += bucket.taps;
        day.clicks += bucket.clicks;
        if (previousHoursOfDay)
          previousHoursOfDay[hour] =
            (previousHoursOfDay[hour] ?? 0) + bucket.taps;
      }
      for (const row of previousLeadRows) {
        const parsed = new Date(Number(row.hour) * 1000);
        if (Number.isNaN(parsed.getTime())) continue;
        previousBucket(localHourParts(parsed, timeZone).dateKey).leads +=
          row.count;
      }
      const previousDaily: NonNullable<AnalyticsSummary["previousDaily"]> =
        dailyList.map((day) => {
          const date = shiftDateKey(day.date, -query.days);
          const bucket = previousByDate.get(date);
          return {
            date,
            taps: bucket?.taps ?? 0,
            clicks: bucket?.clicks ?? 0,
            leads: bucket?.leads ?? 0,
          };
        });

      // «QR y etiquetas activos» and reach count physical objects only
      // (A9-24): a Link is a different product and is never one of them,
      // even though it shares the same `touchpoints` table and status.
      const physicalSelected = selected.filter((row) => row.kind !== "link");
      const activeSelected = physicalSelected.filter(
        (row) => row.status === "active",
      );
      const reached = activeSelected.filter(
        (row) => (perTouchpoint.get(row.public_id)?.taps ?? 0) > 0,
      ).length;
      const kpis = buildKpis({
        days: query.days,
        current: {
          taps: totals.taps,
          clicks: totals.clicks,
          leads: leadTotal,
          channels: totals.channels,
        },
        previous: previousEngine
          ? {
              taps: previousEngine.taps,
              clicks: previousEngine.clicks,
              leads: previousLeads,
              channels: previousEngine.channels,
            }
          : null,
        previousLeads,
        daily: dailyList,
        hoursOfDay,
        previousHoursOfDay,
        touchpoints: {
          active: activeSelected.length,
          total: physicalSelected.filter((row) => row.status !== "retired")
            .length,
        },
        reached,
        // Reach in the previous period is measured against today's active
        // Touchpoints (the set a customer can act on).
        previousReached: previousEngine
          ? activeSelected.filter((row) =>
              previousEngine.tappedPublicIds.has(row.public_id),
            ).length
          : null,
      });

      const hourlyList: AnalyticsSummary["hourly"] = [];
      const currentHour = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
      );
      for (let offset = 23; offset >= 0; offset -= 1) {
        const key = new Date(currentHour - offset * 3_600_000).toISOString();
        hourlyList.push({ hour: key, taps: hourly.get(key) ?? 0 });
      }

      // A9-23: ordered by accesses (taps desc, ties by name) before the cut,
      // never by creation date — the ones a large workspace most needs to
      // see are never the ones silently dropped. `touchpointsOmitted` tells
      // the panel how many were left out, so it never reads them as zero.
      const TOUCHPOINTS_LIST_LIMIT = 1_000;
      const touchpointsByTaps = [...selected].sort((a, b) => {
        const tapsA = perTouchpoint.get(a.public_id)?.taps ?? 0;
        const tapsB = perTouchpoint.get(b.public_id)?.taps ?? 0;
        return tapsB - tapsA || a.name.localeCompare(b.name, "es");
      });
      const touchpointsOmitted = Math.max(
        0,
        touchpointsByTaps.length - TOUCHPOINTS_LIST_LIMIT,
      );
      const touchpointsList: AnalyticsSummary["touchpoints"] = touchpointsByTaps
        .slice(0, TOUCHPOINTS_LIST_LIMIT)
        .map((row) => {
          const aggregate = perTouchpoint.get(row.public_id);
          return {
            touchpointId: row.id,
            name: row.name,
            kind: row.kind,
            ...(row.piece_model ? { pieceModel: row.piece_model } : {}),
            taps: aggregate?.taps ?? 0,
            clicks: aggregate?.clicks ?? 0,
            leads: leadsByTouchpoint.get(row.id) ?? 0,
            channels: aggregate?.channels ?? emptyChannelCounts(),
          };
        });

      // A9-26: every group, including those with zero visits — the panel
      // used to recompute this same tree itself (`group-totals.ts`) because
      // this list dropped the zeros; now it reads this one directly. Each
      // group already sums its whole subtree (`inGroupTree`), matching what
      // the panel's tree used to add up by walking ancestors.
      const GROUPS_LIST_LIMIT = 200;
      const groupTotalsById = new Map(
        db.groups.map((group) => {
          let taps = 0;
          let clicks = 0;
          let leads = 0;
          for (const row of selected) {
            if (!inGroupTree(row, group.id)) continue;
            const aggregate = perTouchpoint.get(row.public_id);
            taps += aggregate?.taps ?? 0;
            clicks += aggregate?.clicks ?? 0;
            leads += leadsByTouchpoint.get(row.id) ?? 0;
          }
          return [group.id, { taps, clicks, leads }] as const;
        }),
      );
      const groupChildren = (parentId: string | null) =>
        db.groups
          .filter((group) => (group.parent_id ?? null) === parentId)
          .sort(
            (a, b) =>
              (groupTotalsById.get(b.id)?.taps ?? 0) -
                (groupTotalsById.get(a.id)?.taps ?? 0) ||
              a.name.localeCompare(b.name, "es"),
          );
      const groupsList: AnalyticsSummary["groups"] = [];
      const visitGroups = (parentId: string | null, depth: number) => {
        for (const group of groupChildren(parentId)) {
          const totals = groupTotalsById.get(group.id) ?? {
            taps: 0,
            clicks: 0,
            leads: 0,
          };
          groupsList.push({
            groupId: group.id,
            name: group.name,
            depth,
            ...totals,
          });
          // Groups nest at most 8 deep in the panel (group-tree.ts); the
          // same cap keeps this walk bounded regardless of the data.
          if (depth < 8) visitGroups(group.id, depth + 1);
        }
      };
      visitGroups(null, 0);
      const groupsListCapped = groupsList.slice(0, GROUPS_LIST_LIMIT);

      const experiencesList = await resolveExperienceBreakdown(
        sql,
        identity,
        workspaceId,
        {
          touchpoints: selected,
          revisionTotals,
          leadRows,
          publications: db.publications,
        },
      );

      return {
        source,
        days: query.days,
        generatedAt: now.toISOString(),
        timezone: timeZone,
        activeTouchpoints: activeSelected.length,
        previous: {
          taps: previousEngine?.taps ?? 0,
          clicks: previousEngine?.clicks ?? 0,
          leads: previousLeads,
          channels: previousEngine?.channels ?? emptyChannelCounts(),
        },
        previousDaily,
        kpis,
        weekdayHour: weekdayHourMatrix,
        experiences: experiencesList,
        groups: groupsListCapped,
        totals: {
          taps: totals.taps,
          clicks: totals.clicks,
          leads: leadTotal,
          channels: totals.channels,
          clickChannels: totals.clickChannels,
        },
        daily: dailyList,
        hourly: hourlyList,
        touchpoints: touchpointsList,
        touchpointsOmitted,
      };
    },
  };
}

type ExperienceBreakdownEntry = {
  experienceId: string;
  name: string;
  type: ExperienceType;
  taps: number;
  clicks: number;
  leads: number;
};

/** Resolves every `(Touchpoint, publication revision)` pair seen in either
 * the Analytics Engine tap/click totals or the Postgres lead counts back to
 * the Experience that revision actually published, and aggregates
 * taps/clicks/leads per Experience. Pairs outside the publications already
 * read are looked up once; a revision with no matching publication row is
 * silently dropped. */
async function resolveExperienceBreakdown(
  sql: Sql,
  identity: CustomerIdentity,
  workspaceId: string,
  input: {
    touchpoints: readonly WorkspaceTouchpointRow[];
    revisionTotals: readonly RevisionTotal[];
    leadRows: readonly LeadHourRow[];
    publications: readonly PublicationRow[];
  },
): Promise<ExperienceBreakdownEntry[]> {
  const byPublicId = new Map(
    input.touchpoints.map((row) => [row.public_id, row.id] as const),
  );
  const pairKey = (touchpointId: string, revision: number) =>
    `${touchpointId}:${revision}`;
  const pairs = new Map<string, { touchpointId: string; revision: number }>();
  const tapsByPair = new Map<string, number>();
  const clicksByPair = new Map<string, number>();
  const leadsByPair = new Map<string, number>();

  for (const row of input.revisionTotals) {
    const touchpointId = byPublicId.get(row.publicId);
    if (!touchpointId) continue;
    const key = pairKey(touchpointId, row.revision);
    pairs.set(key, { touchpointId, revision: row.revision });
    tapsByPair.set(key, (tapsByPair.get(key) ?? 0) + row.taps);
    clicksByPair.set(key, (clicksByPair.get(key) ?? 0) + row.clicks);
  }
  for (const row of input.leadRows) {
    const key = pairKey(row.touchpoint_id, row.revision);
    pairs.set(key, { touchpointId: row.touchpoint_id, revision: row.revision });
    leadsByPair.set(key, (leadsByPair.get(key) ?? 0) + row.count);
  }
  if (pairs.size === 0) return [];

  const publicationByPair = new Map(
    input.publications.map(
      (row) => [pairKey(row.touchpoint_id, row.revision), row] as const,
    ),
  );
  const missing = [...pairs.entries()]
    .filter(([key]) => !publicationByPair.has(key))
    .map(([, pair]) => pair);
  for (const row of await resolvePublications(
    sql,
    identity,
    workspaceId,
    missing,
  )) {
    publicationByPair.set(pairKey(row.touchpoint_id, row.revision), row);
  }

  const byExperience = new Map<string, ExperienceBreakdownEntry>();
  for (const key of pairs.keys()) {
    const publication = publicationByPair.get(key);
    if (!publication) continue;
    const existing = byExperience.get(publication.experience_id) ?? {
      experienceId: publication.experience_id,
      name: publication.name,
      type: publication.type,
      taps: 0,
      clicks: 0,
      leads: 0,
    };
    existing.taps += tapsByPair.get(key) ?? 0;
    existing.clicks += clicksByPair.get(key) ?? 0;
    existing.leads += leadsByPair.get(key) ?? 0;
    byExperience.set(publication.experience_id, existing);
  }

  return [...byExperience.values()]
    .filter((entry) => entry.taps > 0 || entry.clicks > 0 || entry.leads > 0)
    .sort((a, b) => b.taps + b.clicks + b.leads - (a.taps + a.clicks + a.leads))
    .slice(0, 200);
}
