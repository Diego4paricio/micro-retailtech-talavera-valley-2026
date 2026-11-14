import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const key = "status-test-command-key-0123456789abcdef";
const auth = { authorization: `Bearer ${key}` };

const incident = {
  id: "7b9e2c1a-4d3f-4a5b-8c6d-1e2f3a4b5c6d",
  kind: "incident",
  title: "Falla en páginas públicas",
  impact: "partial_outage",
  components: ["pages"],
  startsAt: "2026-10-03T17:00:00.000Z",
  endsAt: null,
  resolvedAt: null,
  updates: [
    {
      status: "investigating",
      message: "Estamos revisando.",
      at: "2026-10-03T17:00:00.000Z",
    },
  ],
};

describe("status Worker", () => {
  it("answers /health", async () => {
    const response = await SELF.fetch("https://status.test/health");
    expect(response.status).toBe(200);
  });

  it("serves the public status with open CORS and no technical detail", async () => {
    const response = await SELF.fetch("https://status.test/v1/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["checkedAt", "components", "incidents", "overall", "upcoming"].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/latency|https?:\/\//);
  });

  it("answers the browser's preflight", async () => {
    const response = await SELF.fetch("https://status.test/v1/status", {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
  });

  it("refuses internal routes without the key", async () => {
    for (const [method, path] of [
      ["GET", "/internal/status"],
      ["PUT", "/internal/incidents"],
      ["POST", "/internal/check"],
    ] as const) {
      const response = await SELF.fetch(`https://status.test${path}`, {
        method,
        headers: { authorization: "Bearer wrong" },
      });
      expect(response.status).toBe(401);
    }
  });

  it("takes a newer incident set, ignores an older one, and shows it", async () => {
    const put = (version: number, incidents: unknown[]) =>
      SELF.fetch("https://status.test/internal/incidents", {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ version, incidents }),
      });
    const first = await put(5, [incident]);
    expect(await first.json()).toEqual({ applied: true, version: 5 });
    const stale = await put(4, []);
    expect(await stale.json()).toEqual({ applied: false, version: 5 });

    const status = (await (
      await SELF.fetch("https://status.test/v1/status")
    ).json()) as {
      overall: string;
      incidents: unknown[];
      components: { id: string; level: string }[];
    };
    expect(status.overall).toBe("partial_outage");
    expect(status.incidents).toHaveLength(1);
    expect(status.components.find((c) => c.id === "pages")?.level).toBe(
      "partial_outage",
    );

    const resolved = await put(6, []);
    expect(await resolved.json()).toEqual({ applied: true, version: 6 });
  });

  it("rejects a malformed incident set", async () => {
    const response = await SELF.fetch(
      "https://status.test/internal/incidents",
      {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          version: 9,
          incidents: [{ ...incident, components: ["database"] }],
        }),
      },
    );
    expect(response.status).toBe(400);
  });

  it("runs a check on demand and reports the detail to staff", async () => {
    const check = await SELF.fetch("https://status.test/internal/check", {
      method: "POST",
      headers: auth,
    });
    expect(check.status).toBe(204);
    const detail = (await (
      await SELF.fetch("https://status.test/internal/status", { headers: auth })
    ).json()) as {
      status: { checkedAt: string | null };
      probes: { id: string; configured: boolean }[];
    };
    expect(detail.status.checkedAt).not.toBeNull();
    expect(detail.probes).toHaveLength(7);
    // The test config sets no addresses: nothing is configured.
    expect(detail.probes.every((p) => !p.configured)).toBe(true);
  });

  it("counts a minute of history per cron run", async () => {
    const stub = env.STATUS_STATE.get(env.STATUS_STATE.idFromName("global"));
    await stub.record({
      probes: [],
      providers: null,
      nowMs: Date.now(),
      countMinute: true,
    });
    const response = await SELF.fetch(
      "https://status.test/v1/status/history?days=7",
    );
    const body = (await response.json()) as {
      days: { day: string; components: Record<string, string> }[];
    };
    expect(body.days.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(body.days.at(-1)?.components ?? {})).toHaveLength(6);
  });
});
