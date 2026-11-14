import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("answers for the status Worker without touching any Touchpoint", async () => {
    const response = await SELF.fetch("https://resolver.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "resolver",
      status: "ok",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
