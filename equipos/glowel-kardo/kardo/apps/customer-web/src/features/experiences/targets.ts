import type {
  ExperienceSummary,
  ExperienceTargets,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import { groupChain } from "../touchpoints/group-tree.js";

/** Enough of a group to walk the tree (ADR 021: groups nest). */
type TreeGroup = Pick<TouchpointGroup, "id" | "name"> &
  Partial<Pick<TouchpointGroup, "parentId">>;

/**
 * Pure target rules shared by the picker, the publish dialog and the list.
 * They mirror how the server resolves an Experience's targets.
 */

export const emptyTargets: ExperienceTargets = {
  touchpointIds: [],
  groupIds: [],
};

/**
 * How close `targets` reach a Touchpoint, as the server measures it: 0 when
 * it is a direct target, 1 through its own group, 2 through the group above,
 * and so on (groups nest, ADR 021); null when they do not reach it. Without
 * `groups` only its own group counts.
 */
export function targetDistance(
  targets: ExperienceTargets,
  touchpoint: Pick<Touchpoint, "id" | "groupId">,
  groups: readonly TreeGroup[] = [],
): number | null {
  if (targets.touchpointIds.includes(touchpoint.id)) return 0;
  if (!touchpoint.groupId) return null;
  const chain = groupChain(groups, touchpoint.groupId);
  if (!chain.length)
    return targets.groupIds.includes(touchpoint.groupId) ? 1 : null;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const group = chain[index];
    if (group && targets.groupIds.includes(group.id))
      return chain.length - index;
  }
  return null;
}

/**
 * Expands groups (with their whole tree) into Touchpoints, the same way the
 * server resolves them. Links are Touchpoints too (owner, 2026-10-04): they
 * are only ever picked one by one, since they never belong to a group.
 */
export function resolveTargetTouchpoints(
  targets: ExperienceTargets,
  touchpoints: readonly Touchpoint[],
  groups: readonly TreeGroup[] = [],
): Touchpoint[] {
  return touchpoints.filter(
    (touchpoint) =>
      touchpoint.status !== "retired" &&
      targetDistance(targets, touchpoint, groups) !== null,
  );
}

/** What a Touchpoint joining `groupId` receives automatically. The server
 * computes it with the same rule it applies when propagating (a member that
 * keeps a direct assignment does not count). */
export function groupLiveExperienceName(
  groupId: string,
  groups: readonly TouchpointGroup[],
): string | null {
  return (
    groups.find((group) => group.id === groupId)?.servedExperience?.name ?? null
  );
}

export function sameTargets(
  a: ExperienceTargets,
  b: ExperienceTargets,
): boolean {
  const key = (value: ExperienceTargets) =>
    `${[...value.touchpointIds].sort().join(",")}|${[...value.groupIds].sort().join(",")}`;
  return key(a) === key(b);
}

/** Targets of a stored Experience, falling back to the legacy single Touchpoint. */
export function experienceTargetsOf(experience: {
  targets?: ExperienceTargets | undefined;
  touchpointId: string | null;
}): ExperienceTargets {
  if (experience.targets) return experience.targets;
  return {
    touchpointIds: experience.touchpointId ? [experience.touchpointId] : [],
    groupIds: [],
  };
}

export function experienceTargetsTouchpoint(
  experience: {
    targets?: ExperienceTargets | undefined;
    touchpointId: string | null;
  },
  touchpoint: Touchpoint,
  groups: readonly TreeGroup[] = [],
): boolean {
  return (
    targetDistance(experienceTargetsOf(experience), touchpoint, groups) !== null
  );
}

export function hasAnyTarget(targets: ExperienceTargets): boolean {
  return targets.touchpointIds.length > 0 || targets.groupIds.length > 0;
}

/** Short human summary: "Mesa 4", "Local Centro", "Local Centro + 2 touchpoints". */
export function describeTargets(
  targets: ExperienceTargets,
  touchpoints: readonly Touchpoint[],
  groups: readonly TouchpointGroup[],
): string {
  const groupNames = targets.groupIds
    .map((id) => groups.find((group) => group.id === id)?.name)
    .filter(Boolean) as string[];
  const touchpointNames = targets.touchpointIds
    .map(
      (id) =>
        touchpoints.find((touchpoint) => touchpoint.id === id)?.operationalName,
    )
    .filter(Boolean) as string[];
  const parts = [...groupNames];
  if (touchpointNames.length === 1 && !groupNames.length)
    parts.push(touchpointNames[0] ?? "");
  else if (touchpointNames.length)
    parts.push(
      touchpointNames.length === 1
        ? "1 QR o etiqueta"
        : `${touchpointNames.length} QR y etiquetas`,
    );
  return parts.join(" + ") || "Sin dónde se ve";
}

export type PublicationPlanEntry = {
  touchpoint: Touchpoint;
  /** How this Experience reaches the Touchpoint. A direct target wins. */
  via: "touchpoint" | "group";
  /** What it shows now when that is another Experience. */
  replacing: string | null;
};

export type PublicationPlan = {
  /** Touchpoints that will show this Experience once it is published. */
  publishable: PublicationPlanEntry[];
  /**
   * Another live Experience reaches them from closer (directly, or through a
   * nearer group): the closest wins, they are skipped.
   */
  skipped: { touchpoint: Touchpoint; keeps: string }[];
  /** Publishable Touchpoints that are paused and stay blocked. */
  paused: number;
};

/**
 * What publishing `targets` would do, mirroring the server's precedence rule
 * (`splitByPrecedence`): the closest wins — a direct assignment beats a
 * group, and a nearer group beats one further up (ADR 021).
 */
export function planPublication(input: {
  experienceId: string | null;
  targets: ExperienceTargets;
  touchpoints: readonly Touchpoint[];
  experiences: readonly Pick<
    ExperienceSummary,
    "id" | "targets" | "touchpointId"
  >[];
  groups?: readonly TreeGroup[] | undefined;
}): PublicationPlan {
  const groups = input.groups ?? [];
  const plan: PublicationPlan = { publishable: [], skipped: [], paused: 0 };
  for (const touchpoint of resolveTargetTouchpoints(
    input.targets,
    input.touchpoints,
    groups,
  )) {
    const distance = targetDistance(input.targets, touchpoint, groups) ?? 0;
    const via = distance === 0 ? "touchpoint" : "group";
    const live = touchpoint.live ?? null;
    const liveIsOther = Boolean(
      live && live.experienceId !== input.experienceId,
    );
    if (distance > 0 && live && liveIsOther) {
      const liveExperience = input.experiences.find(
        (item) => item.id === live.experienceId,
      );
      const liveDistance = liveExperience
        ? targetDistance(
            experienceTargetsOf(liveExperience),
            touchpoint,
            groups,
          )
        : null;
      if (liveDistance !== null && liveDistance < distance) {
        plan.skipped.push({ touchpoint, keeps: live.experienceName });
        continue;
      }
    }
    plan.publishable.push({
      touchpoint,
      via,
      replacing: live && liveIsOther ? live.experienceName : null,
    });
    if (touchpoint.status === "paused") plan.paused += 1;
  }
  return plan;
}

/**
 * Where each page shows today, in the owner's words (domain audit A9-8):
 * «/menu» for a link and the name of a QR or tag, plus how many more. Read
 * from what each place shows live, not from the page's targets, so a QR and
 * a link say the same when choosing what they show.
 */
export function experiencePlaces(
  touchpoints: readonly Pick<
    Touchpoint,
    "kind" | "slug" | "operationalName" | "status" | "live"
  >[],
): Map<string, string> {
  const byExperience = new Map<string, string[]>();
  for (const touchpoint of touchpoints) {
    const experienceId = touchpoint.live?.experienceId;
    if (!experienceId || touchpoint.status === "retired") continue;
    const label =
      touchpoint.kind === "link" && touchpoint.slug
        ? `/${touchpoint.slug}`
        : touchpoint.operationalName;
    const list = byExperience.get(experienceId) ?? [];
    list.push(label);
    byExperience.set(experienceId, list);
  }
  const places = new Map<string, string>();
  for (const [experienceId, labels] of byExperience) {
    const [first, ...rest] = labels;
    if (!first) continue;
    places.set(
      experienceId,
      rest.length === 0 ? first : `${first} y ${rest.length} más`,
    );
  }
  return places;
}
