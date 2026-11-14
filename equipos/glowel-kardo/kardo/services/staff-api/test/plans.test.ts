import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { StaffConflictError, StaffNotFoundError } from "../src/http/errors.js";
import { planFixture, staffIdentity } from "./fixtures.js";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["commercial.catalog.read", "commercial.catalog.write"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

const upsertBody = {
  code: "growth",
  name: "Growth",
  isActive: true,
  entitlements: { "touchpoints.max": 25 },
};

describe("GET /v1/staff/plans", () => {
  it("returns the plan list", async () => {
    const listPlans = vi.fn().mockResolvedValue([planFixture()]);
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans,
        createPlan: async () => {
          throw new Error("not used");
        },
        updatePlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/plans",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });
});

describe("POST /v1/staff/plans", () => {
  it("creates a plan and returns 201", async () => {
    const createPlan = vi.fn().mockResolvedValue(planFixture(upsertBody));
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans: async () => {
          throw new Error("not used");
        },
        createPlan,
        updatePlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/plans",
      headers: { authorization: "Bearer staff-token" },
      payload: upsertBody,
    });
    expect(response.statusCode).toBe(201);
    expect(createPlan).toHaveBeenCalledWith(staffIdentity.subject, upsertBody);
    await app.close();
  });

  it("returns 409 for a duplicate plan code", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans: async () => {
          throw new Error("not used");
        },
        createPlan: async () => {
          throw new StaffConflictError("A plan with this code already exists.");
        },
        updatePlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/plans",
      headers: { authorization: "Bearer staff-token" },
      payload: upsertBody,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("STAFF_CONFLICT");
    await app.close();
  });

  it("rejects an invalid plan code", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/plans",
      headers: { authorization: "Bearer staff-token" },
      payload: { ...upsertBody, code: "NOT VALID" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("PUT /v1/staff/plans/:planId", () => {
  it("updates a plan", async () => {
    const planId = randomUUID();
    const updatePlan = vi
      .fn()
      .mockResolvedValue(planFixture({ id: planId, ...upsertBody }));
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans: async () => {
          throw new Error("not used");
        },
        createPlan: async () => {
          throw new Error("not used");
        },
        updatePlan,
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/staff/plans/${planId}`,
      headers: { authorization: "Bearer staff-token" },
      payload: upsertBody,
    });
    expect(response.statusCode).toBe(200);
    expect(updatePlan).toHaveBeenCalledWith(
      staffIdentity.subject,
      planId,
      upsertBody,
    );
    await app.close();
  });

  it("returns 404 for an unknown plan", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans: async () => {
          throw new Error("not used");
        },
        createPlan: async () => {
          throw new Error("not used");
        },
        updatePlan: async () => {
          throw new StaffNotFoundError();
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/staff/plans/${randomUUID()}`,
      headers: { authorization: "Bearer staff-token" },
      payload: upsertBody,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("plan entitlements keep null and false (ADR 019)", () => {
  it("does not coerce 'no limit' to 0 or a disabled feature to 0", async () => {
    const updatePlan = vi.fn().mockResolvedValue(planFixture());
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      planRepository: {
        listPlans: async () => [],
        createPlan: async () => {
          throw new Error("not used");
        },
        updatePlan,
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/staff/plans/${randomUUID()}`,
      headers: { authorization: "Bearer staff-token" },
      payload: {
        ...upsertBody,
        entitlements: {
          "touchpoints.max": null,
          "members.max": 3,
          "leads.export": false,
        },
        description: null,
        trialDays: null,
      },
    });
    expect(response.statusCode).toBe(200);
    const input = updatePlan.mock.calls[0]?.[2];
    expect(input.entitlements).toEqual({
      "touchpoints.max": null,
      "members.max": 3,
      "leads.export": false,
    });
    expect(input.description).toBeNull();
    expect(input.trialDays).toBeNull();
    await app.close();
  });
});
