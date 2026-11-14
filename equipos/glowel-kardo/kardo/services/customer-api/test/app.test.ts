import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { ConflictError, WorkspaceAccessError } from "../src/errors.js";
import { authHeader, subjectId, verifierFor, workspaceId } from "./helpers.js";

describe("customer API", () => {
  it("returns a request id from health", async () => {
    const app = buildCustomerApi();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "customer-api",
      status: "ok",
    });
    await app.close();
  });

  it("does not treat an unauthenticated request as a session", async () => {
    const app = buildCustomerApi();
    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("AUTH_REQUIRED");
    await app.close();
  });

  it("returns a verified customer identity through the injected verifier", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor({
        subject: subjectId,
        email: "customer@kardo.test",
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeader,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      subject: subjectId,
      email: "customer@kardo.test",
    });
    await app.close();
  });

  it("lists only workspaces returned for the verified subject", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async (identity) => {
          expect(identity.subject).toBe(subjectId);
          return [
            {
              id: workspaceId,
              publicId: "kardoWorkspace0001",
              name: "Kardo Test",
              kind: "organization",
              role: "owner",
            },
          ];
        },
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: authHeader,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      name: "Kardo Test",
      role: "owner",
    });
    await app.close();
  });

  it("does not query workspaces when the customer session is absent", async () => {
    const app = buildCustomerApi({
      workspaceRepository: {
        listForCustomer: async () => {
          throw new Error(
            "repository must not run for an unauthenticated request",
          );
        },
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({ method: "GET", url: "/v1/workspaces" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("saves onboarding only through workspace.manage authorization", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async (identity, id, input) => {
          expect(identity.subject).toBe(subjectId);
          expect(id).toBe(workspaceId);
          expect(input).toEqual({ workspaceName: "Café Nube" });
          return {
            id,
            publicId: "kardoWorkspace0001",
            name: input.workspaceName,
            kind: "organization",
            role: "owner",
          };
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload: { workspaceName: "Café Nube" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "Café Nube" });
    await app.close();
  });

  it("takes the person's name and preferred name with the onboarding", async () => {
    let received: unknown = null;
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async (_identity, id, input) => {
          received = input;
          return {
            id,
            publicId: "kardoWorkspace0001",
            name: input.workspaceName,
            kind: "organization",
            role: "owner",
          };
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const payload = {
      workspaceName: "Café Nube",
      displayName: "María José López",
      preferredName: "Majo",
    };
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual(payload);
    const tooLong = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload: { ...payload, preferredName: "x".repeat(61) },
    });
    expect(tooLong.statusCode).toBe(400);
    await app.close();
  });

  it("rejects onboarding rename for a viewer (workspace.manage required)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async () => {
          throw new WorkspaceAccessError();
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload: { workspaceName: "Café Nube" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("WORKSPACE_ACCESS_DENIED");
    await app.close();
  });

  it("rejects onboarding without a verified session", async () => {
    const app = buildCustomerApi();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      payload: { workspaceName: "Café Nube" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("renames a workspace only through workspace.manage authorization", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async (identity, id, input) => {
          expect(identity.subject).toBe(subjectId);
          return {
            id,
            publicId: "kardoWorkspace0001",
            name: input.name,
            kind: "organization",
            role: "owner",
          };
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}`,
      headers: authHeader,
      payload: { name: "Nuevo nombre" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "Nuevo nombre" });
    await app.close();
  });

  it("creates an organization workspace for the current customer", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async (identity, input) => {
          expect(identity.subject).toBe(subjectId);
          return {
            id: workspaceId,
            publicId: "abcdefghijklmnopqrstuvwx",
            name: input.name,
            kind: "organization",
            role: "owner",
          };
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: authHeader,
      payload: { name: "Café Nube" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: "Café Nube",
      kind: "organization",
    });
    await app.close();
  });

  it("returns 409 ORGANIZATION_LIMIT once a subject owns the maximum organizations", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => [],
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new ConflictError(
            "ORGANIZATION_LIMIT",
            "You already own the maximum number of organizations.",
          );
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: authHeader,
      payload: { name: "Café Nube 4" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_LIMIT");
    await app.close();
  });

  it("answers an unexpected error with 500 INTERNAL_ERROR, never 401", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: async () => {
          throw new Error("boom: something truly unexpected broke");
        },
        completeOnboarding: async () => {
          throw new Error("not used");
        },
        updateWorkspace: async () => {
          throw new Error("not used");
        },
        createOrganization: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe("INTERNAL_ERROR");
    expect(response.json().message).not.toContain("boom");
    await app.close();
  });

  it("rejects a request that does not match its body schema with 400 VALIDATION_FAILED", async () => {
    const app = buildCustomerApi({ sessionVerifier: verifierFor() });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}`,
      headers: authHeader,
      payload: { name: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_FAILED");
    await app.close();
  });

  it("enforces the general rate limit and returns 429 with Retry-After", async () => {
    const app = buildCustomerApi({
      rateLimit: { general: { limit: 2, windowMs: 60_000 } },
    });
    const first = await app.inject({ method: "GET", url: "/health" });
    const second = await app.inject({ method: "GET", url: "/health" });
    const third = await app.inject({ method: "GET", url: "/health" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe("RATE_LIMITED");
    expect(third.headers["retry-after"]).toBeDefined();
    await app.close();
  });

  it("the general limit is per IP: forged tokens with fresh subjects do not reset it", async () => {
    const app = buildCustomerApi({
      rateLimit: { general: { limit: 3, windowMs: 60_000 } },
    });
    const forged = (sub: string) =>
      `Bearer ${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.x`;
    const codes: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: { authorization: forged(`fake-${index}`) },
      });
      codes.push(response.statusCode);
    }
    expect(codes).toEqual([200, 200, 200, 429, 429, 429]);
    await app.close();
  });

  it("sets defensive headers on every response", async () => {
    const app = buildCustomerApi();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    await app.close();
  });
});
