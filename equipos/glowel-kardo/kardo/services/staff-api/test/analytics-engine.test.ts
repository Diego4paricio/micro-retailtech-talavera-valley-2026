import { describe, expect, it, vi } from "vitest";
import {
  AnalyticsEngineError,
  createCloudflareAnalyticsEngineClient,
  fetchPlatformTapSummary,
  fetchPreviousPlatformTapTotal,
  fetchTapsForPublicIds,
  fetchTopTappedPublicIds,
  isAnalyticsDays,
  sanitizePublicIds,
} from "../src/clients/analytics-engine.js";

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ data }),
  } as Response;
}

describe("isAnalyticsDays / sanitizePublicIds", () => {
  it("only accepts the closed 7|30|90 whitelist", () => {
    expect(isAnalyticsDays(7)).toBe(true);
    expect(isAnalyticsDays(30)).toBe(true);
    expect(isAnalyticsDays(90)).toBe(true);
    expect(isAnalyticsDays(15)).toBe(false);
  });

  it("drops publicIds that do not match the Touchpoint public-id shape", () => {
    expect(
      sanitizePublicIds([
        "validpublicid1234567890",
        "short",
        "has spaces not allowed!",
        "'; DROP TABLE kardo_taps; --",
      ]),
    ).toEqual(["validpublicid1234567890"]);
  });
});

describe("createCloudflareAnalyticsEngineClient", () => {
  it("posts the raw SQL text with a bearer token and text/plain content-type", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([{ total: 5 }]));
    const client = createCloudflareAnalyticsEngineClient({
      accountId: "a".repeat(32),
      apiToken: "test-token",
      fetchFn,
    });
    const rows = await client.query("SELECT 1");
    expect(rows).toEqual([{ total: 5 }]);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/analytics_engine/sql");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("SELECT 1");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer test-token",
    );
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "text/plain",
    );
  });

  it("throws AnalyticsEngineError on a non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([], false, 500));
    const client = createCloudflareAnalyticsEngineClient({
      accountId: "a".repeat(32),
      apiToken: "test-token",
      fetchFn,
    });
    await expect(client.query("SELECT 1")).rejects.toBeInstanceOf(
      AnalyticsEngineError,
    );
  });
});

describe("fetchPlatformTapSummary", () => {
  it("queries platform-wide (no publicId filter) and parses totals/daily/channels", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("GROUP BY event_type, channel")) {
          return [
            { event_type: "tap", channel: "nfc", total: 10 },
            { event_type: "tap", channel: "qr", total: 4 },
            { event_type: "click", channel: "nfc", total: 2 },
          ];
        }
        return [
          { day: "2026-01-01", channel: "nfc", total: 6 },
          { day: "2026-01-01", channel: "qr", total: 1 },
        ];
      }),
    };

    const summary = await fetchPlatformTapSummary({
      client,
      dataset: "kardo_taps",
      environment: "production",
      days: 7,
    });

    expect(summary.total).toBe(14);
    expect(summary.clicks).toBe(2);
    expect(summary.byChannel).toEqual({ nfc: 10, qr: 4, link: 0 });
    expect(summary.daily.get("2026-01-01")).toEqual({ nfc: 6, qr: 1, link: 0 });
    // No `index1 IN (...)` filter anywhere: platform totals need no
    // Touchpoint-id list.
    for (const sql of queries) {
      expect(sql).not.toContain("index1 IN");
      expect(sql).toContain("blob4 = 'production'");
    }
  });

  it("rejects a misconfigured environment outright", async () => {
    const client = { query: vi.fn() };
    await expect(
      fetchPlatformTapSummary({
        client,
        dataset: "kardo_taps",
        environment: "not valid!",
        days: 7,
      }),
    ).rejects.toBeInstanceOf(AnalyticsEngineError);
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("fetchPreviousPlatformTapTotal", () => {
  it("queries the prior window of the same length", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("INTERVAL '14' DAY");
        expect(sql).toContain("INTERVAL '7' DAY");
        return [{ total: 9 }];
      }),
    };
    const total = await fetchPreviousPlatformTapTotal({
      client,
      dataset: "kardo_taps",
      environment: "production",
      days: 7,
    });
    expect(total).toBe(9);
  });
});

describe("fetchTopTappedPublicIds", () => {
  it("bounds the query with ORDER BY ... LIMIT and returns a publicId->taps map", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("ORDER BY total DESC");
        expect(sql).toContain("LIMIT 5");
        return [
          { public_id: "a".repeat(20), total: 100 },
          { public_id: "b".repeat(20), total: 50 },
        ];
      }),
    };
    const result = await fetchTopTappedPublicIds({
      client,
      dataset: "kardo_taps",
      environment: "production",
      days: 30,
      limit: 5,
    });
    expect(result.get("a".repeat(20))).toBe(100);
    expect(result.get("b".repeat(20))).toBe(50);
  });
});

describe("fetchTapsForPublicIds", () => {
  it("returns 0 without querying when no publicIds are valid", async () => {
    const client = { query: vi.fn() };
    const total = await fetchTapsForPublicIds({
      client,
      dataset: "kardo_taps",
      environment: "production",
      days: 30,
      publicIds: ["short", "!!invalid!!"],
    });
    expect(total).toBe(0);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("sums taps for the given publicIds", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("IN (");
        return [{ total: 42 }];
      }),
    };
    const total = await fetchTapsForPublicIds({
      client,
      dataset: "kardo_taps",
      environment: "production",
      days: 30,
      publicIds: ["validpublicid1234567890"],
    });
    expect(total).toBe(42);
  });

  it("propagates a query failure as AnalyticsEngineError", async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error("network down")),
    };
    await expect(
      fetchTapsForPublicIds({
        client,
        dataset: "kardo_taps",
        environment: "production",
        days: 30,
        publicIds: ["validpublicid1234567890"],
      }),
    ).rejects.toThrow("network down");
  });
});
