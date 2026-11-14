import type { Touchpoint, TouchpointGroup } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  planPublication,
  resolveTargetTouchpoints,
  targetDistance,
} from "../src/features/experiences/targets.js";
import {
  buildGroupTree,
  flattenGroupTree,
  groupPathLabel,
  indentedName,
  memberCount,
  nearestServedName,
  parentChoices,
  siblingNamed,
  treeHeight,
  treeIds,
} from "../src/features/touchpoints/group-tree.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const group = (
  n: number,
  name: string,
  parent: number | null,
  extra: Partial<TouchpointGroup> = {},
): TouchpointGroup => ({
  id: id(n),
  name,
  description: null,
  touchpointCount: 0,
  parentId: parent === null ? null : id(parent),
  kind: parent === null ? "location" : "group",
  ...extra,
});

// Local Centro › Terraza › Mesa 12; Local Norte.
const groups = [
  group(1, "Local Centro", null),
  group(2, "Terraza", 1),
  group(3, "Mesa 12", 2),
  group(4, "Local Norte", null),
];

const touchpoint = (
  n: number,
  groupNumber: number | null,
  live?: string,
): Touchpoint =>
  ({
    id: id(100 + n),
    publicId: `public${n}`,
    operationalName: `TP ${n}`,
    kind: "qr",
    status: "active",
    groupId: groupNumber === null ? null : id(groupNumber),
    live: live
      ? {
          experienceId: id(500 + Number(live)),
          experienceName: `Exp ${live}`,
          experienceType: "menu",
          revision: 1,
          publishedAt: "2026-10-02T00:00:00.000Z",
        }
      : null,
  }) as Touchpoint;

describe("group tree (ADR 021)", () => {
  it("builds the tree and flattens it parents first", () => {
    const tree = buildGroupTree(groups);
    expect(tree.map((node) => node.group.name)).toEqual([
      "Local Centro",
      "Local Norte",
    ]);
    expect(tree[0]?.children[0]?.children[0]?.group.name).toBe("Mesa 12");
    expect(
      flattenGroupTree(groups).map(
        ({ group, depth }) => `${depth}:${group.name}`,
      ),
    ).toEqual(["1:Local Centro", "2:Terraza", "3:Mesa 12", "1:Local Norte"]);
  });

  it("shows a group whose parent is missing at the top level", () => {
    const orphan = group(9, "Huérfano", 77);
    expect(
      buildGroupTree([...groups, orphan]).map((node) => node.group.name),
    ).toContain("Huérfano");
  });

  it("names the path, the tree and its height", () => {
    expect(groupPathLabel(groups, id(3))).toBe(
      "Local Centro › Terraza › Mesa 12",
    );
    expect([...treeIds(groups, id(1))].sort()).toEqual(
      [id(1), id(2), id(3)].sort(),
    );
    expect(treeHeight(groups, id(1))).toBe(3);
    expect(treeHeight(groups, id(3))).toBe(1);
    expect(indentedName("Mesa 12", 3)).toBe("  ↳ Mesa 12");
    expect(indentedName("Local Centro", 1)).toBe("Local Centro");
  });

  it("never offers a group inside itself, its subgroups or past 4 levels", () => {
    const forTerraza = parentChoices(groups, id(2)).map(
      ({ group }) => group.name,
    );
    expect(forTerraza).toEqual(["Local Centro", "Local Norte"]);
    // A new group can go anywhere above level 4.
    expect(parentChoices(groups, null).map(({ group }) => group.name)).toEqual([
      "Local Centro",
      "Terraza",
      "Mesa 12",
      "Local Norte",
    ]);
    // Local Centro's tree is 3 levels: it can only go under a top-level group.
    expect(parentChoices(groups, id(1)).map(({ group }) => group.name)).toEqual(
      ["Local Norte"],
    );
  });

  it("finds a sibling by name, ignoring case and spaces", () => {
    expect(siblingNamed(groups, id(1), " terraza ")?.id).toBe(id(2));
    expect(siblingNamed(groups, id(4), "Terraza")).toBeUndefined();
    expect(siblingNamed(groups, null, "local norte")?.id).toBe(id(4));
  });

  it("what a joining Touchpoint receives comes from the nearest serving group", () => {
    const served = [
      group(1, "Local Centro", null, {
        servedExperience: { id: id(501), name: "Menú general" },
      }),
      group(2, "Terraza", 1),
      group(3, "Mesa 12", 2),
    ];
    expect(nearestServedName(served, id(3))).toBe("Menú general");
    const closer = served.map((item) =>
      item.id === id(2)
        ? { ...item, servedExperience: { id: id(502), name: "Menú terraza" } }
        : item,
    );
    expect(nearestServedName(closer, id(3))).toBe("Menú terraza");
  });
});

describe("targets reach the whole tree, and the closest wins", () => {
  const mesa = touchpoint(1, 3, "2"); // in Mesa 12, live with Exp 2
  const terraza = touchpoint(2, 2, "2");
  const mostrador = touchpoint(3, 1, "1");
  const norte = touchpoint(4, 4);

  it("measures the distance level by level", () => {
    const onLocal = { touchpointIds: [], groupIds: [id(1)] };
    expect(targetDistance(onLocal, mesa, groups)).toBe(3);
    expect(targetDistance(onLocal, terraza, groups)).toBe(2);
    expect(targetDistance(onLocal, mostrador, groups)).toBe(1);
    expect(targetDistance(onLocal, norte, groups)).toBeNull();
    expect(
      targetDistance(
        { touchpointIds: [mesa.id], groupIds: [id(1)] },
        mesa,
        groups,
      ),
    ).toBe(0);
  });

  it("a group target includes its subgroups", () => {
    expect(
      resolveTargetTouchpoints(
        { touchpointIds: [], groupIds: [id(1)] },
        [mesa, terraza, mostrador, norte],
        groups,
      ).map((item) => item.id),
    ).toEqual([mesa.id, terraza.id, mostrador.id]);
  });

  it("publishing on the local skips what a nearer group keeps", () => {
    const experiences = [
      {
        id: id(501),
        touchpointId: null,
        targets: { touchpointIds: [], groupIds: [id(1)] },
      },
      {
        id: id(502),
        touchpointId: null,
        targets: { touchpointIds: [], groupIds: [id(2)] },
      },
    ];
    const plan = planPublication({
      experienceId: id(501),
      targets: { touchpointIds: [], groupIds: [id(1)] },
      touchpoints: [mesa, terraza, mostrador],
      experiences,
      groups,
    });
    expect(plan.skipped.map((item) => item.touchpoint.id).sort()).toEqual(
      [mesa.id, terraza.id].sort(),
    );
    expect(plan.publishable.map((item) => item.touchpoint.id)).toEqual([
      mostrador.id,
    ]);

    // Publishing on Terraza itself takes them (same distance as its owner).
    const onTerraza = planPublication({
      experienceId: id(503),
      targets: { touchpointIds: [], groupIds: [id(2)] },
      touchpoints: [mesa, terraza],
      experiences,
      groups,
    });
    expect(onTerraza.skipped).toEqual([]);
  });
});

describe("memberCount", () => {
  it("counts the whole subtree when the server sent it (A9-14)", () => {
    expect(memberCount({ touchpointCount: 2, totalTouchpointCount: 5 })).toBe(
      5,
    );
  });

  it("falls back to the direct count otherwise", () => {
    expect(
      memberCount({ touchpointCount: 2, totalTouchpointCount: undefined }),
    ).toBe(2);
  });
});
