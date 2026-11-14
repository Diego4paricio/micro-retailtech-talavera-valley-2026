import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("answers for the status Worker", async () => {
    const response = await SELF.fetch("https://assets.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "assets", status: "ok" });
  });
});
