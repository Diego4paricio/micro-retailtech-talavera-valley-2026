import type { StaffServiceStatus, StatusIncidentSet } from "@kardo/contracts";

/**
 * The status Worker (ADR 022): technical detail for Operations, and the
 * incidents and maintenance it shows to customers. Staff writes go to
 * Postgres first and are pushed here inside the same transaction, so a push
 * that fails rolls the change back (same pattern as item availability).
 */
export type StatusWorkerClient = {
  getDetail(): Promise<StaffServiceStatus>;
  publishIncidents(set: StatusIncidentSet): Promise<void>;
  /** Runs the probes now (dev and E2E). */
  runChecks(): Promise<void>;
};

export class StatusWorkerError extends Error {}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function createStatusWorkerClient(input: {
  statusUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): StatusWorkerClient {
  const base = new URL(input.statusUrl);
  // https always, except `wrangler dev` on this machine.
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && loopbackHosts.has(base.hostname))
  ) {
    throw new StatusWorkerError("The status Worker must use HTTPS.");
  }
  const fetchFn = input.fetchFn ?? fetch;
  // Pushes run inside an open transaction: never hold it for long.
  const timeoutMs = input.timeoutMs ?? 5_000;

  async function call(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(new URL(path, base), {
        method: init.method,
        headers: {
          authorization: `Bearer ${input.commandKey}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new StatusWorkerError(
          `The status Worker answered ${response.status}.`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof StatusWorkerError) throw error;
      throw new StatusWorkerError("The status Worker did not answer.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getDetail() {
      const response = await call("/internal/status", { method: "GET" });
      return (await response.json()) as StaffServiceStatus;
    },
    async publishIncidents(set) {
      await call("/internal/incidents", { method: "PUT", body: set });
    },
    async runChecks() {
      await call("/internal/check", { method: "POST" });
    },
  };
}
