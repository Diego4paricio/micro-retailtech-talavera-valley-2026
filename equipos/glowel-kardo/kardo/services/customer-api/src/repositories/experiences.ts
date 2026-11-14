import { randomUUID } from "node:crypto";
import {
  type ArchiveExperienceResult,
  type CreateExperience,
  type CustomHtml,
  designHtmlBlocks,
  type Experience,
  type ExperienceContent,
  type ExperienceDetail,
  type ExperiencePublicationState,
  type ExperienceSummary,
  type ExperienceTargetStatus,
  type ExperienceTargets,
  type ExperienceType,
  type ExperienceVersion,
  imageMediaTypes,
  type PageDesign,
  type PublicationBatch,
  type PublicationStatus,
  type PublishIntentOptions,
  type UpdateExperience,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertFeature } from "../billing/entitlements.js";
import {
  ConflictError,
  ContentValidationError,
  NotFoundError,
} from "../errors.js";
import { translatePublicationFailureReason } from "../publication-failure.js";
import {
  type AssetReference,
  getCustomHtml,
  getDesign,
  validateExperienceContent,
} from "../validation/experience-content.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  requirePermission,
  withCustomerContext,
} from "./context.js";
import { reachedTouchpoints } from "./group-tree.js";
import {
  fallBackToGroupExperience,
  touchpointsServing,
} from "./propagation.js";

// postgres.js serializes jsonb parameters itself: pass objects, never
// pre-stringified JSON (that stores a JSON *string* instead of an object).
type JsonValue = Parameters<Sql["json"]>[0];

const PUBLISHABLE_TOUCHPOINT_STATUSES = [
  "assigned",
  "active",
  "paused",
] as const;
/** `PublicationBatchSchema.publications` is capped at 500 entries. */
const MAX_PUBLICATION_TARGETS = 500;

export type ExperienceRepository = {
  listExperiences(
    identity: CustomerIdentity,
    workspaceId: string,
    options?: { archived?: boolean },
  ): Promise<readonly ExperienceSummary[]>;
  /** One version with its content (domain audit A2-30: the detail lists
   * most versions without it). */
  getExperienceVersion(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    versionId: string,
  ): Promise<ExperienceVersion>;
  /** Only the publication-derived fields of the active Experiences, for
   * the panel to poll while something publishes (domain audit A2-30). */
  listPublicationStates(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<ExperiencePublicationState[]>;
  getExperienceDetail(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<ExperienceDetail>;
  createExperience(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateExperience,
  ): Promise<Experience>;
  updateExperience(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    input: UpdateExperience,
  ): Promise<Experience>;
  setExperienceTargets(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    targets: ExperienceTargets,
  ): Promise<Experience>;
  restoreExperienceVersion(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    versionId: string,
  ): Promise<ExperienceDetail>;
  createPublicationIntent(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    idempotencyKey: string,
    options?: PublishIntentOptions | undefined,
  ): Promise<PublicationBatch>;
  createRollbackPublicationIntent(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    versionId: string,
    idempotencyKey: string,
    options?: PublishIntentOptions | undefined,
  ): Promise<PublicationBatch>;
  archiveExperience(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<ArchiveExperienceResult>;
  unarchiveExperience(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<Experience>;
  duplicateExperience(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    name: string | undefined,
  ): Promise<Experience>;
};

export class ExperienceRepositoryError extends Error {}

export function unavailableExperienceRepository(): ExperienceRepository {
  const unavailable = () =>
    Promise.reject(
      new ExperienceRepositoryError("Experience storage is not configured."),
    );
  return {
    listExperiences: unavailable,
    listPublicationStates: unavailable,
    getExperienceVersion: unavailable,
    getExperienceDetail: unavailable,
    createExperience: unavailable,
    updateExperience: unavailable,
    setExperienceTargets: unavailable,
    restoreExperienceVersion: unavailable,
    createPublicationIntent: unavailable,
    createRollbackPublicationIntent: unavailable,
    archiveExperience: unavailable,
    unarchiveExperience: unavailable,
    duplicateExperience: unavailable,
  };
}

type ExperienceSummaryRow = {
  id: string;
  touchpoint_id: string | null;
  name: string;
  type: ExperienceType;
  draft_content: unknown;
  updated_at: string;
  draft_revision: number;
  publication_status: PublicationStatus;
  has_unpublished_changes: boolean;
  live_revision: number | null;
  target_touchpoint_ids: string[];
  target_group_ids: string[];
  live_touchpoint_count: number;
  archived_at: string | null;
};

/** A composable fragment (per postgres.js's documented dynamic-query
 * pattern: an un-awaited `sql\`...\`` call, used only as a substitution
 * inside another `sql\`...\`` call) shared by every query that needs one
 * Experience's publication-derived summary columns.
 *
 * `publication_status` is now an aggregate over every currently-targeted
 * Touchpoint's *own* most recent publication of this Experience (groups
 * expanded): `processing` if any is pending/processing, else `failed` if any
 * failed, else `published` if any is published, else `draft`. */
function experienceSummaryColumns(tx: Sql) {
  return tx`
    e.id, e.touchpoint_id, e.name, e.type, e.draft_content, e.updated_at, e.archived_at,
    e.draft_revision,
    live_count.total as live_touchpoint_count,
    coalesce(latest_pub.status::text, 'draft') as publication_status,
    (
      latest_version.content is null
      or latest_version.content is distinct from e.draft_content
      or direct_unserved.any
    ) as has_unpublished_changes,
    live.revision as live_revision,
    targets_agg.touchpoint_ids as target_touchpoint_ids,
    targets_agg.group_ids as target_group_ids
  `;
}

/** Shared FROM/JOIN clause for `experienceSummaryColumns`, keyed off `e`. */
function experienceSummaryJoins(tx: Sql) {
  return tx`
    left join lateral (
      -- The draft is compared with the version live on its Touchpoints
      -- (the newest one when several are), else with the newest version:
      -- after going back to version 2 with a version 3 saved, the list
      -- used to say «coincide» while version 2 was live (domain audit
      -- A2-23).
      select ev.content
      from kardo_core.experience_versions ev
      where ev.experience_id = e.id
      order by exists (
          select 1
          from kardo_core.publications pl
          join kardo_core.touchpoints tl
            on tl.id = pl.touchpoint_id and tl.status <> 'retired'
          where pl.experience_version_id = ev.id
            and pl.status = 'published' and pl.superseded_at is null
        ) desc, ev.revision desc
      limit 1
    ) latest_version on true
    left join lateral (
      -- A Touchpoint targeted directly (a direct target always wins) that
      -- does not show this Experience yet: publishing is still pending
      -- there, even when the content did not change (A2-23).
      select exists (
        select 1
        from kardo_core.experience_targets et5
        join kardo_core.touchpoints t5
          on t5.id = et5.touchpoint_id and t5.status <> 'retired'
        where et5.experience_id = e.id
          and not exists (
            select 1
            from kardo_core.publications p5
            join kardo_core.experience_versions ev5
              on ev5.id = p5.experience_version_id
            where p5.touchpoint_id = et5.touchpoint_id
              and ev5.experience_id = e.id
              and p5.status in ('pending', 'processing', 'published')
              and p5.superseded_at is null
          )
      ) as any
    ) direct_unserved on true
    left join lateral (
      select coalesce(array_agg(distinct t.id), '{}'::uuid[]) as touchpoint_ids
      from kardo_core.experience_targets et
      ${reachedTouchpoints(tx)}
      where et.experience_id = e.id and t.status <> 'retired'
    ) resolved_targets on true
    left join lateral (
      select
        case
          when count(*) filter (where p.status in ('pending', 'processing')) > 0 then 'processing'
          when count(*) filter (where p.status = 'failed') > 0 then 'failed'
          when count(*) filter (where p.status = 'published') > 0 then 'published'
          else null
        end as status
      from unnest(resolved_targets.touchpoint_ids) as target(touchpoint_id)
      left join lateral (
        select p2.status
        from kardo_core.experience_versions ev2
        join kardo_core.publications p2 on p2.experience_version_id = ev2.id
        where ev2.experience_id = e.id and p2.touchpoint_id = target.touchpoint_id
        order by p2.created_at desc
        limit 1
      ) p on true
    ) latest_pub on true
    left join lateral (
      select ev3.revision
      from kardo_core.publications p3
      join kardo_core.experience_versions ev3 on ev3.id = p3.experience_version_id
      where e.touchpoint_id is not null
        and p3.touchpoint_id = e.touchpoint_id
        and p3.status = 'published'
        and p3.superseded_at is null
        and ev3.experience_id = e.id
      limit 1
    ) live on true
    left join lateral (
      select count(*)::int as total
      from kardo_core.publications p4
      join kardo_core.experience_versions ev4 on ev4.id = p4.experience_version_id
      join kardo_core.touchpoints t4 on t4.id = p4.touchpoint_id and t4.status <> 'retired'
      where ev4.experience_id = e.id and p4.status = 'published' and p4.superseded_at is null
    ) live_count on true
    left join lateral (
      select
        coalesce(array_agg(et.touchpoint_id) filter (where et.touchpoint_id is not null), '{}'::uuid[]) as touchpoint_ids,
        coalesce(array_agg(et.group_id) filter (where et.group_id is not null), '{}'::uuid[]) as group_ids
      from kardo_core.experience_targets et
      where et.experience_id = e.id
    ) targets_agg on true
  `;
}

async function fetchExperienceSummaryRow(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
): Promise<ExperienceSummaryRow | undefined> {
  const rows = await tx<ExperienceSummaryRow[]>`
    select ${experienceSummaryColumns(tx)}
    from kardo_core.experiences e
    ${experienceSummaryJoins(tx)}
    where e.id = ${experienceId}::uuid and e.workspace_id = ${workspaceId}::uuid
  `;
  return rows[0];
}

/** A publication row's status is never `"draft"` — that value only ever
 * describes an Experience with no publication at all. */
type PublicationRowStatus = Exclude<PublicationStatus, "draft">;

type VersionRow = {
  id: string;
  revision: number;
  created_at: string;
  content: unknown;
  publication_id: string | null;
  publication_revision: number | null;
  publication_status: PublicationRowStatus | null;
  publication_created_at: string | null;
  published_at: string | null;
  last_error: string | null;
  live_touchpoint_count: number;
  failed_touchpoint_count: number;
};

/** Every version of the Experience, also past the 50 listed (A2-24). */
async function countExperienceVersions(
  tx: Sql,
  experienceId: string,
): Promise<number> {
  const [row] = await tx<{ total: number }[]>`
    select count(*)::int as total from kardo_core.experience_versions
    where experience_id = ${experienceId}::uuid
  `;
  return row?.total ?? 0;
}

async function fetchExperienceVersions(
  tx: Sql,
  experienceId: string,
  options: { versionId?: string } = {},
): Promise<VersionRow[]> {
  // Domain audit A2-30: in the list only the newest version and the live
  // ones bring their content (each can weigh 256 KiB); one version asked by
  // id always does.
  const withContent = options.versionId
    ? tx`ev.content`
    : tx`case
        when ev.revision = (
          select max(evm.revision) from kardo_core.experience_versions evm
          where evm.experience_id = ev.experience_id
        )
        or exists (
          select 1 from kardo_core.publications pc
          where pc.experience_version_id = ev.id
            and pc.status = 'published' and pc.superseded_at is null
        )
        then ev.content
      end`;
  return tx<VersionRow[]>`
    select ev.id, ev.revision, ev.created_at, ${withContent} as content,
           pub.id as publication_id, pub.revision as publication_revision,
           pub.status as publication_status, pub.created_at as publication_created_at,
           pub.published_at, job.last_error,
           -- Per version, across every target (domain audit A2-24): one
           -- version can be live on some Touchpoints and failed on others.
           (
             select count(distinct pl.touchpoint_id)::int
             from kardo_core.publications pl
             join kardo_core.touchpoints tl
               on tl.id = pl.touchpoint_id and tl.status <> 'retired'
             where pl.experience_version_id = ev.id
               and pl.status = 'published' and pl.superseded_at is null
           ) as live_touchpoint_count,
           (
             select count(*)::int
             from (
               select distinct on (pf.touchpoint_id)
                 pf.experience_version_id, pf.status
               from kardo_core.publications pf
               join kardo_core.experience_versions evf
                 on evf.id = pf.experience_version_id
               where evf.experience_id = ev.experience_id
               order by pf.touchpoint_id, pf.created_at desc
             ) latest_attempt
             where latest_attempt.experience_version_id = ev.id
               and latest_attempt.status = 'failed'
           ) as failed_touchpoint_count
    from kardo_core.experience_versions ev
    left join lateral (
      select p.id, p.revision, p.status, p.created_at, p.published_at
      from kardo_core.publications p
      where p.experience_version_id = ev.id
      order by p.created_at desc
      limit 1
    ) pub on true
    left join lateral (
      select pj.last_error
      from kardo_core.publication_jobs pj
      where pj.publication_id = pub.id
      order by pj.updated_at desc
      limit 1
    ) job on true
    where ev.experience_id = ${experienceId}::uuid
      ${options.versionId ? tx`and ev.id = ${options.versionId}::uuid` : tx``}
    order by ev.revision desc
    limit 50
  `;
}

type TargetStatusRow = {
  touchpoint_id: string;
  touchpoint_name: string;
  group_id: string | null;
  distance: number;
  status: PublicationStatus;
  is_live: boolean;
  live_experience_name: string | null;
  direct: boolean;
  overridden: boolean;
};

/** Every Touchpoint this Experience currently targets (groups expanded, one
 * row each — a Touchpoint reachable both directly and via a targeted group
 * still appears once), with this Experience's own publication status on
 * that Touchpoint, and whether that Touchpoint's *currently live*
 * publication (if any) belongs to this Experience or a different one. */
async function fetchExperienceTargetStatuses(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
): Promise<TargetStatusRow[]> {
  return tx<TargetStatusRow[]>`
    with resolved as (
      select t.id as touchpoint_id, t.operational_name as touchpoint_name, t.group_id,
             coalesce(bool_or(reach.distance = 0), false) as direct,
             min(reach.distance)::int as distance,
             coalesce(tg.path, '{}'::uuid[]) as path
      from kardo_core.experience_targets et
      ${reachedTouchpoints(tx)}
      left join kardo_core.touchpoint_groups tg on tg.id = t.group_id
      where et.experience_id = ${experienceId}::uuid and t.workspace_id = ${workspaceId}::uuid
        and t.status <> 'retired'
      group by t.id, t.operational_name, t.group_id, tg.path
    )
    select
      r.touchpoint_id, r.touchpoint_name, r.group_id, r.direct, r.distance,
      coalesce(own_pub.status::text, 'draft') as status,
      coalesce(live.experience_id = ${experienceId}::uuid, false) as is_live,
      case
        when live.experience_id is not null and live.experience_id <> ${experienceId}::uuid
        then live_exp.name
        else null
      end as live_experience_name,
      -- The closest wins (ADR 021): another live Experience that reaches this
      -- Touchpoint from closer (directly, or through a nearer group) keeps it.
      coalesce((
        live.experience_id is not null
        and live.experience_id <> ${experienceId}::uuid
        and live_exp.archived_at is null
        and (
          select min(case when lt.touchpoint_id = r.touchpoint_id then 0
                     else cardinality(r.path) - array_position(r.path, lt.group_id) + 1 end)
          from kardo_core.experience_targets lt
          where lt.experience_id = live.experience_id
            and (lt.touchpoint_id = r.touchpoint_id or lt.group_id = any(r.path))
        ) < r.distance
      ), false) as overridden
    from resolved r
    left join lateral (
      select p.status
      from kardo_core.experience_versions ev
      join kardo_core.publications p on p.experience_version_id = ev.id
      where ev.experience_id = ${experienceId}::uuid and p.touchpoint_id = r.touchpoint_id
      order by p.created_at desc
      limit 1
    ) own_pub on true
    left join lateral (
      select ev2.experience_id
      from kardo_core.publications p2
      join kardo_core.experience_versions ev2 on ev2.id = p2.experience_version_id
      where p2.touchpoint_id = r.touchpoint_id and p2.status = 'published' and p2.superseded_at is null
      limit 1
    ) live on true
    left join kardo_core.experiences live_exp on live_exp.id = live.experience_id
    order by r.touchpoint_name asc
    limit ${MAX_PUBLICATION_TARGETS}
  `;
}

type ResolvedTouchpoint = {
  id: string;
  name: string;
  status: string;
  /** Targeted directly by this Experience (not only through a group). */
  direct: boolean;
  /** Name of another live Experience that reaches this Touchpoint from
   * closer (directly, or through a nearer group), which takes precedence
   * over this Experience (ADR 021: the closest wins). */
  overridden_by: string | null;
  /** Name of the Experience currently published on this Touchpoint when it is
   * a different one (regardless of precedence distance): publishing here would
   * replace it. Used to keep a publish from silently taking over another
   * page's destination without confirmation (round 4, B1). */
  occupied_by: string | null;
};

/** Every Touchpoint this Experience currently targets (groups expanded),
 * narrowed to publishable statuses (retired Touchpoints never receive
 * content), with how it is reached and whether a direct assignment of
 * another live Experience takes precedence over a group assignment. */
async function fetchResolvedTargetTouchpoints(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
  statusFilter?: readonly string[],
): Promise<ResolvedTouchpoint[]> {
  const statuses =
    statusFilter && statusFilter.length > 0
      ? [...statusFilter]
      : [...PUBLISHABLE_TOUCHPOINT_STATUSES];
  return tx<ResolvedTouchpoint[]>`
    select resolved.id, resolved.name, resolved.status, resolved.direct,
           closer_live.name as overridden_by,
           occupied.name as occupied_by
    from (
      select t.id, t.operational_name as name, t.status::text as status,
             coalesce(bool_or(reach.distance = 0), false) as direct,
             min(reach.distance)::int as distance,
             coalesce(tg.path, '{}'::uuid[]) as path
      from kardo_core.experience_targets et
      ${reachedTouchpoints(tx)}
      left join kardo_core.touchpoint_groups tg on tg.id = t.group_id
      where et.experience_id = ${experienceId}::uuid
        and t.workspace_id = ${workspaceId}::uuid
        and t.status::text = any(${statuses}::text[])
      group by t.id, t.operational_name, t.status, tg.path
    ) resolved
    left join lateral (
      -- The live Experience on this Touchpoint, if another one reaches it from
      -- closer (directly, or through a nearer group): the closest wins.
      select live_experience.name
      from kardo_core.publications p
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      join kardo_core.experiences live_experience
        on live_experience.id = ev.experience_id and live_experience.archived_at is null
      where p.touchpoint_id = resolved.id and p.status = 'published' and p.superseded_at is null
        and live_experience.id <> ${experienceId}::uuid
        and (
          select min(case when lt.touchpoint_id = resolved.id then 0
                     else cardinality(resolved.path) - array_position(resolved.path, lt.group_id) + 1 end)
          from kardo_core.experience_targets lt
          where lt.experience_id = live_experience.id
            and (lt.touchpoint_id = resolved.id or lt.group_id = any(resolved.path))
        ) < resolved.distance
      limit 1
    ) closer_live on true
    left join lateral (
      -- The Experience currently published on this Touchpoint, if it is a
      -- different one (any distance): publishing here would replace it.
      select live_experience.name
      from kardo_core.publications p
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      join kardo_core.experiences live_experience
        on live_experience.id = ev.experience_id and live_experience.archived_at is null
      where p.touchpoint_id = resolved.id and p.status = 'published' and p.superseded_at is null
        and live_experience.id <> ${experienceId}::uuid
      limit 1
    ) occupied on true
    order by resolved.name asc
    limit ${MAX_PUBLICATION_TARGETS}
  `;
}

/** Replaces an Experience's targets (Touchpoints and/or Groups), validating
 * every id belongs to the workspace. Unless `allowEmpty`, it requires at
 * least one *resolvable* Touchpoint target once groups are expanded (an
 * empty group, or an empty `targets` object entirely, both fail with
 * `TARGETS_REQUIRED`). A draft may have no targets yet: the panel designs
 * first and assigns Touchpoints when publishing, which still requires at
 * least one. Returns the
 * legacy `experiences.touchpoint_id` value it wrote (the first explicit
 * Touchpoint target, or `null` when the Experience is only targeted through
 * groups). */
async function writeExperienceTargets(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
  targets: { touchpointIds: readonly string[]; groupIds: readonly string[] },
  options: { allowEmpty: boolean } = { allowEmpty: false },
): Promise<string | null> {
  const touchpointIds = [...new Set(targets.touchpointIds)];
  const groupIds = [...new Set(targets.groupIds)];
  // Links redesign (owner, 2026-10-04): a Link is one more Touchpoint, so
  // any Experience goes on a Link, a QR or an NFC alike, and a link page
  // («Página de enlaces») is a normal type that also fits a QR. Links are
  // never grouped, so a group target never reaches them.
  if (touchpointIds.length > 0) {
    const found = await tx<{ id: string }[]>`
      select id from kardo_core.touchpoints
      where id = any(${touchpointIds}::uuid[]) and workspace_id = ${workspaceId}::uuid
        and status <> 'retired'
    `;
    if (found.length !== touchpointIds.length) {
      throw new NotFoundError("Touchpoint was not found.");
    }
  }
  if (groupIds.length > 0) {
    const found = await tx<{ id: string }[]>`
      select id from kardo_core.touchpoint_groups
      where id = any(${groupIds}::uuid[]) and workspace_id = ${workspaceId}::uuid
    `;
    if (found.length !== groupIds.length) {
      throw new NotFoundError("Group was not found.");
    }
  }

  await tx`delete from kardo_core.experience_targets where experience_id = ${experienceId}::uuid`;
  if (touchpointIds.length > 0) {
    await tx`
      insert into kardo_core.experience_targets (experience_id, workspace_id, touchpoint_id)
      select ${experienceId}::uuid, ${workspaceId}::uuid, unnest(${touchpointIds}::uuid[])
    `;
  }
  if (groupIds.length > 0) {
    await tx`
      insert into kardo_core.experience_targets (experience_id, workspace_id, group_id)
      select ${experienceId}::uuid, ${workspaceId}::uuid, unnest(${groupIds}::uuid[])
    `;
  }

  const resolved = await fetchResolvedTargetTouchpoints(
    tx,
    workspaceId,
    experienceId,
  );
  if (resolved.length === 0 && !options.allowEmpty) {
    throw new ContentValidationError(
      "TARGETS_REQUIRED",
      "Choose at least one Touchpoint or group to publish this Experience to.",
    );
  }

  const legacyTouchpointId = touchpointIds[0] ?? null;
  await tx`
    update kardo_core.experiences
    set touchpoint_id = ${legacyTouchpointId}
    where id = ${experienceId}::uuid
  `;
  return legacyTouchpointId;
}

type PublicationRequestContext = {
  workspaceId: string;
  experienceId: string;
  createdBy: string;
};

async function lookupPublicationRequest(
  tx: Sql,
  idempotencyKey: string,
): Promise<PublicationRequestContext | undefined> {
  const rows = await tx<
    { workspace_id: string; experience_id: string; created_by: string }[]
  >`
    select workspace_id, experience_id, created_by
    from kardo_core.publication_requests
    where idempotency_key = ${idempotencyKey}::uuid
  `;
  const row = rows[0];
  return row
    ? {
        workspaceId: row.workspace_id,
        experienceId: row.experience_id,
        createdBy: row.created_by,
      }
    : undefined;
}

async function fetchPublicationBatchByRequest(
  tx: Sql,
  idempotencyKey: string,
): Promise<PublicationBatch | undefined> {
  const request = await tx<{ experience_version_id: string }[]>`
    select experience_version_id
    from kardo_core.publication_requests
    where idempotency_key = ${idempotencyKey}::uuid
  `;
  const versionId = request[0]?.experience_version_id;
  if (!versionId) return undefined;
  const version = await tx<{ revision: number }[]>`
    select revision from kardo_core.experience_versions where id = ${versionId}::uuid
  `;
  const versionRevision = version[0]?.revision;
  if (versionRevision === undefined) return undefined;
  const publications = await tx<
    { touchpoint_id: string; id: string; revision: number }[]
  >`
    select touchpoint_id, id, revision
    from kardo_core.publications
    where request_idempotency_key = ${idempotencyKey}::uuid
    order by touchpoint_id asc
  `;
  return {
    versionId,
    versionRevision,
    publications: publications.map((row) => ({
      touchpointId: row.touchpoint_id,
      publicationId: row.id,
      revision: row.revision,
      status: "pending" as const,
    })),
  };
}

/** Inserts one `publications` + `publication_jobs` row per resolved
 * Touchpoint target, each with its own random `idempotency_key` (that
 * column is unique across the whole table) plus the shared
 * `request_idempotency_key` that ties every row in this batch together. */
async function insertPublicationBatch(
  tx: Sql,
  experienceVersionId: string,
  versionRevision: number,
  touchpoints: readonly ResolvedTouchpoint[],
  requestIdempotencyKey: string,
  createdBy: string,
): Promise<PublicationBatch> {
  const publications: PublicationBatch["publications"] = [];
  for (const touchpoint of touchpoints) {
    const rowIdempotencyKey = randomUUID();
    const inserted = await tx<{ id: string; revision: number }[]>`
      insert into kardo_core.publications (
        touchpoint_id, experience_version_id, revision, status,
        idempotency_key, request_idempotency_key, created_by
      ) values (
        ${touchpoint.id}::uuid,
        ${experienceVersionId}::uuid,
        (select coalesce(max(revision), 0) + 1 from kardo_core.publications where touchpoint_id = ${touchpoint.id}::uuid),
        'pending',
        ${rowIdempotencyKey}::uuid,
        ${requestIdempotencyKey}::uuid,
        ${createdBy}::uuid
      )
      returning id, revision
    `;
    const row = inserted[0];
    if (!row) {
      throw new ExperienceRepositoryError("Publication was not created.");
    }
    await tx`
      insert into kardo_core.publication_jobs (publication_id, idempotency_key, status)
      values (${row.id}::uuid, ${rowIdempotencyKey}::uuid, 'pending')
    `;
    publications.push({
      touchpointId: touchpoint.id,
      publicationId: row.id,
      revision: row.revision,
      status: "pending",
    });
  }
  return { versionId: experienceVersionId, versionRevision, publications };
}

/** Direct precedence (see propagation.ts): Touchpoints this Experience
 * reaches only through a group, while another Experience assigned directly to
 * them is live, are left untouched and reported as skipped. */
function splitByPrecedence(touchpoints: readonly ResolvedTouchpoint[]): {
  publishable: ResolvedTouchpoint[];
  skipped: NonNullable<PublicationBatch["skipped"]>;
} {
  const publishable = touchpoints.filter(
    (touchpoint) => touchpoint.direct || touchpoint.overridden_by === null,
  );
  const skipped = touchpoints
    .filter(
      (touchpoint) => !touchpoint.direct && touchpoint.overridden_by !== null,
    )
    .map((touchpoint) => ({
      touchpointId: touchpoint.id,
      touchpointName: touchpoint.name,
      reason: "DIRECT_TARGET_PRECEDENCE" as const,
      liveExperienceName: touchpoint.overridden_by,
    }));
  if (publishable.length === 0) {
    throw new ConflictError(
      "TARGETS_OVERRIDDEN",
      "Todos los QR y etiquetas de destino muestran otra página asignada directamente, que tiene prioridad sobre la asignación por grupo.",
    );
  }
  return { publishable, skipped };
}

/**
 * Opt-in replace guard (round 4, B1). With `replaceTargets === undefined`
 * (no request body) publishing keeps today's behavior and takes over every
 * target. With a list, a target that currently shows another Experience is
 * only taken over when its id is in the list; otherwise it is kept and
 * reported as skipped — so publishing a copy onto a new Link never silently
 * replaces the page the copy inherited (e.g. /productos).
 */
function splitByReplace(
  publishable: readonly ResolvedTouchpoint[],
  replaceTargets: readonly string[] | undefined,
): {
  toPublish: ResolvedTouchpoint[];
  skipped: NonNullable<PublicationBatch["skipped"]>;
} {
  if (replaceTargets === undefined) {
    return { toPublish: [...publishable], skipped: [] };
  }
  const confirmed = new Set(replaceTargets);
  const toPublish: ResolvedTouchpoint[] = [];
  const skipped: NonNullable<PublicationBatch["skipped"]> = [];
  for (const touchpoint of publishable) {
    if (touchpoint.occupied_by === null || confirmed.has(touchpoint.id)) {
      toPublish.push(touchpoint);
    } else {
      skipped.push({
        touchpointId: touchpoint.id,
        touchpointName: touchpoint.name,
        reason: "REPLACE_NOT_CONFIRMED",
        liveExperienceName: touchpoint.occupied_by,
      });
    }
  }
  return { toPublish, skipped };
}

function withSkipped(
  batch: PublicationBatch,
  skipped: NonNullable<PublicationBatch["skipped"]>,
): PublicationBatch {
  return skipped.length > 0 ? { ...batch, skipped } : batch;
}

/**
 * The page that loses a QR, a tag or a link stops listing it (domain audit
 * 2026-10-13, A9-4). Once this Experience is published on these Touchpoints,
 * any other Experience live there today drops its *direct* target on them, in
 * the same transaction, so its «Dónde se ve» never shows a place it lost and a
 * later republish of it (a price change, a rollback) never takes the place
 * back without asking. Group targets stay: there the closest-wins rule of ADR
 * 021 decides. Pages that never went live there keep their target (a plan the
 * owner chose, applied when they publish). Returns how many were released.
 */
async function releaseTakenTargets(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
  touchpoints: readonly ResolvedTouchpoint[],
): Promise<number> {
  const touchpointIds = touchpoints.map((touchpoint) => touchpoint.id);
  if (touchpointIds.length === 0) return 0;
  const released = await tx<{ experience_id: string }[]>`
    delete from kardo_core.experience_targets et
    where et.workspace_id = ${workspaceId}::uuid
      and et.touchpoint_id = any(${touchpointIds}::uuid[])
      and et.experience_id <> ${experienceId}::uuid
      and exists (
        select 1
        from kardo_core.publications p
        join kardo_core.experience_versions ev on ev.id = p.experience_version_id
        where p.touchpoint_id = et.touchpoint_id
          and ev.experience_id = et.experience_id
          and p.status = 'published' and p.superseded_at is null
      )
    returning et.experience_id
  `;
  if (released.length === 0) return 0;
  // The legacy single-target column follows the first remaining direct
  // target, as `writeExperienceTargets` keeps it.
  const losers = [...new Set(released.map((row) => row.experience_id))];
  await tx`
    update kardo_core.experiences e
    set touchpoint_id = (
      select et.touchpoint_id from kardo_core.experience_targets et
      where et.experience_id = e.id and et.touchpoint_id is not null
      order by et.touchpoint_id
      limit 1
    )
    where e.id = any(${losers}::uuid[])
  `;
  return released.length;
}

/** Every referenced assetId must be a `validated` asset of the expected
 * media type in the same workspace. Runs inside the caller's transaction so
 * it sees uncommitted asset finalizations from the same request, though that
 * should never happen in practice. */
async function assertAssetReferencesValid(
  tx: Sql,
  workspaceId: string,
  references: readonly AssetReference[],
): Promise<void> {
  for (const reference of references) {
    const rows = await tx<{ id: string }[]>`
      select id from kardo_core.assets
      where id = ${reference.assetId}::uuid
        and workspace_id = ${workspaceId}::uuid
        and status = 'validated'
        and media_type = any(${
          reference.expectedMediaType === "image/*"
            ? [...imageMediaTypes]
            : ["application/pdf"]
        }::text[])
    `;
    if (!rows[0]) {
      throw new ContentValidationError(
        "INVALID_EXPERIENCE_CONTENT",
        "Una imagen o un PDF de esta página ya no está en tus Archivos, o todavía se está revisando. Cámbialo y vuelve a intentarlo.",
      );
    }
  }
}

/** Structural equality for `CustomHtml` (and any other plain JSON value):
 * `undefined` on both sides counts as equal. Needed because Postgres jsonb
 * round-trips can reorder object keys, so a plain `JSON.stringify`
 * comparison of the stored draft against the new content would report a
 * change that never happened. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]))
  );
}

/** Estudio de Experiences, modo HTML (owner decision, 2026-09-29): creating
 * or changing `content.customHtml` requires the `experiences.custom_html`
 * permission (owner, admin); leaving it unchanged never does, so an editor
 * can keep saving the rest of an Experience's draft untouched. */
export function customHtmlChanged(
  previous: CustomHtml | undefined,
  next: CustomHtml | undefined,
): boolean {
  return !deepEqual(previous, next);
}

async function auditCustomHtmlChange(
  tx: Sql,
  workspaceId: string,
  actorSubject: string,
  experienceId: string,
  customHtml: CustomHtml | undefined,
): Promise<void> {
  await insertAuditEvent(tx, {
    workspaceId,
    actorSubject,
    action: "experience.custom_html_changed",
    targetType: "experience",
    targetId: experienceId,
    result: "succeeded",
    metadata: {
      htmlLength: customHtml?.html.length ?? 0,
      cssLength: customHtml?.css.length ?? 0,
      active: customHtml?.active ?? false,
    },
  });
}

type DesignHtmlBlockSignature = { id: string; html: string; css: string };

/** A design's `html` blocks, `{id, html, css}` only, in reading order — just
 * enough to detect a change without carrying the rest of the design along. */
function designHtmlBlockSignature(
  design: PageDesign | undefined,
): DesignHtmlBlockSignature[] {
  if (!design) return [];
  return designHtmlBlocks(design).map((block) => ({
    id: block.id,
    html: block.html,
    css: block.css,
  }));
}

/** Estudio de Experiences (ADR 018, addendum 3): a design's `html` blocks
 * share modo HTML's permission gate — creating or changing one requires the
 * `experiences.custom_html` permission (owner, admin); leaving them
 * unchanged never does, so an editor can keep saving the rest of the page
 * (colors, other blocks, content) untouched. Mirrors `customHtmlChanged`. */
export function designHtmlBlocksChanged(
  previous: PageDesign | undefined,
  next: PageDesign | undefined,
): boolean {
  return !deepEqual(
    designHtmlBlockSignature(previous),
    designHtmlBlockSignature(next),
  );
}

async function auditDesignHtmlBlocksChange(
  tx: Sql,
  workspaceId: string,
  actorSubject: string,
  experienceId: string,
  design: PageDesign | undefined,
): Promise<void> {
  const blocks = designHtmlBlockSignature(design);
  await insertAuditEvent(tx, {
    workspaceId,
    actorSubject,
    action: "experience.design_html_changed",
    targetType: "experience",
    targetId: experienceId,
    result: "succeeded",
    metadata: {
      blocks: blocks.length,
      htmlLength: blocks.reduce((sum, block) => sum + block.html.length, 0),
      cssLength: blocks.reduce((sum, block) => sum + block.css.length, 0),
    },
  });
}

export function createPostgresExperienceRepository(
  sql: Sql,
): ExperienceRepository {
  return {
    async listExperiences(identity, workspaceId, options) {
      const archived = options?.archived === true;
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return tx<ExperienceSummaryRow[]>`
          select ${experienceSummaryColumns(tx)}
          from kardo_core.experiences e
          ${experienceSummaryJoins(tx)}
          where e.workspace_id = ${workspaceId}::uuid
            and (e.archived_at is not null) = ${archived}::boolean
          order by ${archived ? tx`e.archived_at desc` : tx`e.created_at desc`}
        `;
      });
      return rows.map(toExperienceSummary);
    },
    async getExperienceVersion(identity, workspaceId, experienceId, versionId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const owned = await tx<{ id: string }[]>`
          select id from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        if (!owned[0]) throw new NotFoundError("Experience was not found.");
        const [row] = await fetchExperienceVersions(tx, experienceId, {
          versionId,
        });
        if (!row) throw new NotFoundError("Version was not found.");
        return toExperienceVersion(row);
      });
    },
    async listPublicationStates(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        // The same summary columns minus the content: the draft is compared
        // inside Postgres and never travels.
        return tx<Omit<ExperienceSummaryRow, "draft_content">[]>`
          select e.id, e.draft_revision,
            coalesce(latest_pub.status::text, 'draft') as publication_status,
            (
              latest_version.content is null
              or latest_version.content is distinct from e.draft_content
              or direct_unserved.any
            ) as has_unpublished_changes,
            live.revision as live_revision,
            live_count.total as live_touchpoint_count
          from kardo_core.experiences e
          ${experienceSummaryJoins(tx)}
          where e.workspace_id = ${workspaceId}::uuid and e.archived_at is null
        `;
      });
      return rows.map((row) => ({
        id: row.id,
        publicationStatus: row.publication_status,
        hasUnpublishedChanges: row.has_unpublished_changes,
        liveRevision: row.live_revision,
        liveTouchpointCount: row.live_touchpoint_count,
        draftRevision: row.draft_revision,
      }));
    },
    async getExperienceDetail(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const summaryRow = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!summaryRow) throw new NotFoundError("Experience was not found.");
        const [versionRows, targetRows, versionCount] = await Promise.all([
          fetchExperienceVersions(tx, experienceId),
          fetchExperienceTargetStatuses(tx, workspaceId, experienceId),
          countExperienceVersions(tx, experienceId),
        ]);
        return {
          experience: toExperienceSummary(summaryRow),
          targets: targetRows.map(toTargetStatus),
          versions: versionRows.map(toExperienceVersion),
          versionCount,
        };
      });
    },
    async createExperience(identity, workspaceId, input) {
      const { content, assetReferences } = validateExperienceContent(
        input.type,
        input.content,
      );
      const targets = input.targets ?? {
        touchpointIds: input.touchpointId ? [input.touchpointId] : [],
        groupIds: [],
      };
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        await assertAssetReferencesValid(tx, workspaceId, assetReferences);
        const nextCustomHtml = getCustomHtml(content);
        const htmlChanged = customHtmlChanged(undefined, nextCustomHtml);
        if (htmlChanged) requirePermission(role, "experiences.custom_html");
        // The organization's plan may turn modo HTML off (billing).
        if (htmlChanged && nextCustomHtml?.active)
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        // A design's own `html` blocks (addendum 3) share the same gate.
        const nextDesign = getDesign(content);
        const designHtmlChanged = designHtmlBlocksChanged(
          undefined,
          nextDesign,
        );
        if (designHtmlChanged)
          requirePermission(role, "experiences.custom_html");
        if (
          designHtmlChanged &&
          designHtmlBlockSignature(nextDesign).length > 0
        )
          await assertFeature(tx, workspaceId, "custom_html.enabled");

        const created = await tx<{ id: string }[]>`
          insert into kardo_core.experiences (
            workspace_id, type, name, draft_content, created_by
          ) values (
            ${workspaceId}::uuid, ${input.type}, ${input.name}, ${tx.json(content as JsonValue)}, ${identity.subject}::uuid
          )
          returning id
        `;
        const experienceId = created[0]?.id;
        if (!experienceId) {
          throw new ExperienceRepositoryError("Experience was not created.");
        }
        await writeExperienceTargets(tx, workspaceId, experienceId, targets, {
          allowEmpty: true,
        });
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.created",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: { type: input.type },
        });
        if (htmlChanged) {
          await auditCustomHtmlChange(
            tx,
            workspaceId,
            identity.subject,
            experienceId,
            nextCustomHtml,
          );
        }
        if (designHtmlChanged) {
          await auditDesignHtmlBlocksChange(
            tx,
            workspaceId,
            identity.subject,
            experienceId,
            nextDesign,
          );
        }
        const row = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!row) {
          throw new ExperienceRepositoryError("Experience was not created.");
        }
        return toExperience(row);
      });
    },
    async updateExperience(identity, workspaceId, experienceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const existing = await tx<
          {
            type: ExperienceType;
            draft_content: unknown;
            draft_revision: number;
          }[]
        >`
          select type, draft_content, draft_revision from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid and archived_at is null
          for update
        `;
        const current = existing[0];
        if (!current) throw new NotFoundError("Experience was not found.");
        // Domain audit A2-22: four screens write this draft; the one that
        // saves with an outdated revision is told instead of overwriting.
        if (
          input.expectedDraftRevision !== undefined &&
          input.expectedDraftRevision !== current.draft_revision
        ) {
          throw new ConflictError(
            "EXPERIENCE_CHANGED",
            "Alguien más guardó cambios en esta página. Recarga para ver la versión más reciente.",
          );
        }
        // Renaming alone never rewrites content another screen saved.
        if (input.content === undefined) {
          await tx`
            update kardo_core.experiences
            set name = ${input.name}, draft_revision = draft_revision + 1, updated_at = now()
            where id = ${experienceId}::uuid
          `;
          await insertAuditEvent(tx, {
            workspaceId,
            actorSubject: identity.subject,
            action: "experience.updated",
            targetType: "experience",
            targetId: experienceId,
            result: "succeeded",
            metadata: { nameOnly: true },
          });
          const renamed = await fetchExperienceSummaryRow(
            tx,
            workspaceId,
            experienceId,
          );
          if (!renamed) throw new NotFoundError("Experience was not found.");
          return toExperience(renamed);
        }

        const { content, assetReferences } = validateExperienceContent(
          current.type,
          input.content,
        );
        await assertAssetReferencesValid(tx, workspaceId, assetReferences);
        const previousCustomHtml = getCustomHtml(
          current.draft_content as ExperienceContent,
        );
        const nextCustomHtml = getCustomHtml(content);
        const htmlChanged = customHtmlChanged(
          previousCustomHtml,
          nextCustomHtml,
        );
        if (htmlChanged) requirePermission(role, "experiences.custom_html");
        if (htmlChanged && nextCustomHtml?.active)
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        // A design's own `html` blocks (addendum 3) share the same gate.
        const previousDesign = getDesign(
          current.draft_content as ExperienceContent,
        );
        const nextDesign = getDesign(content);
        const designHtmlChanged = designHtmlBlocksChanged(
          previousDesign,
          nextDesign,
        );
        if (designHtmlChanged)
          requirePermission(role, "experiences.custom_html");
        if (
          designHtmlChanged &&
          designHtmlBlockSignature(nextDesign).length > 0
        )
          await assertFeature(tx, workspaceId, "custom_html.enabled");

        await tx`
          update kardo_core.experiences
          set name = ${input.name}, draft_content = ${tx.json(content as JsonValue)},
              draft_revision = draft_revision + 1, updated_at = now()
          where id = ${experienceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.updated",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
        });
        if (htmlChanged) {
          await auditCustomHtmlChange(
            tx,
            workspaceId,
            identity.subject,
            experienceId,
            nextCustomHtml,
          );
        }
        if (designHtmlChanged) {
          await auditDesignHtmlBlocksChange(
            tx,
            workspaceId,
            identity.subject,
            experienceId,
            nextDesign,
          );
        }
        const row = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!row) throw new NotFoundError("Experience was not found.");
        return toExperience(row);
      });
    },
    async setExperienceTargets(identity, workspaceId, experienceId, targets) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const existing = await tx<{ id: string; type: ExperienceType }[]>`
          select id, type from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid and archived_at is null
          for update
        `;
        const current = existing[0];
        if (!current) throw new NotFoundError("Experience was not found.");

        // Taking every target away is only allowed while nothing serves this
        // Experience; a live one is paused or archived instead, so no
        // Touchpoint is left without content.
        const live = await tx<{ live: boolean }[]>`
          select exists (
            select 1
            from kardo_core.publications p
            join kardo_core.experience_versions ev on ev.id = p.experience_version_id
            where ev.experience_id = ${experienceId}::uuid
              and p.status = 'published' and p.superseded_at is null
          ) as live
        `;
        await writeExperienceTargets(tx, workspaceId, experienceId, targets, {
          allowEmpty: live[0]?.live !== true,
        });
        // Touchpoints that still serve this Experience but are no longer
        // targeted by it fall back to their group's Experience (if any).
        const stillTargeted = new Set(
          (
            await fetchResolvedTargetTouchpoints(tx, workspaceId, experienceId)
          ).map((touchpoint) => touchpoint.id),
        );
        const orphaned = (
          await touchpointsServing(tx, { workspaceId, experienceId })
        ).filter((touchpoint) => !stillTargeted.has(touchpoint.id));
        const fallback = await fallBackToGroupExperience(tx, {
          workspaceId,
          touchpointIds: orphaned.map((touchpoint) => touchpoint.id),
          excludeExperienceId: experienceId,
          createdBy: identity.subject,
        });
        // A QR that only shows this page can't be taken off it: it would keep
        // showing it while «Dónde se ve» no longer lists it (domain audit
        // A9-6). Same rule as archiving: another page goes there first.
        if (fallback.withoutFallback.length > 0) {
          const names = orphaned
            .filter((touchpoint) =>
              fallback.withoutFallback.includes(touchpoint.id),
            )
            .map((touchpoint) => `«${touchpoint.name}»`)
            .slice(0, 5)
            .join(", ");
          throw new ConflictError(
            "TARGET_STILL_LIVE",
            fallback.withoutFallback.length === 1
              ? `${names} solo muestra esta página. Para quitarla de ahí, publica otra página en ese lugar.`
              : `${names} solo muestran esta página. Para quitarla de ahí, publica otra página en esos lugares.`,
          );
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.targets_set",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: {
            touchpointCount: targets.touchpointIds.length,
            groupCount: targets.groupIds.length,
            fallbackPublications: fallback.queued,
          },
        });
        const row = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!row) throw new NotFoundError("Experience was not found.");
        return toExperience(row);
      });
    },
    async restoreExperienceVersion(
      identity,
      workspaceId,
      experienceId,
      versionId,
    ) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        // Domain audit A2-33: an archived page is not edited (the panel
        // hid it; the API now refuses too), and the restored content
        // passes today's rules and gates, like any saved draft.
        const existing = await tx<
          { type: ExperienceType; draft_content: unknown }[]
        >`
          select type, draft_content from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
            and archived_at is null
          for update
        `;
        const current = existing[0];
        if (!current) throw new NotFoundError("Experience was not found.");
        const version = await tx<{ content: unknown }[]>`
          select ev.content
          from kardo_core.experience_versions ev
          where ev.id = ${versionId}::uuid
            and ev.experience_id = ${experienceId}::uuid
        `;
        const stored = version[0]?.content;
        if (stored === undefined) {
          throw new NotFoundError("Version was not found.");
        }
        const { content, assetReferences } = validateExperienceContent(
          current.type,
          stored,
        );
        await assertAssetReferencesValid(tx, workspaceId, assetReferences);
        const previous = current.draft_content as ExperienceContent;
        const htmlChanged = customHtmlChanged(
          getCustomHtml(previous),
          getCustomHtml(content),
        );
        const designHtmlChanged = designHtmlBlocksChanged(
          getDesign(previous),
          getDesign(content),
        );
        if (htmlChanged || designHtmlChanged)
          requirePermission(role, "experiences.custom_html");
        if (
          (htmlChanged && getCustomHtml(content)?.active) ||
          (designHtmlChanged &&
            designHtmlBlockSignature(getDesign(content)).length > 0)
        )
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        await tx`
          update kardo_core.experiences
          set draft_content = ${tx.json(content as JsonValue)},
              draft_revision = draft_revision + 1, updated_at = now()
          where id = ${experienceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.restored",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: { versionId },
        });
        const summaryRow = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!summaryRow) throw new NotFoundError("Experience was not found.");
        const [versionRows, targetRows, versionCount] = await Promise.all([
          fetchExperienceVersions(tx, experienceId),
          fetchExperienceTargetStatuses(tx, workspaceId, experienceId),
          countExperienceVersions(tx, experienceId),
        ]);
        return {
          experience: toExperienceSummary(summaryRow),
          targets: targetRows.map(toTargetStatus),
          versions: versionRows.map(toExperienceVersion),
          versionCount,
        };
      });
    },
    async createPublicationIntent(
      identity,
      workspaceId,
      experienceId,
      idempotencyKey,
      options,
    ) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.publish",
        );

        const existingRequest = await lookupPublicationRequest(
          tx,
          idempotencyKey,
        );
        if (existingRequest) {
          if (
            existingRequest.workspaceId === workspaceId &&
            existingRequest.experienceId === experienceId &&
            existingRequest.createdBy === identity.subject
          ) {
            const batch = await fetchPublicationBatchByRequest(
              tx,
              idempotencyKey,
            );
            if (batch) return batch;
          }
          throw new ConflictError(
            "CONFLICT",
            "This idempotency key was already used in a different context.",
          );
        }

        const experience = await tx<
          { id: string; type: ExperienceType; draft_content: unknown }[]
        >`
          select e.id, e.type, e.draft_content
          from kardo_core.experiences e
          where e.id = ${experienceId}::uuid
            and e.workspace_id = ${workspaceId}::uuid
            and e.archived_at is null
          for update
        `;
        const current = experience[0];
        if (!current) throw new NotFoundError("Experience was not found.");

        // The draft may be legacy content saved before a validation rule
        // existed, or may reference an asset that has since been removed.
        // Re-validating here — not just at draft-save time — keeps an
        // invalid draft from ever becoming a published version.
        const { content, assetReferences } = validateExperienceContent(
          current.type,
          current.draft_content,
        );
        await assertAssetReferencesValid(tx, workspaceId, assetReferences);

        // Publishing an Experience whose draft has an ACTIVE modo HTML also
        // requires `experiences.custom_html`: an editor without that
        // permission can still publish every other kind of change.
        const publishedCustomHtml = getCustomHtml(content);
        if (publishedCustomHtml?.active) {
          requirePermission(role, "experiences.custom_html");
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        }
        // Same gate for a design carrying any `html` blocks (addendum 3),
        // checked on every publish regardless of whether they changed since
        // the last version — publishing makes this revision live.
        const publishedDesignHtmlBlocks = designHtmlBlockSignature(
          getDesign(content),
        );
        if (publishedDesignHtmlBlocks.length > 0) {
          requirePermission(role, "experiences.custom_html");
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        }

        const touchpoints = await fetchResolvedTargetTouchpoints(
          tx,
          workspaceId,
          experienceId,
          PUBLISHABLE_TOUCHPOINT_STATUSES,
        );
        if (touchpoints.length === 0) {
          throw new ContentValidationError(
            "TARGETS_REQUIRED",
            "Choose at least one Touchpoint or group to publish this Experience to.",
          );
        }
        const { publishable, skipped: precedenceSkipped } =
          splitByPrecedence(touchpoints);
        // Opt-in replace guard (round 4, B1): with a request body, a target
        // showing another Experience is only taken over when confirmed.
        const { toPublish, skipped: replaceSkipped } = splitByReplace(
          publishable,
          options?.replaceTargets,
        );
        if (toPublish.length === 0) {
          throw new ConflictError(
            "REPLACE_NOT_CONFIRMED",
            "Cada destino muestra otra página. Confirma cuáles reemplazar para publicar.",
          );
        }
        const skipped = [...precedenceSkipped, ...replaceSkipped];

        const version = await tx<{ id: string; revision: number }[]>`
          insert into kardo_core.experience_versions (
            experience_id, revision, content, created_by
          ) values (
            ${current.id}::uuid,
            (select coalesce(max(revision), 0) + 1 from kardo_core.experience_versions where experience_id = ${current.id}::uuid),
            ${tx.json(content as JsonValue)},
            ${identity.subject}::uuid
          )
          returning id, revision
        `;
        const versionRow = version[0];
        if (!versionRow) {
          throw new ExperienceRepositoryError("Version was not created.");
        }

        await tx`
          insert into kardo_core.publication_requests (
            idempotency_key, workspace_id, experience_id, experience_version_id, created_by
          ) values (
            ${idempotencyKey}::uuid, ${workspaceId}::uuid, ${current.id}::uuid, ${versionRow.id}::uuid, ${identity.subject}::uuid
          )
        `;

        const batch = await insertPublicationBatch(
          tx,
          versionRow.id,
          versionRow.revision,
          toPublish,
          idempotencyKey,
          identity.subject,
        );
        const releasedTargets = await releaseTakenTargets(
          tx,
          workspaceId,
          current.id,
          toPublish,
        );

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "publication.intent_created",
          targetType: "experience",
          targetId: current.id,
          result: "succeeded",
          metadata: {
            revision: versionRow.revision,
            touchpointCount: toPublish.length,
            skippedCount: skipped.length,
            releasedTargets,
          },
        });
        if (publishedCustomHtml?.active) {
          await insertAuditEvent(tx, {
            workspaceId,
            actorSubject: identity.subject,
            action: "experience.custom_html_published",
            targetType: "experience",
            targetId: current.id,
            result: "succeeded",
            metadata: {
              htmlLength: publishedCustomHtml.html.length,
              cssLength: publishedCustomHtml.css.length,
            },
          });
        }
        if (publishedDesignHtmlBlocks.length > 0) {
          await insertAuditEvent(tx, {
            workspaceId,
            actorSubject: identity.subject,
            action: "experience.design_html_published",
            targetType: "experience",
            targetId: current.id,
            result: "succeeded",
            metadata: {
              blocks: publishedDesignHtmlBlocks.length,
              htmlLength: publishedDesignHtmlBlocks.reduce(
                (sum, block) => sum + block.html.length,
                0,
              ),
              cssLength: publishedDesignHtmlBlocks.reduce(
                (sum, block) => sum + block.css.length,
                0,
              ),
            },
          });
        }
        return withSkipped(batch, skipped);
      });
    },
    async createRollbackPublicationIntent(
      identity,
      workspaceId,
      experienceId,
      versionId,
      idempotencyKey,
      options,
    ) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.publish",
        );

        const existingRequest = await lookupPublicationRequest(
          tx,
          idempotencyKey,
        );
        if (existingRequest) {
          if (
            existingRequest.workspaceId === workspaceId &&
            existingRequest.experienceId === experienceId &&
            existingRequest.createdBy === identity.subject
          ) {
            const batch = await fetchPublicationBatchByRequest(
              tx,
              idempotencyKey,
            );
            if (batch) return batch;
          }
          throw new ConflictError(
            "CONFLICT",
            "This idempotency key was already used in a different context.",
          );
        }

        const version = await tx<
          {
            id: string;
            revision: number;
            content: unknown;
            type: ExperienceType;
          }[]
        >`
          select ev.id, ev.revision, ev.content, e.type
          from kardo_core.experience_versions ev
          join kardo_core.experiences e on e.id = ev.experience_id
          where ev.id = ${versionId}::uuid
            and ev.experience_id = ${experienceId}::uuid
            and e.workspace_id = ${workspaceId}::uuid
            and e.archived_at is null
          for update of e
        `;
        const current = version[0];
        if (!current) throw new NotFoundError("Version was not found.");

        // Republishing an old version makes its content live again: the same
        // gate as a publish when it carries an active modo HTML or `html`
        // blocks in its design (security review 2026-10).
        const rolledBack = current.content as ExperienceContent;
        if (
          getCustomHtml(rolledBack)?.active ||
          designHtmlBlockSignature(getDesign(rolledBack)).length > 0
        ) {
          requirePermission(role, "experiences.custom_html");
          await assertFeature(tx, workspaceId, "custom_html.enabled");
        }
        // Same file check as a publish (domain audit A9-5): an old version may
        // point at an image or PDF deleted since, which the Publisher would
        // only reject later, after the owner was told it was publishing.
        const { assetReferences } = validateExperienceContent(
          current.type,
          current.content,
        );
        await assertAssetReferencesValid(tx, workspaceId, assetReferences);

        const touchpoints = await fetchResolvedTargetTouchpoints(
          tx,
          workspaceId,
          experienceId,
          PUBLISHABLE_TOUCHPOINT_STATUSES,
        );
        if (touchpoints.length === 0) {
          throw new ContentValidationError(
            "TARGETS_REQUIRED",
            "Choose at least one Touchpoint or group to publish this Experience to.",
          );
        }
        const { publishable, skipped: precedenceSkipped } =
          splitByPrecedence(touchpoints);
        // Same replace guard as a publish (A9-5): returning to a version never
        // takes over a QR or link that shows another page unless confirmed.
        const { toPublish, skipped: replaceSkipped } = splitByReplace(
          publishable,
          options?.replaceTargets,
        );
        if (toPublish.length === 0) {
          throw new ConflictError(
            "REPLACE_NOT_CONFIRMED",
            "Cada destino muestra otra página. Confirma cuáles reemplazar para publicar.",
          );
        }
        const skipped = [...precedenceSkipped, ...replaceSkipped];

        await tx`
          insert into kardo_core.publication_requests (
            idempotency_key, workspace_id, experience_id, experience_version_id, created_by
          ) values (
            ${idempotencyKey}::uuid, ${workspaceId}::uuid, ${experienceId}::uuid, ${current.id}::uuid, ${identity.subject}::uuid
          )
        `;

        const batch = await insertPublicationBatch(
          tx,
          current.id,
          current.revision,
          toPublish,
          idempotencyKey,
          identity.subject,
        );
        const releasedTargets = await releaseTakenTargets(
          tx,
          workspaceId,
          experienceId,
          toPublish,
        );

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "publication.rollback_requested",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: {
            versionId,
            revision: current.revision,
            touchpointCount: toPublish.length,
            skippedCount: skipped.length,
            releasedTargets,
          },
        });
        return withSkipped(batch, skipped);
      });
    },
    async archiveExperience(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const existing = await tx<{ archived_at: string | null }[]>`
          select archived_at from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        const current = existing[0];
        if (!current) throw new NotFoundError("Experience was not found.");
        if (current.archived_at) {
          return {
            experienceId,
            archivedAt: new Date(current.archived_at).toISOString(),
            fallbackPublications: 0,
          };
        }
        // A Touchpoint must never keep serving an archived Experience with
        // nothing to fall back to: the customer would lose track of what
        // their printed QR shows.
        const serving = await touchpointsServing(tx, {
          workspaceId,
          experienceId,
        });
        const fallback = await fallBackToGroupExperience(tx, {
          workspaceId,
          touchpointIds: serving.map((touchpoint) => touchpoint.id),
          excludeExperienceId: experienceId,
          createdBy: identity.subject,
        });
        if (fallback.withoutFallback.length > 0) {
          const names = serving
            .filter((touchpoint) =>
              fallback.withoutFallback.includes(touchpoint.id),
            )
            .map((touchpoint) => touchpoint.name)
            .slice(0, 5)
            .join(", ");
          throw new ConflictError(
            "EXPERIENCE_LIVE",
            `Esta página está en vivo en ${fallback.withoutFallback.length} QR o etiqueta(s) sin una página de grupo que la reemplace (${names}). Publica otra página ahí o retíralos antes de archivarla.`,
          );
        }
        const archived = await tx<{ archived_at: string }[]>`
          update kardo_core.experiences
          set archived_at = now(), updated_at = now()
          where id = ${experienceId}::uuid
          returning archived_at
        `;
        const archivedAt = archived[0]?.archived_at;
        if (!archivedAt) throw new NotFoundError("Experience was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.archived",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: { fallbackPublications: fallback.queued },
        });
        return {
          experienceId,
          archivedAt: new Date(archivedAt).toISOString(),
          fallbackPublications: fallback.queued,
        };
      });
    },
    async unarchiveExperience(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const updated = await tx<{ id: string }[]>`
          update kardo_core.experiences
          set archived_at = null, updated_at = now()
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!updated[0]) throw new NotFoundError("Experience was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.unarchived",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
        });
        const row = await fetchExperienceSummaryRow(
          tx,
          workspaceId,
          experienceId,
        );
        if (!row) throw new NotFoundError("Experience was not found.");
        return toExperience(row);
      });
    },
    async duplicateExperience(identity, workspaceId, experienceId, name) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const source = await tx<
          { name: string; type: ExperienceType; draft_content: unknown }[]
        >`
          select name, type, draft_content from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        const original = source[0];
        if (!original) throw new NotFoundError("Experience was not found.");
        const copyName = (name?.trim() || duplicateName(original.name)).slice(
          0,
          120,
        );
        // A duplicate is a fresh copy of the CONTENT with NO destinations: it
        // must not inherit the original's Touchpoints, groups or links. If it
        // did, publishing the copy (e.g. putting it on a new Link) would also
        // publish over those inherited destinations and silently replace the
        // original's page — e.g. duplicating «Productos» and publishing the
        // copy overwrote the catalog at /productos (round 4, N15, data loss).
        // The owner assigns the copy to new destinations before publishing it.
        const created = await tx<{ id: string }[]>`
          insert into kardo_core.experiences (
            workspace_id, type, name, draft_content, created_by, touchpoint_id
          )
          select workspace_id, type, ${copyName}, draft_content, ${identity.subject}::uuid, null
          from kardo_core.experiences
          where id = ${experienceId}::uuid
          returning id
        `;
        const copyId = created[0]?.id;
        if (!copyId) {
          throw new ExperienceRepositoryError("Experience was not created.");
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.duplicated",
          targetType: "experience",
          targetId: copyId,
          result: "succeeded",
          metadata: { sourceExperienceId: experienceId },
        });
        const row = await fetchExperienceSummaryRow(tx, workspaceId, copyId);
        if (!row) {
          throw new ExperienceRepositoryError("Experience was not created.");
        }
        return toExperience(row);
      });
    },
  };
}

/** "Menú" → "Menú (copia)"; "Menú (copia)" → "Menú (copia 2)"… */
export function duplicateName(name: string): string {
  const match = name.match(/^(.*) \(copia(?: (\d+))?\)$/);
  if (!match) return `${name} (copia)`;
  const next = match[2] ? Number(match[2]) + 1 : 2;
  return `${match[1]} (copia ${next})`;
}

function toTargets(row: ExperienceSummaryRow): ExperienceTargets {
  return {
    touchpointIds: row.target_touchpoint_ids,
    groupIds: row.target_group_ids,
  };
}

function toExperienceSummary(row: ExperienceSummaryRow): ExperienceSummary {
  return {
    id: row.id,
    touchpointId: row.touchpoint_id,
    targets: toTargets(row),
    name: row.name,
    type: row.type,
    content: row.draft_content as ExperienceSummary["content"],
    publicationStatus: row.publication_status,
    hasUnpublishedChanges: row.has_unpublished_changes,
    draftRevision: row.draft_revision,
    liveRevision: row.live_revision,
    liveTouchpointCount: row.live_touchpoint_count,
    archivedAt: row.archived_at
      ? new Date(row.archived_at).toISOString()
      : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** The same record: an `Experience` is serialized as its summary. */
function toExperience(row: ExperienceSummaryRow): Experience {
  return toExperienceSummary(row) as Experience;
}

function toTargetStatus(row: TargetStatusRow): ExperienceTargetStatus {
  return {
    touchpointId: row.touchpoint_id,
    touchpointName: row.touchpoint_name,
    groupId: row.group_id,
    status: row.status,
    isLive: row.is_live,
    liveExperienceName: row.live_experience_name,
    via: row.direct ? "touchpoint" : "group",
    overridden: row.overridden,
  };
}

function toExperienceVersion(row: VersionRow): ExperienceVersion {
  return {
    id: row.id,
    revision: row.revision,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.content == null
      ? {}
      : { content: row.content as Record<string, unknown> }),
    publication: row.publication_id
      ? {
          id: row.publication_id,
          revision: row.publication_revision ?? row.revision,
          status: row.publication_status ?? "pending",
          createdAt: new Date(
            row.publication_created_at ?? row.created_at,
          ).toISOString(),
          publishedAt: row.published_at
            ? new Date(row.published_at).toISOString()
            : null,
          failureReason: translatePublicationFailureReason(row.last_error),
        }
      : null,
    liveTouchpointCount: row.live_touchpoint_count,
    failedTouchpointCount: row.failed_touchpoint_count,
  };
}
