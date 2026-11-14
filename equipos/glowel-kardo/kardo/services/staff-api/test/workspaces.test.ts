import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { StaffNotFoundError } from "../src/http/errors.js";
import { encodeKeysetCursor } from "../src/http/pagination.js";
import {
  staffIdentity,
  workspaceDetailFixture,
  workspaceRowFixture,
} from "./fixtures.js";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["customers.read", "commercial.catalog.write"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

describe("GET /v1/staff/workspaces", () => {
  it("returns a page and round-trips its cursor", async () => {
    const cursor = encodeKeysetCursor({
      timestamp: new Date().toISOString(),
      id: randomUUID(),
    });
    const listWorkspaces = vi.fn().mockResolvedValue({
      items: [workspaceRowFixture()],
      nextCursor: cursor,
    });
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      workspaceRepository: {
        listWorkspaces,
        getWorkspaceDetail: async () => {
          throw new Error("not used");
        },
        assignPlan: async () => {
          throw new Error("not used");
        },
      },
    });

    const first = await app.inject({
      method: "GET",
      url: "/v1/staff/workspaces?query=acme&kind=organization",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().nextCursor).toBe(cursor);
    expect(listWorkspaces).toHaveBeenCalledWith(
      staffIdentity.subject,
      expect.objectContaining({ query: "acme", kind: "organization" }),
    );

    const second = await app.inject({
      method: "GET",
      url: `/v1/staff/workspaces?cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(second.statusCode).toBe(200);
    expect(listWorkspaces).toHaveBeenLastCalledWith(
      staffIdentity.subject,
      expect.objectContaining({ cursor }),
    );
    await app.close();
  });

  it("rejects an unknown querystring field", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      workspaceRepository: {
        listWorkspaces: async () => ({ items: [], nextCursor: null }),
        getWorkspaceDetail: async () => {
          throw new Error("not used");
        },
        assignPlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/workspaces?kind=enterprise",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("STAFF_VALIDATION_FAILED");
    await app.close();
  });
});

describe("GET /v1/staff/workspaces/:workspaceId", () => {
  it("returns the detail payload", async () => {
    const workspaceId = randomUUID();
    const detail = workspaceDetailFixture();
    const getWorkspaceDetail = vi.fn().mockResolvedValue(detail);
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      workspaceRepository: {
        listWorkspaces: async () => {
          throw new Error("not used");
        },
        getWorkspaceDetail,
        assignPlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/workspaces/${workspaceId}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(getWorkspaceDetail).toHaveBeenCalledWith(
      staffIdentity.subject,
      workspaceId,
    );
    await app.close();
  });

  it("returns 404 when the workspace does not exist", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      workspaceRepository: {
        listWorkspaces: async () => {
          throw new Error("not used");
        },
        getWorkspaceDetail: async () => {
          throw new StaffNotFoundError();
        },
        assignPlan: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/workspaces/${randomUUID()}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("STAFF_NOT_FOUND");
    await app.close();
  });

  it("rejects a non-uuid workspace id", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/workspaces/not-a-uuid",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("PUT /v1/staff/workspaces/:workspaceId/plan", () => {
  it("assigns a plan and returns the updated detail", async () => {
    const workspaceId = randomUUID();
    const planId = randomUUID();
    const assignPlan = vi.fn().mockResolvedValue(workspaceDetailFixture());
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      workspaceRepository: {
        listWorkspaces: async () => {
          throw new Error("not used");
        },
        getWorkspaceDetail: async () => {
          throw new Error("not used");
        },
        assignPlan,
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/staff/workspaces/${workspaceId}/plan`,
      headers: { authorization: "Bearer staff-token" },
      payload: { planId, reason: "Upgraded during onboarding call" },
    });
    expect(response.statusCode).toBe(200);
    expect(assignPlan).toHaveBeenCalledWith(
      staffIdentity.subject,
      workspaceId,
      {
        planId,
        reason: "Upgraded during onboarding call",
      },
    );
    await app.close();
  });

  it("rejects a body missing the required reason", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/staff/workspaces/${randomUUID()}/plan`,
      headers: { authorization: "Bearer staff-token" },
      payload: { planId: randomUUID() },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("STAFF_VALIDATION_FAILED");
    await app.close();
  });
});
