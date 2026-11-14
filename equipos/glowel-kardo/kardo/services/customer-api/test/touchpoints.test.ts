import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { WorkspaceAccessError } from "../src/errors.js";
import { createPostgresTouchpointRepository } from "../src/repositories/touchpoints.js";
import type { TouchpointAvailabilityClient } from "../src/resolver-clients/touchpoint-availability.js";
import {
  authHeader,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const baseTouchpoint = {
  id: touchpointId,
  publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
  operationalName: "Tarjeta de bienvenida",
  physicalType: "card" as const,
  status: "active" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  live: null,
};

describe("touchpoint routes", () => {
  it("creates a Touchpoint only for the verified workspace member", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: {
        listTouchpoints: async () => [],
        createTouchpoint: async (identity, id, input) => {
          expect(identity.subject).toBe(subjectId);
          expect(id).toBe(workspaceId);
          expect(input).toEqual({
            operationalName: "Tarjeta de bienvenida",
            physicalType: "card",
          });
          return { ...baseTouchpoint, status: "assigned" };
        },
        updateTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpointStatus: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
      payload: {
        operationalName: "Tarjeta de bienvenida",
        physicalType: "card",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "assigned" });
    await app.close();
  });

  it("does not create a Touchpoint in a workspace the verified customer cannot access", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: {
        listTouchpoints: async () => [],
        createTouchpoint: async () => {
          throw new WorkspaceAccessError();
        },
        updateTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpointStatus: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
      payload: { operationalName: "No autorizado", physicalType: "card" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("WORKSPACE_ACCESS_DENIED");
    await app.close();
  });

  it("lists Touchpoints including createdAt and the live Experience", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: {
        listTouchpoints: async () => [
          {
            ...baseTouchpoint,
            live: {
              experienceId: "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22",
              experienceName: "Menú",
              experienceType: "menu",
              revision: 3,
              publishedAt: "2026-09-10T00:00:00.000Z",
            },
          },
        ],
        createTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpointStatus: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      createdAt: "2026-09-01T00:00:00.000Z",
      live: { revision: 3, experienceType: "menu" },
    });
    await app.close();
  });

  it("checks touchpoints.manage before ever calling the Resolver to pause a Touchpoint", async () => {
    const resolverCall = vi.fn();
    const resolver: TouchpointAvailabilityClient = {
      setAvailability: async (input) => {
        resolverCall(input);
      },
    };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointAvailability: resolver,
      touchpointRepository: {
        listTouchpoints: async () => {
          throw new Error("not used");
        },
        createTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpoint: async () => {
          throw new Error("not used");
        },
        // A real repository checks `touchpoints.manage` before touching the
        // resolver. This fake simulates a viewer being rejected the same way.
        updateTouchpointStatus: async () => {
          throw new WorkspaceAccessError();
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/status`,
      headers: authHeader,
      payload: { status: "paused" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("WORKSPACE_ACCESS_DENIED");
    expect(resolverCall).not.toHaveBeenCalled();
    await app.close();
  });

  it("pauses a Touchpoint and calls the Resolver when authorized", async () => {
    const resolverCall = vi.fn();
    const resolver: TouchpointAvailabilityClient = {
      setAvailability: async (input) => {
        resolverCall(input);
      },
    };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointAvailability: resolver,
      touchpointRepository: {
        listTouchpoints: async () => {
          throw new Error("not used");
        },
        createTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpointStatus: async (
          _identity,
          _id,
          _tpId,
          input,
          availability,
        ) => {
          await availability.setAvailability({
            publicId: baseTouchpoint.publicId,
            status: input.status,
          });
          return { ...baseTouchpoint, status: input.status };
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/status`,
      headers: authHeader,
      payload: { status: "paused" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "paused" });
    expect(resolverCall).toHaveBeenCalledWith({
      publicId: baseTouchpoint.publicId,
      status: "paused",
    });
    await app.close();
  });

  it("returns 503 when the Resolver is not configured for a status change", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/status`,
      headers: authHeader,
      payload: { status: "paused" },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("renames a Touchpoint through touchpoints.manage", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: {
        listTouchpoints: async () => {
          throw new Error("not used");
        },
        createTouchpoint: async () => {
          throw new Error("not used");
        },
        updateTouchpoint: async (_identity, _id, tpId, input) => {
          expect(tpId).toBe(touchpointId);
          return { ...baseTouchpoint, operationalName: input.operationalName };
        },
        updateTouchpointStatus: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}`,
      headers: authHeader,
      payload: { operationalName: "Nuevo nombre" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ operationalName: "Nuevo nombre" });
    await app.close();
  });
});

describe("resuming checks suspension and plan exclusion in the server (A9-11)", () => {
  const identity = { subject: subjectId, email: "owner@kardo.test" };

  function fakeResolver(): TouchpointAvailabilityClient & {
    calls: unknown[];
  } {
    const calls: unknown[] = [];
    return {
      calls,
      setAvailability: async (input) => {
        calls.push(input);
      },
      setAlias: async () => {
        throw new Error("not used");
      },
    };
  }

  /** A fake postgres.js transaction: membership is «owner», the plan is
   * active, and the row-lock read answers with the given status and the
   * suspension/plan-exclusion flags. The full Touchpoint re-read
   * (`fetchTouchpointById`) answers with a minimal, consistent row so a
   * successful call can resolve end to end. */
  function fakeSql(row: {
    status: string;
    suspended: boolean;
    planExcluded: boolean;
  }) {
    const tx = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const text = strings.join("?");
        if (text.includes("workspace_memberships"))
          return Promise.resolve([{ role: "owner" }]);
        if (text.includes("kardo_billing.workspace_access"))
          return Promise.resolve([{ state: "active" }]);
        if (text.includes("select id, public_id, status"))
          return Promise.resolve([
            {
              id: touchpointId,
              public_id: baseTouchpoint.publicId,
              status: row.status,
              suspended: row.suspended,
              plan_excluded: row.planExcluded,
            },
          ]);
        if (text.includes("set status ="))
          return Promise.resolve([{ id: touchpointId }]);
        // `fetchTouchpointById` composes two queries: `touchpointSelect`'s
        // own (unused here) and the outer one with its `where t.id =`
        // clause, whose result is what the repository actually reads.
        if (text.includes("where t.id ="))
          return Promise.resolve([
            {
              id: touchpointId,
              public_id: baseTouchpoint.publicId,
              operational_name: baseTouchpoint.operationalName,
              physical_type: "label",
              kind: "qr",
              handle: null,
              slug: null,
              slug_changed_at: null,
              status: row.status,
              group_id: null,
              created_at: new Date("2026-09-01T00:00:00.000Z"),
              suspended: row.suspended,
              plan_excluded: row.planExcluded,
              qr_last_export_at: null,
              object_prepared_at: null,
              object_tested_at: null,
              object_backup_at: null,
              object_placed_at: null,
              object_replacing_at: null,
              object_replace_ready_at: null,
              object_replace_prepared_at: null,
              object_replace_tested_at: null,
              publishing: false,
              live_experience_id: null,
              live_experience_name: null,
              live_experience_type: null,
              live_revision: null,
              live_published_at: null,
            },
          ]);
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    return Object.assign(tx, {
      begin: (action: (transaction: unknown) => Promise<unknown>) => action(tx),
    }) as unknown as Sql;
  }

  it("refuses to resume a Touchpoint Kardo suspended", async () => {
    const resolver = fakeResolver();
    const repository = createPostgresTouchpointRepository(
      fakeSql({ status: "paused", suspended: true, planExcluded: false }),
    );
    await expect(
      repository.updateTouchpointStatus(
        identity,
        workspaceId,
        touchpointId,
        { status: "active" },
        resolver,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "TOUCHPOINT_SUSPENDED" });
    expect(resolver.calls).toHaveLength(0);
  });

  it("refuses to resume a Touchpoint the plan excluded", async () => {
    const resolver = fakeResolver();
    const repository = createPostgresTouchpointRepository(
      fakeSql({ status: "paused", suspended: false, planExcluded: true }),
    );
    await expect(
      repository.updateTouchpointStatus(
        identity,
        workspaceId,
        touchpointId,
        { status: "active" },
        resolver,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TOUCHPOINT_PLAN_EXCLUDED",
    });
    expect(resolver.calls).toHaveLength(0);
  });

  it("still allows pausing a suspended or plan-excluded Touchpoint", async () => {
    const resolver = fakeResolver();
    const repository = createPostgresTouchpointRepository(
      fakeSql({ status: "active", suspended: true, planExcluded: true }),
    );
    await expect(
      repository.updateTouchpointStatus(
        identity,
        workspaceId,
        touchpointId,
        { status: "paused" },
        resolver,
      ),
    ).resolves.toMatchObject({ id: touchpointId });
    expect(resolver.calls).toEqual([
      { publicId: baseTouchpoint.publicId, status: "paused" },
    ]);
  });
});
