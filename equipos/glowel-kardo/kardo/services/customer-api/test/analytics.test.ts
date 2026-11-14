import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { NotFoundError } from "../src/errors.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

const emptySummary = {
  source: "unavailable" as const,
  days: 7,
  generatedAt: "2026-09-24T00:00:00.000Z",
  activeTouchpoints: 0,
  totals: {
    taps: 0,
    clicks: 0,
    leads: 0,
    channels: { nfc: 0, qr: 0, link: 0 },
  },
  daily: [],
  hourly: [],
  touchpoints: [],
};

describe("analytics routes", () => {
  it("only accepts a whitelisted days value", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      analyticsRepository: {
        getSummary: async (_identity, _id, query) => ({
          ...emptySummary,
          days: query.days,
        }),
      },
    });
    const valid = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary?days=30`,
      headers: authHeader,
    });
    const invalid = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary?days=15`,
      headers: authHeader,
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().days).toBe(30);
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it("defaults to 7 days when no days query parameter is given", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      analyticsRepository: {
        getSummary: async (_identity, _id, query) => ({
          ...emptySummary,
          days: query.days,
        }),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().days).toBe(7);
    await app.close();
  });

  it("reports source: unavailable with zeros instead of a 500 when unconfigured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      analyticsRepository: { getSummary: async () => emptySummary },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source: "unavailable",
      totals: { taps: 0 },
    });
    await app.close();
  });

  it("resolves an unrecognized tz to UTC and forwards a real one, plus groupId", async () => {
    let capturedTimeZone = "";
    let capturedGroupId: string | undefined;
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      analyticsRepository: {
        getSummary: async (_identity, _id, query) => {
          capturedTimeZone = query.timeZone;
          capturedGroupId = query.groupId;
          return { ...emptySummary, days: query.days };
        },
      },
    });
    const bogus = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary?tz=Not/AZone`,
      headers: authHeader,
    });
    expect(bogus.statusCode).toBe(200);
    expect(capturedTimeZone).toBe("UTC");

    const groupId = "7b8c9d0e-1f20-4a3b-8c4d-5e6f7a8b9c0d";
    const real = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary?tz=America/Mexico_City&groupId=${groupId}`,
      headers: authHeader,
    });
    expect(real.statusCode).toBe(200);
    expect(capturedTimeZone).toBe("America/Mexico_City");
    expect(capturedGroupId).toBe(groupId);
    await app.close();
  });

  it("returns 404 when the filtered groupId does not exist", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      analyticsRepository: {
        getSummary: async () => {
          throw new NotFoundError("Group was not found.");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/analytics/summary?groupId=7b8c9d0e-1f20-4a3b-8c4d-5e6f7a8b9c0d`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
