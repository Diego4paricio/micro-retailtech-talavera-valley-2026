import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/turnstile.js";

describe("verifyTurnstile", () => {
  it("returns true and posts the expected payload when siteverify reports success", async () => {
    let calls = 0;
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      expect(String(url)).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        secret: "s3cr3t",
        response: "token-abc",
        remoteip: "203.0.113.5",
      });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const verified = await verifyTurnstile({
      secretKey: "s3cr3t",
      token: "token-abc",
      remoteIp: "203.0.113.5",
      fetchImpl,
    });
    expect(verified).toBe(true);
    expect(calls).toBe(1);
  });

  it("returns false when siteverify reports failure", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
        { status: 200 },
      )) as typeof fetch;

    const verified = await verifyTurnstile({
      secretKey: "s3cr3t",
      token: "bad-token",
      remoteIp: "203.0.113.5",
      fetchImpl,
    });
    expect(verified).toBe(false);
  });

  it("returns false when siteverify responds with a non-2xx status", async () => {
    const fetchImpl = (async () =>
      new Response("Internal Server Error", { status: 500 })) as typeof fetch;

    expect(
      await verifyTurnstile({
        secretKey: "s3cr3t",
        token: "token-abc",
        remoteIp: "203.0.113.5",
        fetchImpl,
      }),
    ).toBe(false);
  });

  it("returns false and never calls fetch when the token is empty", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const verified = await verifyTurnstile({
      secretKey: "s3cr3t",
      token: "",
      remoteIp: "203.0.113.5",
      fetchImpl,
    });
    expect(verified).toBe(false);
    expect(calls).toBe(0);
  });

  it("returns false instead of throwing when fetch itself fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("network unreachable");
    }) as typeof fetch;

    expect(
      await verifyTurnstile({
        secretKey: "s3cr3t",
        token: "token-abc",
        remoteIp: "203.0.113.5",
        fetchImpl,
      }),
    ).toBe(false);
  });
});
