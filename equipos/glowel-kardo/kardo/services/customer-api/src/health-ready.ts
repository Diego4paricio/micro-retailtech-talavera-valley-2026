import { timingSafeEqual } from "node:crypto";
import type { HealthReady } from "@kardo/contracts";
import type { Sql } from "postgres";

/**
 * GET /health/ready (ADR 022): what the status Worker probes every minute.
 * Plain /health only says the process answers; this one also asks the
 * database (through the API's own least-privileged role) how old the oldest
 * waiting publication job is. It never touches customer data.
 */
export type ReadinessProbe = {
  check(): Promise<{
    ok: boolean;
    latencyMs: number;
    queue: { oldestPendingSeconds: number; pendingJobs: number } | null;
  }>;
};

/** Slower than this, the database counts as degraded. */
export const SLOW_DATABASE_MS = 1500;
/** 5xx in the window: at least this many and this share of the responses. */
export const SERVER_ERROR_MIN = 5;
export const SERVER_ERROR_RATE = 0.05;

export function createPostgresReadinessProbe(
  sql: Sql,
  timeoutMs = 3000,
): ReadinessProbe {
  return {
    async check() {
      const started = performance.now();
      try {
        const rows = await sql.begin(async (tx) => {
          await tx`
            select set_config('role', 'kardo_customer_api', true),
                   set_config('statement_timeout', ${String(timeoutMs)}, true)
          `;
          return tx<{ oldest_pending_seconds: number; pending_jobs: number }[]>`
            select oldest_pending_seconds, pending_jobs from kardo_private.status_probe()
          `;
        });
        const row = rows[0];
        return {
          ok: true,
          latencyMs: Math.round(performance.now() - started),
          queue: row
            ? {
                oldestPendingSeconds: Math.max(
                  0,
                  Number(row.oldest_pending_seconds),
                ),
                pendingJobs: Math.max(0, Number(row.pending_jobs)),
              }
            : { oldestPendingSeconds: 0, pendingJobs: 0 },
        };
      } catch {
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - started),
          queue: null,
        };
      }
    },
  };
}

export function unavailableReadinessProbe(): ReadinessProbe {
  return {
    async check() {
      return { ok: false, latencyMs: 0, queue: null };
    },
  };
}

export function readinessStatus(
  database: { ok: boolean; latencyMs: number },
  errors: { requests: number; serverErrors: number },
): HealthReady["status"] {
  if (!database.ok) return "error";
  if (database.latencyMs > SLOW_DATABASE_MS) return "degraded";
  if (
    errors.serverErrors >= SERVER_ERROR_MIN &&
    errors.serverErrors / Math.max(errors.requests, 1) >= SERVER_ERROR_RATE
  ) {
    return "degraded";
  }
  return "ok";
}

/** Constant-time comparison of the probe key. */
export function statusKeyMatches(
  expected: string,
  supplied: string | string[] | undefined,
): boolean {
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
