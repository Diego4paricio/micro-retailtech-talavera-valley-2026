import { describe, expect, it } from "vitest";
import {
  PROBE_USER_AGENT,
  type ProbeResult,
  queueSignal,
  runProbes,
} from "../src/probes.js";
import {
  cloudflareComponents,
  parseGoogleCloud,
  parseStatuspage,
  runProviders,
  supabaseComponents,
} from "../src/providers.js";

const now = new Date("2026-10-03T18:00:00.000Z");

function byId(results: ProbeResult[]) {
  return Object.fromEntries(results.map((r) => [r.id, r]));
}

describe("runProbes", () => {
  it("reports every check as not configured with nothing set", async () => {
    const results = await runProbes(
      {},
      {
        now,
        fetchFn: async () => {
          throw new Error("should not fetch");
        },
      },
    );
    expect(results).toHaveLength(7);
    expect(results.every((r) => !r.configured && r.signal === null)).toBe(true);
  });

  it("reads the API readiness, the queue, the test QR and the healths", async () => {
    const seen: { url: string; ua: string | null; key: string | null }[] = [];
    const fetchFn = async (request: Request) => {
      seen.push({
        url: request.url,
        ua: request.headers.get("user-agent"),
        key: request.headers.get("x-kardo-status-key"),
      });
      const url = new URL(request.url);
      if (url.pathname === "/health/ready") {
        return Response.json({
          service: "customer-api",
          status: "ok",
          database: { ok: true, latencyMs: 20 },
          publishQueue: { oldestPendingSeconds: 400, pendingJobs: 3 },
          errors: { windowSeconds: 300, requests: 10, serverErrors: 0 },
        });
      }
      if (url.pathname === "/t/kardostatusprobe0001") {
        return new Response("<html><title>Kardo estado OK</title></html>");
      }
      if (url.pathname === "/health") {
        return Response.json({ status: "ok" });
      }
      return new Response("<html></html>");
    };
    const results = byId(
      await runProbes(
        {
          STATUS_PROBE_KEY: "probe-key",
          CUSTOMER_API_URL: "https://api.kardo.test",
          CUSTOMER_APP_URL: "https://app.kardo.test/",
          RESOLVER_URL: "https://go.kardo.test",
          STATUS_PROBE_PUBLIC_ID: "kardostatusprobe0001",
          STATUS_PROBE_MARKER: "Kardo estado OK",
          PUBLISHER_URL: "https://publisher.kardo.test",
          ASSETS_URL: "https://assets.kardo.test",
          ANALYTICS_URL: "https://analytics.kardo.test",
        },
        { now, fetchFn },
      ),
    );
    expect(results.api?.signal).toBe("operational");
    expect(results.queue?.signal).toBe("degraded");
    expect(results.resolver?.signal).toBe("operational");
    expect(results.resolver?.detail).toBe("QR de prueba");
    expect(results.publisher?.signal).toBe("operational");
    expect(results["panel-app"]?.signal).toBe("operational");
    expect(seen.every((s) => s.ua === PROBE_USER_AGENT)).toBe(true);
    // The probe key only goes to the Customer API.
    expect(seen.filter((s) => s.key !== null).map((s) => s.url)).toEqual([
      "https://api.kardo.test/health/ready",
    ]);
    expect(seen.map((s) => s.url)).toContain(
      "https://go.kardo.test/t/kardostatusprobe0001?src=qr",
    );
  });

  it("fails the QR when the marker is missing and the API when the database is down", async () => {
    const fetchFn = async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/health/ready") {
        return Response.json(
          {
            service: "customer-api",
            status: "error",
            database: { ok: false, latencyMs: 3001 },
            publishQueue: null,
            errors: { windowSeconds: 300, requests: 0, serverErrors: 0 },
          },
          { status: 503 },
        );
      }
      return new Response("<html>otra cosa</html>");
    };
    const results = byId(
      await runProbes(
        {
          STATUS_PROBE_KEY: "k",
          CUSTOMER_API_URL: "https://api.kardo.test",
          RESOLVER_URL: "https://go.kardo.test",
          STATUS_PROBE_PUBLIC_ID: "kardostatusprobe0001",
          STATUS_PROBE_MARKER: "Kardo estado OK",
        },
        { now, fetchFn },
      ),
    );
    expect(results.api?.signal).toBe("major_outage");
    expect(results.api?.error).toBe("La base de datos no respondió");
    // Configured but nothing to judge: keeps the previous level.
    expect(results.queue).toMatchObject({ configured: true, signal: null });
    expect(results.resolver?.signal).toBe("major_outage");
    expect(results.resolver?.error).toBe("QR de prueba sin la marca esperada");
  });

  it("a network error or a timeout is a failure, never a throw", async () => {
    const results = byId(
      await runProbes(
        { PUBLISHER_URL: "https://publisher.kardo.test" },
        {
          now,
          fetchFn: async () => {
            throw new TypeError("fetch failed");
          },
        },
      ),
    );
    expect(results.publisher).toMatchObject({
      signal: "major_outage",
      ok: false,
      error: "fetch failed",
    });
  });

  it("prefers a service binding over the public address", async () => {
    let viaBinding = 0;
    const binding = {
      fetch: async () => {
        viaBinding += 1;
        return Response.json({ status: "ok" });
      },
    } as unknown as Fetcher;
    const results = byId(
      await runProbes(
        { ANALYTICS: binding },
        {
          now,
          fetchFn: async () => {
            throw new Error("should use the binding");
          },
        },
      ),
    );
    expect(viaBinding).toBe(1);
    expect(results.analytics?.signal).toBe("operational");
  });

  it("grades the queue age", () => {
    expect(queueSignal(10)).toBe("operational");
    expect(queueSignal(301)).toBe("degraded");
    expect(queueSignal(1201)).toBe("partial_outage");
  });
});

describe("providers", () => {
  it("follows Kardo's stack: R2 for files, Hyperdrive for publishing, no Supabase Storage", () => {
    expect(cloudflareComponents.R2).toContain("files");
    expect(cloudflareComponents.Hyperdrive).toEqual([
      "publishing",
      "analytics",
    ]);
    expect(cloudflareComponents.Turnstile).toEqual(["analytics"]);
    expect(supabaseComponents.Storage).toBeUndefined();
  });

  it("keeps only the components Kardo uses, capped at partial_outage", () => {
    const issues = parseStatuspage(
      {
        components: [
          {
            name: "Workers Builds",
            status: "degraded_performance",
            group: false,
          },
          {
            name: "Amsterdam, Netherlands - (AMS)",
            status: "partial_outage",
            group: false,
          },
          { name: "Durable Objects", status: "major_outage", group: false },
          { name: "us-east-1", status: "degraded_performance", group: false },
          {
            name: "Compute capacity",
            status: "degraded_performance",
            group: true,
          },
          { name: "Database", status: "operational", group: false },
        ],
      },
      (name) =>
        ({ "Durable Objects": ["pages"] as never, ...supabaseComponents })[
          name
        ] ?? null,
    );
    expect(issues).toEqual([
      {
        name: "Durable Objects",
        level: "partial_outage",
        components: ["pages"],
      },
      {
        name: "us-east-1",
        level: "degraded",
        components: ["panel", "publishing"],
      },
    ]);
  });

  it("reads open Cloud Run incidents in us-east4 or global", () => {
    const issues = parseGoogleCloud([
      {
        end: null,
        severity: "medium",
        external_desc: "Cloud Run latency",
        affected_products: [{ title: "Cloud Run" }],
        currently_affected_locations: [{ id: "us-east4" }],
      },
      {
        end: null,
        severity: "high",
        affected_products: [{ title: "Cloud Run" }],
        currently_affected_locations: [{ id: "europe-west1" }],
      },
      {
        end: "2026-10-01T00:00:00Z",
        affected_products: [{ title: "Cloud Run" }],
        currently_affected_locations: [],
      },
      {
        end: null,
        severity: "low",
        affected_products: [{ title: "BigQuery" }],
        currently_affected_locations: [],
      },
    ]);
    expect(issues).toEqual([
      {
        name: "Cloud Run: Cloud Run latency",
        level: "partial_outage",
        components: ["panel", "publishing", "ai"],
      },
    ]);
  });

  it("a provider page that fails says nothing about Kardo", async () => {
    const results = await runProviders({
      now,
      fetchFn: async (request) =>
        request.url.includes("supabase")
          ? new Response("down", { status: 502 })
          : Response.json({ components: [] }),
    });
    const supabase = results.find((r) => r.provider === "supabase");
    expect(supabase).toMatchObject({ ok: false, issues: [] });
    // Google Cloud expects an array; an object is an unexpected format.
    const google = results.find((r) => r.provider === "google-cloud");
    expect(google?.ok).toBe(false);
    expect(results.find((r) => r.provider === "cloudflare")?.ok).toBe(true);
  });
});
