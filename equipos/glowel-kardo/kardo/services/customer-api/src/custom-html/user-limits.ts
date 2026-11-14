import { RateLimitedError } from "../errors.js";

/**
 * Estudio de Experiences, modo HTML: per-user protections on top of the
 * per-organization daily cap (`limiter.ts`) and the global daily budget
 * (`budget.ts`) — at most one Kardo AI generation running at a time per
 * customer, and at most 5 started in any rolling hour.
 *
 * In-process only: state lives in this Customer API instance's own memory,
 * not shared across instances or restarts. That is fine while the service
 * runs as a single instance; if it is ever scaled to more than one
 * instance, this needs a shared store (Postgres or Redis) to stay correct.
 */
export type CustomHtmlUserLimits = {
  /** Throws `RateLimitedError` (Spanish message) when this subject already
   * has a generation running, or already started 5 in the last rolling
   * hour. On success, returns a `release()` to call exactly once — in a
   * `finally` — when the generation ends, so the concurrency slot frees up
   * whether it succeeded or failed. */
  begin(subject: string): () => void;
  /** This subject's starts in the rolling hour and whether one is running,
   * for the one AI counter every surface shows (domain audit A2-37). */
  peek(subject: string): {
    used: number;
    limit: number;
    remaining: number;
    running: boolean;
  };
};

const MAX_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export function createCustomHtmlUserLimits(): CustomHtmlUserLimits {
  const runningSubjects = new Set<string>();
  const recentStartsBySubject = new Map<string, number[]>();

  const startsInLastHour = (subject: string, now: number) =>
    (recentStartsBySubject.get(subject) ?? []).filter(
      (startedAt) => now - startedAt < HOUR_MS,
    );

  return {
    peek(subject) {
      const used = startsInLastHour(subject, Date.now()).length;
      return {
        used,
        limit: MAX_PER_HOUR,
        remaining: Math.max(0, MAX_PER_HOUR - used),
        running: runningSubjects.has(subject),
      };
    },
    begin(subject) {
      if (runningSubjects.has(subject)) {
        throw new RateLimitedError(
          10,
          "Ya tienes una generación de la IA de Kardo en curso. Espera a que termine.",
        );
      }

      const now = Date.now();
      const recent = (recentStartsBySubject.get(subject) ?? []).filter(
        (startedAt) => now - startedAt < HOUR_MS,
      );
      if (recent.length >= MAX_PER_HOUR) {
        const oldestStillCounting = Math.min(...recent);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldestStillCounting + HOUR_MS - now) / 1000),
        );
        throw new RateLimitedError(
          retryAfterSeconds,
          "Ya usaste tus 5 generaciones de la IA de Kardo de esta hora. Intenta más tarde.",
        );
      }

      recent.push(now);
      recentStartsBySubject.set(subject, recent);
      runningSubjects.add(subject);

      let released = false;
      return () => {
        if (released) return;
        released = true;
        runningSubjects.delete(subject);
      };
    },
  };
}
