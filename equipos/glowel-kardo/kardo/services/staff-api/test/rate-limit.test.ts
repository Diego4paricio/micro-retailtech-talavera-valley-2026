import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { StaffRateLimitedError } from "../src/http/errors.js";
import { createStaffRateLimiter } from "../src/rate-limit.js";

const req = (ip: string) => ({ ip }) as FastifyRequest;

describe("staff rate limiter", () => {
  it("allows up to the limit, then throws 429 with a Retry-After", () => {
    const check = createStaffRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(() => check(req("1.1.1.1"))).not.toThrow();
    expect(() => check(req("1.1.1.1"))).not.toThrow();
    expect(() => check(req("1.1.1.1"))).not.toThrow();
    try {
      check(req("1.1.1.1"));
      throw new Error("should have been rate limited");
    } catch (error) {
      expect(error).toBeInstanceOf(StaffRateLimitedError);
      expect((error as StaffRateLimitedError).statusCode).toBe(429);
      expect(
        (error as StaffRateLimitedError).retryAfterSeconds,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps a separate bucket per IP", () => {
    const check = createStaffRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(() => check(req("2.2.2.2"))).not.toThrow();
    expect(() => check(req("3.3.3.3"))).not.toThrow();
    expect(() => check(req("2.2.2.2"))).toThrow(StaffRateLimitedError);
  });
});
