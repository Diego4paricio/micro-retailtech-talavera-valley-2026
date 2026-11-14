import type { FastifyRequest } from "fastify";
import { StaffRateLimitedError } from "./http/errors.js";

// A fixed-window, in-memory, per-process rate limit for the Staff API. The
// service had none (security review 2026-10-12, H1): even `requireStaffIdentity`
// runs a JWT verification and a database lookup before it can reject a
// non-staff token, so an unbounded request stream pressured the operations
// plane and the database. This mirrors the Customer API's limiter and is the
// allowed in-memory fallback to `@fastify/rate-limit`; it adds no dependency.
// Operations has few, known users, so a generous per-IP ceiling is plenty.

export type StaffRateLimitTier = { limit: number; windowMs: number };

export const defaultStaffRateLimit: StaffRateLimitTier = {
  limit: 300,
  windowMs: 60_000,
};

type Bucket = { count: number; resetAt: number };

export function createStaffRateLimiter(
  tier: StaffRateLimitTier = defaultStaffRateLimit,
): (request: FastifyRequest) => void {
  const buckets = new Map<string, Bucket>();
  let callsSinceSweep = 0;

  function sweep(now: number): void {
    callsSinceSweep += 1;
    if (callsSinceSweep < 500) return;
    callsSinceSweep = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function check(request: FastifyRequest): void {
    // Keyed by the socket/proxy IP (the token is not verified at this hook).
    const key = `ip:${request.ip}`;
    const now = Date.now();
    sweep(now);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + tier.windowMs });
      return;
    }
    if (bucket.count >= tier.limit) {
      throw new StaffRateLimitedError(
        Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      );
    }
    bucket.count += 1;
  };
}
