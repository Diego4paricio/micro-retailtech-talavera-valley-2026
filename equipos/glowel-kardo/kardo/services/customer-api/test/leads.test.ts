import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { InvalidCursorError, WorkspaceAccessError } from "../src/errors.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

describe("lead routes", () => {
  it("rejects a viewer or editor without leads.read", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadRepository: {
        listLeads: async () => {
          throw new WorkspaceAccessError();
        },
        exportLeads: async () => {
          throw new Error("not used");
        },
        countLeadsForAnalytics: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/leads`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns 400 INVALID_CURSOR for a malformed cursor", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadRepository: {
        listLeads: async () => {
          throw new InvalidCursorError();
        },
        exportLeads: async () => {
          throw new Error("not used");
        },
        countLeadsForAnalytics: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/leads?cursor=not-a-real-cursor`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_CURSOR");
    await app.close();
  });

  it("exports leads as an escaped, formula-injection-safe CSV file", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadRepository: {
        listLeads: async () => {
          throw new Error("not used");
        },
        exportLeads: async () => [
          {
            id: "3c4d5e6f-7081-492a-8c1d-2e3f4a5b6c7d",
            touchpointId: "31f7a4dc-0bb7-450e-91c6-342045d779e9",
            touchpointName: "Mostrador",
            email: "cliente@example.com",
            name: '=HYPERLINK("http://evil.example")',
            phone: null,
            message: "Hola",
            revision: 1,
            createdAt: "2026-09-24T00:00:00.000Z",
          },
        ],
        countLeadsForAnalytics: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/leads/export`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain(
      "kardo-leads.csv",
    );
    const body = response.body;
    expect(body.startsWith("﻿")).toBe(true);
    expect(body).toContain("'=HYPERLINK");
    await app.close();
  });
});
