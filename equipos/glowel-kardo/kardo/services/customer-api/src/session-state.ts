import type { Sql } from "postgres";
import type { SessionState, SessionStateLookup } from "./customer-session.js";

/** How long an answer is reused. Enrolling a factor already upgrades the
 * session that did it to aal2, and closing a session from Configuración
 * forgets it right away (`forget`), so this only delays, by a few seconds,
 * the effect of a change made on another device or API instance. */
export const SESSION_STATE_CACHE_MS = 10_000;
const MAX_CACHED_SESSIONS = 5_000;

/**
 * Asks Postgres whether a Supabase session is still alive and whether its
 * account has a verified second factor, through
 * `kardo_private.customer_session_state` (the API role cannot read the auth
 * schema). Every request carries a token, so the answer is cached per
 * session for a few seconds. A database error is never read as "alive" or
 * "no factor": it propagates and the request fails.
 */
export function createPostgresSessionStateLookup(
  sql: Sql,
  now: () => number = Date.now,
): SessionStateLookup {
  const cache = new Map<string, { state: SessionState; until: number }>();
  return {
    async stateOf(subject, sessionId) {
      const key = `${subject}:${sessionId}`;
      const cached = cache.get(key);
      if (cached && cached.until > now()) return cached.state;
      // The runtime login is NOINHERIT: like every repository, it takes the
      // API role for this transaction only (see repositories/context.ts).
      const state = await sql.begin(async (transaction) => {
        await transaction`select set_config('role', 'kardo_customer_api', true)`;
        const [row] = await transaction<
          { session_alive: boolean; requires_second_factor: boolean }[]
        >`
          select session_alive, requires_second_factor
          from kardo_private.customer_session_state(${subject}::uuid, ${sessionId}::uuid)
        `;
        return {
          alive: row?.session_alive === true,
          // Unknown counts as required: only a clear "no" skips the factor.
          requiresSecondFactor: row?.requires_second_factor !== false,
        };
      });
      if (cache.size >= MAX_CACHED_SESSIONS) cache.clear();
      cache.set(key, { state, until: now() + SESSION_STATE_CACHE_MS });
      return state;
    },
    forget(sessionId) {
      for (const key of cache.keys())
        if (key.endsWith(`:${sessionId}`)) cache.delete(key);
    },
  };
}

/** Without a database nothing can say whether a session is alive: refuse. */
export function unavailableSessionStateLookup(): SessionStateLookup {
  return {
    stateOf: () =>
      Promise.reject(new Error("Session storage is not configured.")),
    forget: () => undefined,
  };
}
