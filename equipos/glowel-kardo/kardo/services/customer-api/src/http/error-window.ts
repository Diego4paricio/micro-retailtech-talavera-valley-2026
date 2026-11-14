/**
 * Counts this instance's responses and 5xx over the last few minutes, in
 * one-minute buckets, for GET /health/ready (ADR 022). An approximation by
 * design: on Cloud Run every instance keeps its own count and the status
 * Worker sees whichever instance answers its probe.
 */
export type ErrorWindow = {
  record(statusCode: number, now?: number): void;
  snapshot(now?: number): {
    windowSeconds: number;
    requests: number;
    serverErrors: number;
  };
};

export function createErrorWindow(minutes = 5): ErrorWindow {
  const buckets = new Map<number, { requests: number; serverErrors: number }>();

  function prune(currentMinute: number): void {
    for (const minute of buckets.keys()) {
      if (minute <= currentMinute - minutes) buckets.delete(minute);
    }
  }

  return {
    record(statusCode, now = Date.now()) {
      const minute = Math.floor(now / 60_000);
      prune(minute);
      const bucket = buckets.get(minute) ?? { requests: 0, serverErrors: 0 };
      bucket.requests += 1;
      if (statusCode >= 500) bucket.serverErrors += 1;
      buckets.set(minute, bucket);
    },
    snapshot(now = Date.now()) {
      const minute = Math.floor(now / 60_000);
      prune(minute);
      let requests = 0;
      let serverErrors = 0;
      for (const bucket of buckets.values()) {
        requests += bucket.requests;
        serverErrors += bucket.serverErrors;
      }
      return { windowSeconds: minutes * 60, requests, serverErrors };
    },
  };
}
