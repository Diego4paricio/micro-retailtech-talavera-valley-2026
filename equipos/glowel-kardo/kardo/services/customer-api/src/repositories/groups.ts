import type {
  CreateTouchpointGroup,
  MoveTouchpoints,
  MoveTouchpointsResult,
  TouchpointGroup,
  UpdateTouchpointGroup,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { ConflictError, NotFoundError } from "../errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import { GROUP_MAX_DEPTH } from "./group-tree.js";
import { propagateGroupExperience } from "./propagation.js";

export type TouchpointGroupRepository = {
  listGroups(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<readonly TouchpointGroup[]>;
  createGroup(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateTouchpointGroup,
  ): Promise<TouchpointGroup>;
  updateGroup(
    identity: CustomerIdentity,
    workspaceId: string,
    groupId: string,
    input: UpdateTouchpointGroup,
  ): Promise<TouchpointGroup>;
  setGroupTouchpoints(
    identity: CustomerIdentity,
    workspaceId: string,
    groupId: string,
    touchpointIds: readonly string[],
  ): Promise<TouchpointGroup>;
  /** Into a group (or out with `null`), leaving its other members alone. */
  moveTouchpoints(
    identity: CustomerIdentity,
    workspaceId: string,
    input: MoveTouchpoints,
  ): Promise<MoveTouchpointsResult>;
  deleteGroup(
    identity: CustomerIdentity,
    workspaceId: string,
    groupId: string,
  ): Promise<void>;
};

export class TouchpointGroupRepositoryError extends Error {}

export function unavailableTouchpointGroupRepository(): TouchpointGroupRepository {
  const unavailable = () =>
    Promise.reject(
      new TouchpointGroupRepositoryError(
        "Touchpoint group storage is not configured.",
      ),
    );
  return {
    listGroups: unavailable,
    createGroup: unavailable,
    updateGroup: unavailable,
    setGroupTouchpoints: unavailable,
    moveTouchpoints: unavailable,
    deleteGroup: unavailable,
  };
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  touchpoint_count: number;
  total_touchpoint_count: number;
  served_experience_id: string | null;
  served_experience_name: string | null;
  qr_template_id: string | null;
  parent_id: string | null;
  kind: "location" | "group";
};

/** The workspace's groups (or one of them) with their counts and what each
 * serves. Groups nest (ADR 021): the total counts its whole tree, and a
 * group serves an Experience that targets it and is live in its tree. */
function selectGroups(tx: Sql, workspaceId: string, groupId: string | null) {
  return tx<GroupRow[]>`
    select g.id, g.name, g.description, g.created_at, g.qr_template_id, g.parent_id, g.kind,
           (
             select count(*)::int from kardo_core.touchpoints t
             where t.group_id = g.id and t.status <> 'retired'
           ) as touchpoint_count,
           (
             select count(*)::int
             from kardo_core.touchpoint_groups tree
             join kardo_core.touchpoints t on t.group_id = tree.id and t.status <> 'retired'
             where tree.workspace_id = g.workspace_id and tree.path @> array[g.id]
           ) as total_touchpoint_count,
           served.id as served_experience_id, served.name as served_experience_name
    from kardo_core.touchpoint_groups g
    left join lateral (
      -- Same rule as propagation.ts: the most recently published live version
      -- of a non-archived Experience targeting this group.
      select e.id, e.name
      from kardo_core.experience_targets et
      join kardo_core.experiences e on e.id = et.experience_id and e.archived_at is null
      join kardo_core.experience_versions ev on ev.experience_id = e.id
      join kardo_core.publications p
        on p.experience_version_id = ev.id and p.status = 'published' and p.superseded_at is null
      join kardo_core.touchpoints member on member.id = p.touchpoint_id
      join kardo_core.touchpoint_groups member_group
        on member_group.id = member.group_id and member_group.path @> array[g.id]
      where et.group_id = g.id
      order by p.published_at desc
      limit 1
    ) served on true
    where g.workspace_id = ${workspaceId}::uuid
      ${groupId ? tx`and g.id = ${groupId}::uuid` : tx``}
    order by g.created_at asc
  `;
}

async function fetchGroupById(
  tx: Sql,
  workspaceId: string,
  groupId: string,
): Promise<GroupRow | undefined> {
  const rows = await selectGroups(tx, workspaceId, groupId);
  return rows[0];
}

/** Touchpoints in a group's whole tree that can belong to a group. */
async function touchpointsInTree(
  tx: Sql,
  workspaceId: string,
  groupId: string,
): Promise<string[]> {
  const rows = await tx<{ id: string }[]>`
    select t.id
    from kardo_core.touchpoint_groups tree
    join kardo_core.touchpoints t on t.group_id = tree.id
    where tree.workspace_id = ${workspaceId}::uuid and tree.path @> array[${groupId}::uuid]
      and t.status <> 'retired' and t.kind <> 'link'
  `;
  return rows.map((row) => row.id);
}

/**
 * Before a group is deleted (A9-13): `experience_targets.group_id` cascades
 * on delete, so a page that targets the group directly would otherwise lose
 * that destination for good, with no warning. For every non-archived
 * Experience that targets this group, add a direct target for every
 * Touchpoint of the group's whole tree that Experience is live on today
 * (`publications.status = 'published'`, not superseded) — so the page keeps
 * listing where it is seen. Touchpoints it is not live on are left alone,
 * and the partial unique index (`experience_targets_touchpoint_unique`)
 * guards against ever duplicating a target that already exists.
 */
async function preserveGroupTargetsBeforeDelete(
  tx: Sql,
  workspaceId: string,
  groupId: string,
): Promise<void> {
  await tx`
    insert into kardo_core.experience_targets (experience_id, workspace_id, touchpoint_id)
    select distinct et.experience_id, et.workspace_id, t.id
    from kardo_core.experience_targets et
    join kardo_core.experiences e on e.id = et.experience_id and e.archived_at is null
    join kardo_core.touchpoint_groups tree
      on tree.workspace_id = et.workspace_id and tree.path @> array[et.group_id]
    join kardo_core.touchpoints t on t.group_id = tree.id and t.status <> 'retired'
    join kardo_core.publications p
      on p.touchpoint_id = t.id and p.status = 'published' and p.superseded_at is null
    join kardo_core.experience_versions ev
      on ev.id = p.experience_version_id and ev.experience_id = et.experience_id
    where et.group_id = ${groupId}::uuid and et.workspace_id = ${workspaceId}::uuid
    on conflict (experience_id, touchpoint_id) where touchpoint_id is not null
      do nothing
  `;
}

async function assertGroupExists(
  tx: Sql,
  workspaceId: string,
  groupId: string,
  message = "Group was not found.",
): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    select id from kardo_core.touchpoint_groups
    where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
  `;
  if (!rows[0]) throw new NotFoundError(message);
}

/**
 * Turns the database's refusals into API errors. The name is unique among
 * siblings (`(workspace_id, parent, lower(name))`, SQLSTATE 23505), and the
 * tree trigger refuses cycles and more than four levels (ADR 021).
 */
async function runCatchingGroupErrors<T>(
  query: Promise<T>,
  nameTaken: {
    code: "GROUP_NAME_TAKEN" | "GROUP_CHILD_NAME_TAKEN";
    message: string;
  } = {
    code: "GROUP_NAME_TAKEN",
    message: "A group with that name already exists in the same place.",
  },
): Promise<T> {
  try {
    return await query;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";
    if (code === "23505")
      throw new ConflictError(nameTaken.code, nameTaken.message);
    if (code === "P0001" && message === "GROUP_TOO_DEEP")
      throw new ConflictError(
        "GROUP_TOO_DEEP",
        `Groups can nest up to ${GROUP_MAX_DEPTH} levels.`,
      );
    if (code === "P0001" && message === "GROUP_CYCLE")
      throw new ConflictError(
        "GROUP_CYCLE",
        "A group cannot go inside itself or one of its own subgroups.",
      );
    if (code === "23503")
      throw new NotFoundError("Parent group was not found.");
    throw error;
  }
}

export function createPostgresTouchpointGroupRepository(
  sql: Sql,
): TouchpointGroupRepository {
  return {
    async listGroups(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return selectGroups(tx, workspaceId, null);
      });
      return rows.map(toGroup);
    },
    async createGroup(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        if (input.parentId)
          await assertGroupExists(
            tx,
            workspaceId,
            input.parentId,
            "Parent group was not found.",
          );
        const created = await runCatchingGroupErrors(
          tx<{ id: string }[]>`
            insert into kardo_core.touchpoint_groups
              (workspace_id, name, description, created_by, parent_id, kind)
            values (
              ${workspaceId}::uuid, ${input.name}, ${input.description ?? null},
              ${identity.subject}::uuid, ${input.parentId ?? null}, ${input.kind ?? "group"}
            )
            returning id
          `,
        );
        const groupId = created[0]?.id;
        if (!groupId) {
          throw new TouchpointGroupRepositoryError("Group was not created.");
        }
        if (input.touchpointIds && input.touchpointIds.length > 0) {
          const moved = await tx<{ id: string }[]>`
            update kardo_core.touchpoints
            set group_id = ${groupId}::uuid, updated_at = now()
            where id = any(${input.touchpointIds}::uuid[]) and workspace_id = ${workspaceId}::uuid
              and status <> 'retired' and kind <> 'link'
            returning id
          `;
          if (moved.length !== input.touchpointIds.length) {
            throw new NotFoundError("Touchpoint was not found.");
          }
          // Inside another group, they receive what the nearest group serves.
          await propagateGroupExperience(tx, {
            workspaceId,
            touchpointIds: moved.map((row) => row.id),
            createdBy: identity.subject,
          });
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint_group.created",
          targetType: "touchpoint_group",
          targetId: groupId,
          result: "succeeded",
          metadata: {
            name: input.name,
            ...(input.parentId ? { parentId: input.parentId } : {}),
            kind: input.kind ?? "group",
          },
        });
        const row = await fetchGroupById(tx, workspaceId, groupId);
        if (!row) {
          throw new TouchpointGroupRepositoryError("Group was not created.");
        }
        return toGroup(row);
      });
    },
    async updateGroup(identity, workspaceId, groupId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const current = await tx<{ parent_id: string | null }[]>`
          select parent_id from kardo_core.touchpoint_groups
          where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        if (!current[0]) throw new NotFoundError("Group was not found.");
        const nextParent =
          input.parentId === undefined ? current[0].parent_id : input.parentId;
        const moving = nextParent !== current[0].parent_id;
        if (moving && nextParent)
          await assertGroupExists(
            tx,
            workspaceId,
            nextParent,
            "Parent group was not found.",
          );
        await runCatchingGroupErrors(
          tx`
            update kardo_core.touchpoint_groups
            set name = ${input.name},
                description = ${input.description ?? null},
                parent_id = ${nextParent},
                kind = ${input.kind ?? tx`kind`},
                updated_at = now()
            where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          `,
        );
        // Moved with its whole tree: its Touchpoints now sit under other
        // groups and receive what the nearest serving group serves.
        if (moving) {
          await propagateGroupExperience(tx, {
            workspaceId,
            touchpointIds: await touchpointsInTree(tx, workspaceId, groupId),
            createdBy: identity.subject,
          });
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: moving
            ? "touchpoint_group.moved"
            : "touchpoint_group.updated",
          targetType: "touchpoint_group",
          targetId: groupId,
          result: "succeeded",
          metadata: {
            name: input.name,
            ...(moving ? { parentId: nextParent } : {}),
            ...(input.kind ? { kind: input.kind } : {}),
          },
        });
        const row = await fetchGroupById(tx, workspaceId, groupId);
        if (!row) throw new NotFoundError("Group was not found.");
        return toGroup(row);
      });
    },
    async setGroupTouchpoints(identity, workspaceId, groupId, touchpointIds) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const existing = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoint_groups
          where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        if (!existing[0]) throw new NotFoundError("Group was not found.");

        const idsArray = [...touchpointIds];
        const previous = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoints
          where group_id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        const alreadyInGroup = new Set(previous.map((row) => row.id));
        await tx`
          update kardo_core.touchpoints
          set group_id = null, updated_at = now()
          where group_id = ${groupId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and not (id = any(${idsArray}::uuid[]))
        `;
        if (idsArray.length > 0) {
          const moved = await tx<{ id: string }[]>`
            update kardo_core.touchpoints
            set group_id = ${groupId}::uuid, updated_at = now()
            where id = any(${idsArray}::uuid[]) and workspace_id = ${workspaceId}::uuid
              and status <> 'retired' and kind <> 'link'
            returning id
          `;
          if (moved.length !== idsArray.length) {
            throw new NotFoundError("Touchpoint was not found.");
          }
          // Touchpoints that just joined receive what the group serves.
          await propagateGroupExperience(tx, {
            workspaceId,
            touchpointIds: idsArray.filter((id) => !alreadyInGroup.has(id)),
            createdBy: identity.subject,
          });
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint_group.touchpoints_set",
          targetType: "touchpoint_group",
          targetId: groupId,
          result: "succeeded",
          metadata: { count: idsArray.length },
        });
        const row = await fetchGroupById(tx, workspaceId, groupId);
        if (!row) throw new NotFoundError("Group was not found.");
        return toGroup(row);
      });
    },
    async moveTouchpoints(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const groupId = input.groupId;
        if (groupId) {
          const existing = await tx<{ id: string }[]>`
            select id from kardo_core.touchpoint_groups
            where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          `;
          if (!existing[0]) throw new NotFoundError("Group was not found.");
        }
        const ids = [...new Set(input.touchpointIds)];
        // Retired Touchpoints are withdrawn and Links are not physical: neither
        // belongs to a group, so asking to move one is a not-found.
        const current = await tx<{ id: string; group_id: string | null }[]>`
          select id, group_id from kardo_core.touchpoints
          where id = any(${ids}::uuid[]) and workspace_id = ${workspaceId}::uuid
            and status <> 'retired' and kind <> 'link'
          for update
        `;
        if (current.length !== ids.length) {
          throw new NotFoundError("Touchpoint was not found.");
        }
        const changing = current
          .filter((row) => row.group_id !== groupId)
          .map((row) => row.id);
        if (changing.length > 0) {
          await tx`
            update kardo_core.touchpoints
            set group_id = ${groupId ? tx`${groupId}::uuid` : null}, updated_at = now()
            where id = any(${changing}::uuid[]) and workspace_id = ${workspaceId}::uuid
          `;
        }
        // Joining a group means receiving what it serves; leaving keeps the
        // current content (same rule as editing one Touchpoint's group).
        const propagatedPublications =
          groupId && changing.length > 0
            ? await propagateGroupExperience(tx, {
                workspaceId,
                touchpointIds: changing,
                createdBy: identity.subject,
              })
            : 0;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: groupId
            ? "touchpoint_group.touchpoints_moved_in"
            : "touchpoint_group.touchpoints_moved_out",
          targetType: groupId ? "touchpoint_group" : "workspace",
          targetId: groupId ?? workspaceId,
          result: "succeeded",
          metadata: { count: changing.length },
        });
        return { moved: changing.length, propagatedPublications };
      });
    },
    async deleteGroup(identity, workspaceId, groupId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const current = await tx<{ parent_id: string | null }[]>`
          select parent_id from kardo_core.touchpoint_groups
          where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        if (!current[0]) throw new NotFoundError("Group was not found.");
        await preserveGroupTargetsBeforeDelete(tx, workspaceId, groupId);
        // Its Touchpoints and subgroups move up to its parent (top level when
        // it had none). What they show does not change (ADR 021).
        const parentId = current[0].parent_id;
        await tx`
          update kardo_core.touchpoints
          set group_id = ${parentId}, updated_at = now()
          where group_id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        await runCatchingGroupErrors(
          tx`
            update kardo_core.touchpoint_groups
            set parent_id = ${parentId}, updated_at = now()
            where parent_id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          `,
          {
            code: "GROUP_CHILD_NAME_TAKEN",
            message:
              "A subgroup has the same name as a group where it would move up.",
          },
        );
        await tx`
          delete from kardo_core.touchpoint_groups
          where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint_group.deleted",
          targetType: "touchpoint_group",
          targetId: groupId,
          result: "succeeded",
        });
      });
    },
  };
}

function toGroup(row: GroupRow): TouchpointGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    touchpointCount: row.touchpoint_count,
    totalTouchpointCount: row.total_touchpoint_count,
    parentId: row.parent_id,
    kind: row.kind,
    servedExperience: row.served_experience_id
      ? { id: row.served_experience_id, name: row.served_experience_name ?? "" }
      : null,
    qrTemplateId: row.qr_template_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
