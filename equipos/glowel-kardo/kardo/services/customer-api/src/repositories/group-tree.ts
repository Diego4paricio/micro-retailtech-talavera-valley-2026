import type { Sql } from "postgres";

/**
 * Nested groups (ADR 021). A group's `path` is its chain root → group, so a
 * Touchpoint is "in the tree of G" when G is in its group's path, and the
 * distance from G is how many levels up G sits (its own group is 1).
 */

/** Most levels a group tree can have (the database enforces it too). */
export const GROUP_MAX_DEPTH = 4;

/**
 * The Touchpoints one Experience target `et` reaches, with the distance of
 * that reach: 0 for a direct target, 1 for a Touchpoint in the targeted
 * group, 2 for one in a child group, and so on down its tree. Used right
 * after `from kardo_core.experience_targets et`; it joins `reach`
 * (`touchpoint_id`, `distance`) and `t` (the Touchpoint).
 */
export function reachedTouchpoints(tx: Sql) {
  return tx`
    join lateral (
      select et.touchpoint_id as touchpoint_id, 0 as distance
      where et.touchpoint_id is not null
      union all
      select member.id,
             cardinality(member_group.path) - array_position(member_group.path, et.group_id) + 1
      from kardo_core.touchpoint_groups member_group
      join kardo_core.touchpoints member on member.group_id = member_group.id
      where et.group_id is not null
        and member_group.workspace_id = et.workspace_id
        and member_group.path @> array[et.group_id]
    ) reach on true
    join kardo_core.touchpoints t on t.id = reach.touchpoint_id
  `;
}
