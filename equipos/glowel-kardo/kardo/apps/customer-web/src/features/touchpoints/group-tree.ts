import {
  TOUCHPOINT_GROUP_MAX_DEPTH,
  type TouchpointGroup,
  type TouchpointGroupKind,
} from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";

/**
 * Groups nest (ADR 021): «Local Centro › Terraza › Mesa 12», up to
 * `TOUCHPOINT_GROUP_MAX_DEPTH` levels. Pure helpers to show and choose
 * groups as a tree; the server enforces the same rules.
 */

export const GROUP_MAX_DEPTH = TOUCHPOINT_GROUP_MAX_DEPTH;

type GroupLike = Pick<TouchpointGroup, "id" | "name"> &
  Partial<Pick<TouchpointGroup, "parentId" | "kind">>;

export type GroupNode<T extends GroupLike = TouchpointGroup> = {
  group: T;
  /** 1 for a top-level group. */
  depth: number;
  children: GroupNode<T>[];
};

export const groupKindLabels: Record<TouchpointGroupKind, string> = {
  location: "Local",
  group: "Grupo",
};

export function groupKind(group: GroupLike): TouchpointGroupKind {
  return group.kind ?? "group";
}

export function groupIcon(group: GroupLike): IconName {
  return groupKind(group) === "location" ? "location" : "group";
}

/** The tree, keeping the given order among siblings. A group whose parent
 * is missing (not loaded, or deleted meanwhile) shows at the top level. */
export function buildGroupTree<T extends GroupLike>(
  groups: readonly T[],
): GroupNode<T>[] {
  const ids = new Set(groups.map((group) => group.id));
  const byParent = new Map<string | null, T[]>();
  for (const group of groups) {
    const parent =
      group.parentId && ids.has(group.parentId) && group.parentId !== group.id
        ? group.parentId
        : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(group);
    byParent.set(parent, siblings);
  }
  const seen = new Set<string>();
  const grow = (parent: string | null, depth: number): GroupNode<T>[] =>
    (byParent.get(parent) ?? [])
      .filter((group) => !seen.has(group.id))
      .map((group) => {
        seen.add(group.id);
        return { group, depth, children: grow(group.id, depth + 1) };
      });
  return grow(null, 1);
}

/** Every group in tree order (parents before their children). */
export function flattenGroupTree<T extends GroupLike>(
  groups: readonly T[],
): { group: T; depth: number }[] {
  const out: { group: T; depth: number }[] = [];
  const walk = (nodes: GroupNode<T>[]) => {
    for (const node of nodes) {
      out.push({ group: node.group, depth: node.depth });
      walk(node.children);
    }
  };
  walk(buildGroupTree(groups));
  return out;
}

/** The group's member count including its whole subtree, when known;
 * otherwise only its direct members (A9-14: a dialog that loads
 * `touchpointCount` alone must not read it as if subgroups were included). */
export function memberCount(
  group: Pick<TouchpointGroup, "touchpointCount" | "totalTouchpointCount">,
): number {
  return group.totalTouchpointCount ?? group.touchpointCount;
}

/** A name indented by its level, for `<option>`s (which cannot be styled). */
export function indentedName(name: string, depth: number): string {
  return depth <= 1 ? name : `${" ".repeat(depth - 1)}↳ ${name}`;
}

/** The group's chain, root first (itself last). */
export function groupChain<T extends GroupLike>(
  groups: readonly T[],
  groupId: string,
): T[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const chain: T[] = [];
  let current = byId.get(groupId);
  while (current && !chain.includes(current)) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** «Local Centro › Terraza › Mesa 12». */
export function groupPathLabel(
  groups: readonly GroupLike[],
  groupId: string,
): string {
  return groupChain(groups, groupId)
    .map((group) => group.name)
    .join(" › ");
}

/** The group and every group below it. */
export function treeIds(
  groups: readonly GroupLike[],
  groupId: string,
): Set<string> {
  const ids = new Set([groupId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of groups) {
      if (group.parentId && ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Levels of the group's own tree: 1 when it has no subgroups. */
export function treeHeight(
  groups: readonly GroupLike[],
  groupId: string,
): number {
  const children = groups.filter((group) => group.parentId === groupId);
  return (
    1 + Math.max(0, ...children.map((child) => treeHeight(groups, child.id)))
  );
}

/**
 * Where a group can go: not inside itself or its own subgroups, and not so
 * deep that its tree would pass the limit. `movingId` null = a new group.
 */
export function parentChoices<T extends GroupLike>(
  groups: readonly T[],
  movingId: string | null,
): { group: T; depth: number }[] {
  const blocked = movingId ? treeIds(groups, movingId) : new Set<string>();
  const height = movingId ? treeHeight(groups, movingId) : 1;
  return flattenGroupTree(groups).filter(
    ({ group, depth }) =>
      !blocked.has(group.id) && depth + height <= GROUP_MAX_DEPTH,
  );
}

/** A group with this name right under `parentId` (case and spaces ignored). */
export function siblingNamed<T extends GroupLike>(
  groups: readonly T[],
  parentId: string | null,
  name: string,
): T | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return groups.find(
    (group) =>
      (group.parentId ?? null) === parentId &&
      group.name.trim().toLowerCase() === key,
  );
}

/**
 * What a Touchpoint joining `groupId` receives: what the nearest group of
 * its chain serves (the group itself first, then upward), as the server
 * propagates it.
 */
export function nearestServedName(
  groups: readonly (GroupLike &
    Partial<Pick<TouchpointGroup, "servedExperience">>)[],
  groupId: string,
): string | null {
  const chain = groupChain(groups, groupId);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const served = chain[index]?.servedExperience;
    if (served) return served.name;
  }
  return null;
}
