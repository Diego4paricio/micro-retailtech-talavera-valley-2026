import { describe, expect, it } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { StaffAccessError, StaffPermissionError } from "../src/http/errors.js";

const staffIdentity = {
  subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
  email: "operator@kardo.test",
};

describe("staff API", () => {
  it("lets Operations send PUT and DELETE through the CORS preflight", async () => {
    const app = buildStaffApi();
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/v1/staff/workspaces/e6abf26a-3263-4149-9d75-9b7441165d29/plan",
        headers: {
          origin: "http://localhost:5174",
          "access-control-request-method": method,
          "access-control-request-headers": "authorization,content-type",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-methods"]).toContain(
        method,
      );
    }
    await app.close();
  });

  it("does not accept a missing staff session", async () => {
    const app = buildStaffApi();
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("STAFF_SESSION_REQUIRED");
    await app.close();
  });

  it("rejects a Customer-only identity even when a forged Access header is present", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: {
        getActiveStaffSession: async () => {
          throw new StaffAccessError(
            "Customer identity has no staff membership.",
          );
        },
        readDiagnostics: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/session",
      headers: {
        authorization: "Bearer customer-token",
        "cf-access-authenticated-user-email": "operator@kardo.test",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("STAFF_ACCESS_DENIED");
    await app.close();
  });

  it("returns only the active staff permissions from the server-controlled repository", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: {
        getActiveStaffSession: async () => ({
          ...staffIdentity,
          displayName: "Operaciones Kardo",
          permissions: ["operations.diagnostics.read"],
        }),
        readDiagnostics: async () => ({
          touchpointsAwaitingAssignment: 2,
          pendingPublications: 1,
          failedPublicationsLast24Hours: 0,
        }),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/session",
      headers: { authorization: "Bearer staff-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "operator@kardo.test",
      permissions: ["operations.diagnostics.read"],
    });
    await app.close();
  });

  it("requires an explicit diagnostics permission and does not trust Access headers", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: {
        getActiveStaffSession: async () => ({
          ...staffIdentity,
          displayName: "Soporte Kardo",
          permissions: [],
        }),
        readDiagnostics: async () => {
          throw new StaffPermissionError("missing permission");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/diagnostics",
      headers: {
        authorization: "Bearer staff-token",
        "cf-access-authenticated-user-email": "admin@kardo.test",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("STAFF_PERMISSION_DENIED");
    await app.close();
  });

  it("sets defensive headers on every response", async () => {
    const app = buildStaffApi();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });
});
