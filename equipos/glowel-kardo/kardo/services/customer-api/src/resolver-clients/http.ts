/**
 * Shared by every Resolver command client (A9-15): one error type and one
 * `post` factory that authorizes, times out and only resolves on a 2xx
 * answer. Each client in this folder (`touchpoint-availability.ts`,
 * `business-routes.ts`, `item-availability.ts`) names its own commands and
 * payload shapes; only this plumbing is common to all of them.
 */

export class TouchpointAvailabilityError extends Error {}

export type ResolverCommandInput = {
  resolverUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

/** POSTs an authorized internal command to the Resolver and resolves only on
 * a 2xx answer. */
export function resolverCommandPoster(
  input: ResolverCommandInput,
): (path: string, body: unknown) => Promise<void> {
  const base = new URL("/internal/availability", input.resolverUrl);
  if (base.protocol !== "https:") {
    throw new TouchpointAvailabilityError(
      "Resolver availability endpoint must use HTTPS.",
    );
  }
  const fetchFn = input.fetchFn ?? fetch;
  // These calls run inside an open database transaction (see
  // `updateTouchpointStatus` and the item availability repository), which
  // must never be held open indefinitely by a slow or hanging Resolver. A
  // tight timeout bounds how long that transaction — and the row lock it
  // holds — can stay open.
  const timeoutMs = input.timeoutMs ?? 5_000;
  return async function post(path: string, body: unknown): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(new URL(path, input.resolverUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.commandKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new TouchpointAvailabilityError(
        "Resolver could not apply the command.",
      );
    } finally {
      clearTimeout(timer);
    }
    await response.body?.cancel();
    if (!response.ok)
      throw new TouchpointAvailabilityError(
        "Resolver could not apply the command.",
      );
  };
}
