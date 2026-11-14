import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

/**
 * Content rules shared by Touchpoint and Experience writes (groups nest, ADR
 * 021; "its groups" are its group and every group above it):
 *
 * 1. The closest wins: an Experience assigned directly to a Touchpoint wins
 *    over one that reaches it through a group, and a nearer group wins over
 *    a group further up.
 * 2. Group propagation: a Touchpoint that joins a group (created in it,
 *    moved into it, or its group moved under another) receives what its
 *    nearest serving group serves — the most recently published live
 *    version of a non-archived Experience targeting that group — unless a
 *    live Experience already reaches it from closer.
 * 3. Fallback: when a Touchpoint stops being targeted by the Experience it
 *    serves (target removed, Experience archived), it falls back to what its
 *    nearest serving group serves, if anything.
 *
 * Everything here runs inside the caller's customer transaction, so RLS and
 * the audit trail stay atomic with the triggering change.
 */

const PUBLISHABLE_STATUSES = ["assigned", "active", "paused"] as const;

type Candidate = {
  touchpoint_id: string;
  version_id: string;
  experience_id: string;
};

/** The version each Touchpoint's nearest serving group serves (rules 2, 3). */
async function findGroupCandidates(
  tx: Sql,
  input: {
    workspaceId: string;
    touchpointIds: readonly string[];
    excludeExperienceId?: string | undefined;
    respectDirectPrecedence: boolean;
  },
): Promise<Candidate[]> {
  if (input.touchpointIds.length === 0) return [];
  const exclude = input.excludeExperienceId ?? null;
  return tx<Candidate[]>`
    select t.id as touchpoint_id, candidate.version_id, candidate.experience_id
    from kardo_core.touchpoints t
    join kardo_core.touchpoint_groups tg on tg.id = t.group_id
    join lateral (
      -- Walk up from the Touchpoint's own group: the first group whose
      -- Experience is live on another Touchpoint of its tree wins.
      select ev.id as version_id, ev.experience_id,
             cardinality(tg.path) - ancestor.position + 1 as distance
      from unnest(tg.path) with ordinality as ancestor(group_id, position)
      join kardo_core.experience_targets et on et.group_id = ancestor.group_id
      join kardo_core.experiences e on e.id = et.experience_id and e.archived_at is null
      join kardo_core.experience_versions ev on ev.experience_id = e.id
      join kardo_core.publications p
        on p.experience_version_id = ev.id and p.status = 'published' and p.superseded_at is null
      join kardo_core.touchpoints member on member.id = p.touchpoint_id and member.id <> t.id
      join kardo_core.touchpoint_groups member_group
        on member_group.id = member.group_id and member_group.path @> array[ancestor.group_id]
      where (${exclude}::uuid is null or e.id <> ${exclude}::uuid)
      order by ancestor.position desc, p.published_at desc
      limit 1
    ) candidate on true
    where t.id = any(${input.touchpointIds as string[]}::uuid[])
      and t.workspace_id = ${input.workspaceId}::uuid
      and t.group_id is not null
      and t.status::text = any(${PUBLISHABLE_STATUSES as unknown as string[]}::text[])
      -- The closest wins: keep a live Experience that reaches the Touchpoint
      -- from closer than the candidate (directly, or from a nearer group).
      and (
        not ${input.respectDirectPrecedence}::boolean
        or not exists (
          select 1
          from kardo_core.publications lp
          join kardo_core.experience_versions lev on lev.id = lp.experience_version_id
          join kardo_core.experiences live_experience
            on live_experience.id = lev.experience_id and live_experience.archived_at is null
          where lp.touchpoint_id = t.id and lp.status = 'published' and lp.superseded_at is null
            and (
              select min(case when lt.touchpoint_id = t.id then 0
                         else cardinality(tg.path) - array_position(tg.path, lt.group_id) + 1 end)
              from kardo_core.experience_targets lt
              where lt.experience_id = live_experience.id
                and (lt.touchpoint_id = t.id or lt.group_id = any(tg.path))
            ) < candidate.distance
        )
      )
      -- Propagation is idempotent: skip Touchpoints already serving (or
      -- queued to serve) the candidate version. A fallback always queues.
      and (
        not ${input.respectDirectPrecedence}::boolean
        or not exists (
        select 1 from kardo_core.publications current_pub
        where current_pub.touchpoint_id = t.id
          and current_pub.experience_version_id = candidate.version_id
          and (
            (current_pub.status = 'published' and current_pub.superseded_at is null)
            or current_pub.status in ('pending', 'processing')
          )
        )
      )
  `;
}

/** Queues one publication (+ job) per candidate. Returns how many. */
async function queueCandidates(
  tx: Sql,
  candidates: readonly Candidate[],
  createdBy: string,
): Promise<number> {
  for (const candidate of candidates) {
    const key = randomUUID();
    const inserted = await tx<{ id: string }[]>`
      insert into kardo_core.publications (
        touchpoint_id, experience_version_id, revision, status, idempotency_key, created_by
      ) values (
        ${candidate.touchpoint_id}::uuid,
        ${candidate.version_id}::uuid,
        (select coalesce(max(revision), 0) + 1 from kardo_core.publications where touchpoint_id = ${candidate.touchpoint_id}::uuid),
        'pending',
        ${key}::uuid,
        ${createdBy}::uuid
      )
      returning id
    `;
    const publicationId = inserted[0]?.id;
    if (!publicationId)
      throw new Error("Propagated publication was not created.");
    await tx`
      insert into kardo_core.publication_jobs (publication_id, idempotency_key, status)
      values (${publicationId}::uuid, ${key}::uuid, 'pending')
    `;
  }
  return candidates.length;
}

/** Rule 2: Touchpoints that just joined a group get what the group serves. */
export async function propagateGroupExperience(
  tx: Sql,
  input: {
    workspaceId: string;
    touchpointIds: readonly string[];
    createdBy: string;
  },
): Promise<number> {
  const candidates = await findGroupCandidates(tx, {
    workspaceId: input.workspaceId,
    touchpointIds: input.touchpointIds,
    respectDirectPrecedence: true,
  });
  return queueCandidates(tx, candidates, input.createdBy);
}

/** Touchpoints (not retired) currently serving any version of `experienceId`. */
export async function touchpointsServing(
  tx: Sql,
  input: { workspaceId: string; experienceId: string },
): Promise<{ id: string; name: string }[]> {
  return tx<{ id: string; name: string }[]>`
    select t.id, t.operational_name as name
    from kardo_core.publications p
    join kardo_core.experience_versions ev on ev.id = p.experience_version_id
    join kardo_core.touchpoints t on t.id = p.touchpoint_id
    where ev.experience_id = ${input.experienceId}::uuid
      and t.workspace_id = ${input.workspaceId}::uuid
      and p.status = 'published' and p.superseded_at is null
      and t.status <> 'retired'
    order by t.operational_name asc
  `;
}

/**
 * Rule 3: Touchpoints that should stop serving `experienceId` fall back to
 * their group's Experience. Returns the queued count and the Touchpoints left
 * without any fallback (they keep serving the old content until something
 * else is published to them).
 */
export async function fallBackToGroupExperience(
  tx: Sql,
  input: {
    workspaceId: string;
    touchpointIds: readonly string[];
    excludeExperienceId: string;
    createdBy: string;
  },
): Promise<{ queued: number; withoutFallback: string[] }> {
  const candidates = await findGroupCandidates(tx, {
    workspaceId: input.workspaceId,
    touchpointIds: input.touchpointIds,
    excludeExperienceId: input.excludeExperienceId,
    respectDirectPrecedence: false,
  });
  const covered = new Set(
    candidates.map((candidate) => candidate.touchpoint_id),
  );
  const queued = await queueCandidates(tx, candidates, input.createdBy);
  return {
    queued,
    withoutFallback: input.touchpointIds.filter((id) => !covered.has(id)),
  };
}
