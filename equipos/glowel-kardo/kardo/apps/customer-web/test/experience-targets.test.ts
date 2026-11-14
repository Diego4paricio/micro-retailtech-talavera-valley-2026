import type { Touchpoint } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  describeTargets,
  hasAnyTarget,
  planPublication,
  resolveTargetTouchpoints,
  sameTargets,
} from "../src/features/experiences/targets.js";

const groupId = "7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e01";
const thisId = "11111111-1111-4111-8111-111111111111";
const directId = "22222222-2222-4222-8222-222222222222";
const groupOnlyId = "33333333-3333-4333-8333-333333333333";

function touchpoint(
  id: string,
  overrides: Partial<Touchpoint> = {},
): Touchpoint {
  return {
    id,
    publicId: `${id.replaceAll("-", "").slice(0, 16)}`,
    operationalName: `Mesa ${id.slice(0, 2)}`,
    physicalType: "card",
    kind: "nfc",
    status: "active",
    groupId,
    live: null,
    ...overrides,
  } as Touchpoint;
}

const live = (experienceId: string, experienceName: string) => ({
  experienceId,
  experienceName,
  experienceType: "menu",
  revision: 1,
  publishedAt: "2026-09-20T10:00:00.000Z",
});

describe("experience targets", () => {
  it("expands groups, skips retired Touchpoints and takes a Link picked by itself", () => {
    // Links never belong to a group (database rule); since the Links
    // redesign (owner, 2026-10-04) they are targets like any Touchpoint.
    const items = [
      touchpoint("a0000000-0000-4000-8000-000000000001"),
      touchpoint("b0000000-0000-4000-8000-000000000002", {
        kind: "link",
        groupId: null,
      }),
      touchpoint("c0000000-0000-4000-8000-000000000003", { status: "retired" }),
      touchpoint("d0000000-0000-4000-8000-000000000004", { groupId: null }),
    ];
    expect(
      resolveTargetTouchpoints(
        { touchpointIds: [], groupIds: [groupId] },
        items,
      ).map((item) => item.id),
    ).toEqual(["a0000000-0000-4000-8000-000000000001"]);
    expect(
      resolveTargetTouchpoints(
        {
          touchpointIds: ["b0000000-0000-4000-8000-000000000002"],
          groupIds: [groupId],
        },
        items,
      ).map((item) => item.id),
    ).toEqual([
      "a0000000-0000-4000-8000-000000000001",
      "b0000000-0000-4000-8000-000000000002",
    ]);
  });

  it("compares targets regardless of order and knows when there are none", () => {
    expect(
      sameTargets(
        { touchpointIds: ["b", "a"], groupIds: [] },
        { touchpointIds: ["a", "b"], groupIds: [] },
      ),
    ).toBe(true);
    expect(
      sameTargets(
        { touchpointIds: [], groupIds: ["g"] },
        { touchpointIds: [], groupIds: [] },
      ),
    ).toBe(false);
    expect(hasAnyTarget({ touchpointIds: [], groupIds: [] })).toBe(false);
    expect(describeTargets({ touchpointIds: [], groupIds: [] }, [], [])).toBe(
      "Sin dónde se ve",
    );
  });

  it("skips group members whose direct assignment is live (precedence)", () => {
    const direct = touchpoint("a0000000-0000-4000-8000-000000000001", {
      operationalName: "Mesa 1",
      live: live(directId, "Menú de barra"),
    });
    const replaced = touchpoint("b0000000-0000-4000-8000-000000000002", {
      operationalName: "Mesa 2",
      live: live(groupOnlyId, "Menú del grupo"),
    });
    const paused = touchpoint("c0000000-0000-4000-8000-000000000003", {
      operationalName: "Mesa 3",
      status: "paused",
    });
    const plan = planPublication({
      experienceId: thisId,
      targets: { touchpointIds: [], groupIds: [groupId] },
      touchpoints: [direct, replaced, paused],
      experiences: [
        {
          id: directId,
          touchpointId: direct.id,
          targets: { touchpointIds: [direct.id], groupIds: [] },
        },
        {
          id: groupOnlyId,
          touchpointId: null,
          targets: { touchpointIds: [], groupIds: [groupId] },
        },
      ],
    });
    expect(plan.skipped).toEqual([
      { touchpoint: direct, keeps: "Menú de barra" },
    ]);
    expect(
      plan.publishable.map((entry) => [
        entry.touchpoint.operationalName,
        entry.via,
        entry.replacing,
      ]),
    ).toEqual([
      ["Mesa 2", "group", "Menú del grupo"],
      ["Mesa 3", "group", null],
    ]);
    expect(plan.paused).toBe(1);
  });

  it("a direct target of this Experience always wins", () => {
    const direct = touchpoint("a0000000-0000-4000-8000-000000000001", {
      live: live(directId, "Menú de barra"),
    });
    const plan = planPublication({
      experienceId: thisId,
      targets: { touchpointIds: [direct.id], groupIds: [groupId] },
      touchpoints: [direct],
      experiences: [
        {
          id: directId,
          touchpointId: direct.id,
          targets: { touchpointIds: [direct.id], groupIds: [] },
        },
      ],
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.publishable[0]).toMatchObject({
      via: "touchpoint",
      replacing: "Menú de barra",
    });
  });

  it("does not count the Experience itself as something it replaces", () => {
    const own = touchpoint("a0000000-0000-4000-8000-000000000001", {
      live: live(thisId, "Esta"),
    });
    const plan = planPublication({
      experienceId: thisId,
      targets: { touchpointIds: [], groupIds: [groupId] },
      touchpoints: [own],
      experiences: [],
    });
    expect(plan.publishable[0]?.replacing).toBeNull();
  });
});
