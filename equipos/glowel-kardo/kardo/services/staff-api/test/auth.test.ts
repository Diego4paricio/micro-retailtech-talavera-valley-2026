import { describe, expect, it } from "vitest";
import { type BuildStaffApiInput, buildStaffApi } from "../src/app.js";
import {
  StaffAccessError,
  StaffMfaRequiredError,
  StaffPermissionError,
} from "../src/http/errors.js";
import { staffIdentity } from "./fixtures.js";

/**
 * Every `/v1/staff/*` route must, in order: reject a missing/invalid bearer
 * token (401), reject an AAL1 staff session (403 MFA), reject a
 * non-staff/inactive identity (403 access) — all before the endpoint's own
 * repository is ever called — and finally reject an active staff session
 * that lacks the specific permission the endpoint requires (403 permission),
 * which the repository itself enforces. One representative request per route
 * group exercises this for every group described in the brief.
 */
type Case = {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  body?: Record<string, unknown>;
  /** Attaches a fake for this group's own repository/client, with its main
   * method throwing `StaffPermissionError` — used for the 403-permission
   * case, where session checks succeed but the endpoint itself denies. */
  permissionDeniedOverrides: (
    sessionVerifier: BuildStaffApiInput["sessionVerifier"],
    sessionRepository: BuildStaffApiInput["sessionRepository"],
  ) => BuildStaffApiInput;
};

const deniedSessionRepository = {
  getActiveStaffSession: async () => {
    throw new Error("must not be called before session verification");
  },
  readDiagnostics: async () => {
    throw new Error("not used");
  },
};

function okSessionRepository(): BuildStaffApiInput["sessionRepository"] {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: [],
    }),
    readDiagnostics: async () => {
      throw new StaffPermissionError();
    },
  };
}

const cases: Case[] = [
  {
    name: "metrics overview",
    method: "GET",
    url: "/v1/staff/metrics/overview",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      metricsRepository: {
        getOverview: async () => {
          throw new StaffPermissionError();
        },
      },
    }),
  },
  {
    name: "workspaces list",
    method: "GET",
    url: "/v1/staff/workspaces",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      workspaceRepository: {
        listWorkspaces: async () => {
          throw new StaffPermissionError();
        },
        getWorkspaceDetail: async () => {
          throw new Error("not used");
        },
        assignPlan: async () => {
          throw new Error("not used");
        },
      },
    }),
  },
  {
    name: "touchpoints list",
    method: "GET",
    url: "/v1/staff/touchpoints",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      touchpointRepository: {
        listTouchpoints: async () => {
          throw new StaffPermissionError();
        },
        getTouchpointDetail: async () => {
          throw new Error("not used");
        },
        suspendTouchpoint: async () => {
          throw new Error("not used");
        },
        unsuspendTouchpoint: async () => {
          throw new Error("not used");
        },
      },
    }),
  },
  {
    name: "publications list",
    method: "GET",
    url: "/v1/staff/publications",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      publicationRepository: {
        listPublications: async () => {
          throw new StaffPermissionError();
        },
        retryPublication: async () => {
          throw new Error("not used");
        },
      },
    }),
  },
  {
    name: "audit list",
    method: "GET",
    url: "/v1/staff/audit",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      auditRepository: {
        listAuditEvents: async () => {
          throw new StaffPermissionError();
        },
      },
    }),
  },
  {
    name: "plans list",
    method: "GET",
    url: "/v1/staff/plans",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      planRepository: {
        listPlans: async () => {
          throw new StaffPermissionError();
        },
        createPlan: async () => {
          throw new Error("not used");
        },
        updatePlan: async () => {
          throw new Error("not used");
        },
      },
    }),
  },
  {
    name: "staff members list",
    method: "GET",
    url: "/v1/staff/staff-members",
    permissionDeniedOverrides: (sessionVerifier, sessionRepository) => ({
      sessionVerifier,
      sessionRepository,
      staffMemberRepository: {
        listStaffMembers: async () => {
          throw new StaffPermissionError();
        },
      },
    }),
  },
];

describe.each(cases)(
  "$name",
  ({ method, url, body, permissionDeniedOverrides }) => {
    it("returns 401 with no bearer token", async () => {
      const app = buildStaffApi();
      const response = await app.inject({ method, url, payload: body });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("STAFF_SESSION_REQUIRED");
      await app.close();
    });

    it("returns 403 STAFF_MFA_REQUIRED for an AAL1 session", async () => {
      const app = buildStaffApi({
        sessionVerifier: {
          verify: async () => {
            throw new StaffMfaRequiredError();
          },
        },
        sessionRepository: deniedSessionRepository,
      });
      const response = await app.inject({
        method,
        url,
        payload: body,
        headers: { authorization: "Bearer staff-token" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("STAFF_MFA_REQUIRED");
      await app.close();
    });

    it("returns 403 STAFF_ACCESS_DENIED for a non-staff identity", async () => {
      const app = buildStaffApi({
        sessionVerifier: { verify: async () => staffIdentity },
        sessionRepository: {
          getActiveStaffSession: async () => {
            throw new StaffAccessError();
          },
          readDiagnostics: async () => {
            throw new Error("not used");
          },
        },
      });
      const response = await app.inject({
        method,
        url,
        payload: body,
        headers: {
          authorization: "Bearer staff-token",
          "cf-access-authenticated-user-email": "forged@kardo.test",
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("STAFF_ACCESS_DENIED");
      await app.close();
    });

    it("returns 403 STAFF_PERMISSION_DENIED when the endpoint denies it", async () => {
      const sessionVerifier = { verify: async () => staffIdentity };
      const sessionRepository = okSessionRepository();
      const app = buildStaffApi(
        permissionDeniedOverrides(sessionVerifier, sessionRepository),
      );
      const response = await app.inject({
        method,
        url,
        payload: body,
        headers: { authorization: "Bearer staff-token" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("STAFF_PERMISSION_DENIED");
      await app.close();
    });
  },
);

describe("bearer token shape", () => {
  it("rejects a malformed authorization header before touching the DB", async () => {
    const app = buildStaffApi();
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/session",
      headers: { authorization: "not-a-bearer-token" },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
