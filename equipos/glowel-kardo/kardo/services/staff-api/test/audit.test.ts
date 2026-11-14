import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { auditEventFixture, staffIdentity } from "./fixtures.js";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["audit.read"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

describe("GET /v1/staff/audit", () => {
  it("filters by workspaceId, actorType and an action prefix", async () => {
    const listAuditEvents = vi
      .fn()
      .mockResolvedValue({ items: [auditEventFixture()], nextCursor: null });
    const workspaceId = randomUUID();
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      auditRepository: { listAuditEvents },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/audit?workspaceId=${workspaceId}&actorType=staff&action=touchpoint.`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(listAuditEvents).toHaveBeenCalledWith(
      staffIdentity.subject,
      expect.objectContaining({
        workspaceId,
        actorType: "staff",
        action: "touchpoint.",
      }),
    );
    await app.close();
  });

  it("rejects an action pattern with characters outside the allowed charset", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      auditRepository: {
        listAuditEvents: async () => ({ items: [], nextCursor: null }),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/audit?action=DROP%20TABLE",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("STAFF_VALIDATION_FAILED");
    await app.close();
  });
});
