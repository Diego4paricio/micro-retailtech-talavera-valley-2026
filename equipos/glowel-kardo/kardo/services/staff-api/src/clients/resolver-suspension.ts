/**
 * Tells the Resolver to start or stop refusing public traffic for a
 * Touchpoint. Mirrors the Customer API's `touchpoint-availability.ts`
 * (`/internal/availability`) but for the staff-only suspension layer:
 * suspension is independent of the customer-facing active/paused status, and
 * only Kardo staff can set or lift it.
 */
export type ResolverSuspensionClient = {
  setSuspended(input: { publicId: string; suspended: boolean }): Promise<void>;
};

export class ResolverSuspensionError extends Error {}

export function createResolverSuspensionClient(input: {
  resolverUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): ResolverSuspensionClient {
  const endpoint = new URL("/internal/suspension", input.resolverUrl);
  if (endpoint.protocol !== "https:") {
    throw new ResolverSuspensionError(
      "Resolver suspension endpoint must use HTTPS.",
    );
  }
  const fetchFn = input.fetchFn ?? fetch;
  // This call runs inside an open database transaction, which must never be
  // held open indefinitely by a slow or hanging Resolver. A tight timeout
  // bounds how long that transaction — and the row lock it holds — can stay
  // open.
  const timeoutMs = input.timeoutMs ?? 5_000;
  return {
    async setSuspended(value) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.commandKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(value),
          signal: controller.signal,
        });
      } catch {
        throw new ResolverSuspensionError(
          "Resolver could not update Touchpoint suspension.",
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new ResolverSuspensionError(
          "Resolver could not update Touchpoint suspension.",
        );
      }
    },
  };
}
