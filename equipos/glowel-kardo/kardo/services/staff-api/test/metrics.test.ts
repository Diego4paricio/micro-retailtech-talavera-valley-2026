import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { metricsOverviewFixture, staffIdentity } from "./fixtures.js";

function appWithOverview(overview = metricsOverviewFixture()) {
  const getOverview = vi.fn().mockResolvedValue(overview);
  const app = buildStaffApi({
    sessionVerifier: { verify: async () => staffIdentity },
    sessionRepository: {
      getActiveStaffSession: async () => ({
        ...staffIdentity,
        displayName: "Staff",
        permissions: ["operations.metrics.read"],
      }),
      readDiagnostics: async () => {
        throw new Error("not used");
      },
    },
    metricsRepository: { getOverview },
  });
  return { app, getOverview };
}

describe("GET /v1/staff/metrics/overview", () => {
  it("returns the overview for an authorized staff session, defaulting days to 30", async () => {
    const { app, getOverview } = appWithOverview();
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/metrics/overview",
      headers: { authorization: "Bearer staff-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().days).toBe(30);
    expect(getOverview).toHaveBeenCalledWith(
      staffIdentity.subject,
      30,
      expect.any(Function),
    );
    await app.close();
  });

  it("passes an explicit days value through", async () => {
    const { app, getOverview } = appWithOverview({
      ...metricsOverviewFixture(),
      days: 7,
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/metrics/overview?days=7",
      headers: { authorization: "Bearer staff-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(getOverview).toHaveBeenCalledWith(
      staffIdentity.subject,
      7,
      expect.any(Function),
    );
    await app.close();
  });

  it("rejects a days value outside the 7|30|90 whitelist", async () => {
    const { app } = appWithOverview();
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/metrics/overview?days=15",
      headers: { authorization: "Bearer staff-token" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("STAFF_VALIDATION_FAILED");
    await app.close();
  });

  it("sets no-store on the response", async () => {
    const { app } = appWithOverview();
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/metrics/overview",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    await app.close();
  });
});
