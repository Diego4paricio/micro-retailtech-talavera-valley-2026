import type { FastifyReply, FastifyRequest } from "fastify";
import { decodeJwt } from "jose";
import { RateLimitedError } from "./errors.js";

export type RateLimitTier = {
  /** Maximum requests allowed inside one window. */
  limit: number;
  windowMs: number;
};

export type RateLimitConfig = {
  general: RateLimitTier;
  sensitive: RateLimitTier;
};

export const defaultRateLimitConfig: RateLimitConfig = {
  // Per IP (several people of one business may share it).
  general: { limit: 600, windowMs: 60_000 },
  // Per verified subject.
  sensitive: { limit: 20, windowMs: 60_000 },
};

type Bucket = { count: number; resetAt: number };

/** A fixed-window limiter keyed by an arbitrary string. In-memory and
 * per-process: adequate for a single Customer API instance, and explicitly
 * allowed as a fallback to `@fastify/rate-limit` by the hardening plan this
 * implements. Buckets past their window are dropped opportunistically so the
 * map does not grow without bound under sustained unique-key traffic. */
export function createFixedWindowLimiter(tier: RateLimitTier) {
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

  return function check(key: string): {
    allowed: boolean;
    retryAfterSeconds: number;
  } {
    const now = Date.now();
    sweep(now);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + tier.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= tier.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        ),
      };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

/** The general limit runs before the token is verified, so it is keyed by
 * the caller's IP only: keying it by the `sub` of an unverified token let
 * anyone mint a fresh bucket per request (security review 2026-10, V7). */
export function generalRateLimitKey(request: FastifyRequest): string {
  return `ip:${request.ip}`;
}

/**
 * The sensitive limit is keyed by the subject of the bearer token. Routes
 * call it only after `requireSession` verified that same token, so the
 * decoded `sub` is the verified one; without a usable token it falls back
 * to the IP.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const match = header?.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  const token = match?.[1];
  if (token) {
    try {
      const payload = decodeJwt(token);
      if (typeof payload.sub === "string" && payload.sub.length > 0) {
        return `sub:${payload.sub}`;
      }
    } catch {
      // Fall through to the IP-based key below.
    }
  }
  return `ip:${request.ip}`;
}

export type RateLimiters = {
  checkGeneral(request: FastifyRequest): void;
  checkSensitive(request: FastifyRequest): void;
};

export function createRateLimiters(config: RateLimitConfig): RateLimiters {
  const general = createFixedWindowLimiter(config.general);
  const sensitive = createFixedWindowLimiter(config.sensitive);
  return {
    checkGeneral(request) {
      const result = general(generalRateLimitKey(request));
      if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
    },
    checkSensitive(request) {
      const result = sensitive(`sensitive:${rateLimitKey(request)}`);
      if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
    },
  };
}

/** Attaches the `Retry-After` header for a rate-limited response. Kept
 * separate from the error handler's generic error-to-response mapping since
 * only this error type carries a header. */
export function applyRetryAfter(
  reply: FastifyReply,
  retryAfterSeconds: number,
): void {
  reply.header("retry-after", String(retryAfterSeconds));
}
