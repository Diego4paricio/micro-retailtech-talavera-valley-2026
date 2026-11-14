import { reset, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";

// ADR 020, addendum of 2026-10-01: a deleted organization's Touchpoints are
// retired (410, terminal) with `purge: true`, which also removes their
// published snapshots. Authorized with the publish key, never the billing key.

const publicId = "kardodeletedpage0001";
const other = "kardokeptpage0000002";
const json = { "content-type": "application/json" };
const publishHeaders = {
  ...json,
  authorization: "Bearer resolver-test-command",
};
const billingHeaders = {
  ...json,
  authorization: "Bearer resolver-test-billing",
};

afterEach(async () => reset());

function post(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Response> {
  return SELF.fetch(`https://resolver.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function publish(id: string, revision: number): Promise<void> {
  const r = await post("/internal/publish", publishHeaders, {
    publicId: id,
    revision,
    destinationUrl: `https://example.test/${id}/${revision}`,
  });
  expect(r.status).toBe(200);
}

async function snapshotKeys(id: string): Promise<string[]> {
  const page = await env.PUBLISHED_SNAPSHOTS.list({
    prefix: `snapshots/${id}/`,
  });
  return page.objects.map((object) => object.key);
}

const get = (id: string) =>
  SELF.fetch(`https://resolver.test/t/${id}`, { redirect: "manual" });

describe("retirement with purge (deleted organization)", () => {
  it("answers 410 with no content and deletes every published snapshot", async () => {
    await publish(publicId, 1);
    await publish(publicId, 2);
    expect(await snapshotKeys(publicId)).toHaveLength(2);

    const retire = await post("/internal/availability", publishHeaders, {
      publicId,
      status: "retired",
      purge: true,
    });
    expect(retire.status).toBe(200);
    expect(await retire.json()).toEqual({ result: "retired" });

    expect(await snapshotKeys(publicId)).toEqual([]);
    const page = await get(publicId);
    expect(page.status).toBe(410);
    const html = await page.text();
    expect(html).not.toContain("example.test");
    expect(page.headers.get("location")).toBeNull();
  });

  it("leaves other Touchpoints alone", async () => {
    await publish(publicId, 1);
    await publish(other, 1);
    await post("/internal/availability", publishHeaders, {
      publicId,
      status: "retired",
      purge: true,
    });
    expect(await snapshotKeys(other)).toHaveLength(1);
    const kept = await get(other);
    expect(kept.status).toBe(302);
    expect(kept.headers.get("location")).toBe(
      `https://example.test/${other}/1`,
    );
  });

  it("is idempotent and a later publication never revives the page", async () => {
    await publish(publicId, 1);
    const command = { publicId, status: "retired", purge: true };
    expect(
      (await post("/internal/availability", publishHeaders, command)).status,
    ).toBe(200);
    expect(
      (await post("/internal/availability", publishHeaders, command)).status,
    ).toBe(200);
    await publish(publicId, 3);
    expect((await get(publicId)).status).toBe(410);
  });

  it("refuses purge without a retirement, or a purge that is not a boolean", async () => {
    await publish(publicId, 1);
    for (const body of [
      { publicId, status: "paused", purge: true },
      { publicId, status: "active", purge: true },
      { publicId, status: "retired", purge: "yes" },
    ]) {
      const r = await post("/internal/availability", publishHeaders, body);
      expect(r.status).toBe(400);
    }
    expect(await snapshotKeys(publicId)).toHaveLength(1);
  });

  it("is not reachable with the billing key", async () => {
    await publish(publicId, 1);
    const r = await post("/internal/availability", billingHeaders, {
      publicId,
      status: "retired",
      purge: true,
    });
    expect(r.status).toBe(401);
    expect(await snapshotKeys(publicId)).toHaveLength(1);
  });
});
