import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  ConflictError,
  NotFoundError,
  WorkspaceAccessError,
} from "../src/errors.js";
import {
  createPostgresTouchpointGroupRepository,
  type TouchpointGroupRepository,
} from "../src/repositories/groups.js";
import {
  authHeader,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const groupId = "7b8c9d0e-1f20-4a3b-8c4d-5e6f7a8b9c0d";

const group = {
  id: groupId,
  name: "Mesas terraza",
  description: null,
  touchpointCount: 2,
  createdAt: "2026-09-24T00:00:00.000Z",
};

describe("touchpoint group routes", () => {
  it("lets any member list groups", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: async () => [group],
        createGroup: async () => {
          throw new Error("not used");
        },
        updateGroup: async () => {
          throw new Error("not used");
        },
        setGroupTouchpoints: async () => {
          throw new Error("not used");
        },
        moveTouchpoints: async () => {
          throw new Error("not used");
        },
        deleteGroup: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("rejects a viewer creating a group (touchpoints.manage required)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: async () => {
          throw new Error("not used");
        },
        createGroup: async () => {
          throw new WorkspaceAccessError();
        },
        updateGroup: async () => {
          throw new Error("not used");
        },
        setGroupTouchpoints: async () => {
          throw new Error("not used");
        },
        moveTouchpoints: async () => {
          throw new Error("not used");
        },
        deleteGroup: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups`,
      headers: authHeader,
      payload: { name: "Mesas terraza" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns 409 GROUP_NAME_TAKEN for a duplicate name", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: async () => {
          throw new Error("not used");
        },
        createGroup: async () => {
          throw new ConflictError(
            "GROUP_NAME_TAKEN",
            "A group with that name already exists in this workspace.",
          );
        },
        updateGroup: async () => {
          throw new Error("not used");
        },
        setGroupTouchpoints: async () => {
          throw new Error("not used");
        },
        moveTouchpoints: async () => {
          throw new Error("not used");
        },
        deleteGroup: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups`,
      headers: authHeader,
      payload: { name: "Mesas terraza" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("GROUP_NAME_TAKEN");
    await app.close();
  });

  it("replaces a group's Touchpoint membership", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: async () => {
          throw new Error("not used");
        },
        createGroup: async () => {
          throw new Error("not used");
        },
        updateGroup: async () => {
          throw new Error("not used");
        },
        setGroupTouchpoints: async (_identity, _wsId, gId, touchpointIds) => {
          expect(gId).toBe(groupId);
          expect(touchpointIds).toEqual([touchpointId]);
          return { ...group, touchpointCount: 1 };
        },
        moveTouchpoints: async () => {
          throw new Error("not used");
        },
        deleteGroup: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups/${groupId}/touchpoints`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ touchpointCount: 1 });
    await app.close();
  });

  it("deletes a group and returns 404 when it does not exist", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: async () => {
          throw new Error("not used");
        },
        createGroup: async () => {
          throw new Error("not used");
        },
        updateGroup: async () => {
          throw new Error("not used");
        },
        setGroupTouchpoints: async () => {
          throw new Error("not used");
        },
        moveTouchpoints: async () => {
          throw new Error("not used");
        },
        deleteGroup: async () => {
          throw new NotFoundError("Group was not found.");
        },
      },
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups/${groupId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("moving Touchpoints between groups", () => {
  const otherTouchpointId = "5e6f7081-92a3-4b4c-8d5e-6f708192a3b4";

  function appWithMove(
    moveTouchpoints: TouchpointGroupRepository["moveTouchpoints"],
    publisherKick: () => void = () => undefined,
  ) {
    const notUsed = async () => {
      throw new Error("not used");
    };
    return buildCustomerApi({
      sessionVerifier: verifierFor(),
      publisherKick,
      groupRepository: {
        listGroups: notUsed,
        createGroup: notUsed,
        updateGroup: notUsed,
        setGroupTouchpoints: notUsed,
        moveTouchpoints,
        deleteGroup: notUsed,
      },
    });
  }

  it("moves the chosen Touchpoints into a group and wakes the publisher when it propagated", async () => {
    let kicked = 0;
    const app = appWithMove(
      async (_identity, wsId, input) => {
        expect(wsId).toBe(workspaceId);
        expect(input).toEqual({
          touchpointIds: [touchpointId, otherTouchpointId],
          groupId,
        });
        return { moved: 2, propagatedPublications: 2 };
      },
      () => {
        kicked += 1;
      },
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/move`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId, otherTouchpointId], groupId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ moved: 2, propagatedPublications: 2 });
    expect(kicked).toBe(1);
    await app.close();
  });

  it("takes Touchpoints out of their group with groupId null, without waking the publisher", async () => {
    let kicked = 0;
    const app = appWithMove(
      async (_identity, _wsId, input) => {
        expect(input.groupId).toBeNull();
        return { moved: 1, propagatedPublications: 0 };
      },
      () => {
        kicked += 1;
      },
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/move`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId], groupId: null },
    });
    expect(response.statusCode).toBe(200);
    expect(kicked).toBe(0);
    await app.close();
  });

  it("refuses an empty selection, a missing groupId and extra fields", async () => {
    const app = appWithMove(async () => {
      throw new Error("must not reach the repository");
    });
    for (const payload of [
      { touchpointIds: [], groupId },
      { touchpointIds: [touchpointId] },
      { touchpointIds: ["not-a-uuid"], groupId },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/touchpoints/move`,
        headers: authHeader,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it("returns 403 for a member without touchpoints.manage and 404 for an unknown group or Touchpoint", async () => {
    const denied = appWithMove(async () => {
      throw new WorkspaceAccessError();
    });
    const forbidden = await denied.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/move`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId], groupId },
    });
    expect(forbidden.statusCode).toBe(403);
    await denied.close();

    const missing = appWithMove(async () => {
      throw new NotFoundError("Touchpoint was not found.");
    });
    const notFound = await missing.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/move`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId], groupId },
    });
    expect(notFound.statusCode).toBe(404);
    await missing.close();
  });
});

describe("nested groups (ADR 021)", () => {
  const parentId = "5e6f7081-92a3-4b4c-8d5e-6f708192a3b4";

  function appWith(overrides: Partial<TouchpointGroupRepository>) {
    const notUsed = async () => {
      throw new Error("not used");
    };
    return buildCustomerApi({
      sessionVerifier: verifierFor(),
      groupRepository: {
        listGroups: notUsed,
        createGroup: notUsed,
        updateGroup: notUsed,
        setGroupTouchpoints: notUsed,
        moveTouchpoints: notUsed,
        deleteGroup: notUsed,
        ...overrides,
      },
    });
  }

  it("creates a group inside another one, as a Local or a Grupo", async () => {
    const app = appWith({
      createGroup: async (_identity, _wsId, input) => {
        expect(input).toEqual({ name: "Terraza", parentId, kind: "group" });
        return { ...group, name: "Terraza", parentId, kind: "group" };
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups`,
      headers: authHeader,
      payload: { name: "Terraza", parentId, kind: "group" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ parentId, kind: "group" });
    await app.close();
  });

  it("moves a group to another parent, or to the top level with null", async () => {
    const seen: unknown[] = [];
    const app = appWith({
      updateGroup: async (_identity, _wsId, _groupId, input) => {
        seen.push(input.parentId);
        return { ...group, parentId: input.parentId ?? null };
      },
    });
    for (const next of [parentId, null]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/touchpoint-groups/${groupId}`,
        headers: authHeader,
        payload: { name: "Mesas terraza", parentId: next },
      });
      expect(response.statusCode).toBe(200);
    }
    expect(seen).toEqual([parentId, null]);
    await app.close();
  });

  it("refuses an unknown kind", async () => {
    const app = appWith({});
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups`,
      headers: authHeader,
      payload: { name: "Terraza", kind: "zona" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it.each([
    ["GROUP_TOO_DEEP", "Groups can nest up to 4 levels."],
    [
      "GROUP_CYCLE",
      "A group cannot go inside itself or one of its own subgroups.",
    ],
    [
      "GROUP_CHILD_NAME_TAKEN",
      "A subgroup has the same name as a group where it would move up.",
    ],
  ] as const)("answers 409 %s", async (code, message) => {
    const app = appWith({
      updateGroup: async () => {
        throw new ConflictError(code, message);
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoint-groups/${groupId}`,
      headers: authHeader,
      payload: { name: "Mesas terraza", parentId },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(code);
    await app.close();
  });
});

describe("deleting a group preserves its pages' live destinations (A9-13)", () => {
  const identity = { subject: subjectId, email: "owner@kardo.test" };

  /** A fake postgres.js transaction: membership is «owner», the plan is
   * active, the group exists with no parent, and every other statement
   * (including the preserving insert itself) just records its text. */
  function fakeSql() {
    const calls: string[] = [];
    const tx = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const text = strings.join("?");
        calls.push(text);
        if (text.includes("workspace_memberships"))
          return Promise.resolve([{ role: "owner" }]);
        if (text.includes("kardo_billing.workspace_access"))
          return Promise.resolve([{ state: "active" }]);
        if (text.includes("select parent_id from kardo_core.touchpoint_groups"))
          return Promise.resolve([{ parent_id: null }]);
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    const sql = Object.assign(tx, {
      begin: (action: (transaction: unknown) => Promise<unknown>) => action(tx),
    }) as unknown as Sql;
    return { sql, calls };
  }

  it("adds direct targets for the group's whole tree before reparenting or deleting it", async () => {
    const { sql, calls } = fakeSql();
    const repository = createPostgresTouchpointGroupRepository(sql);
    await repository.deleteGroup(identity, workspaceId, groupId);

    const insertIndex = calls.findIndex((text) =>
      text.includes("insert into kardo_core.experience_targets"),
    );
    const reparentTouchpointsIndex = calls.findIndex(
      (text) =>
        text.includes("update kardo_core.touchpoints") &&
        text.includes("set group_id ="),
    );
    const deleteGroupIndex = calls.findIndex((text) =>
      text.includes("delete from kardo_core.touchpoint_groups"),
    );
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeLessThan(reparentTouchpointsIndex);
    expect(insertIndex).toBeLessThan(deleteGroupIndex);

    const insertQuery = calls[insertIndex] ?? "";
    // Only the deleted group's own targeting pages, only touchpoints of its
    // whole tree, only while actually live, never a duplicate target.
    expect(insertQuery).toContain("et.group_id = ");
    expect(insertQuery).toContain("e.archived_at is null");
    expect(insertQuery).toContain("tree.path @> array[et.group_id]");
    expect(insertQuery).toContain("p.status = 'published'");
    expect(insertQuery).toContain("p.superseded_at is null");
    expect(insertQuery).toContain("on conflict (experience_id, touchpoint_id)");
  });
});
