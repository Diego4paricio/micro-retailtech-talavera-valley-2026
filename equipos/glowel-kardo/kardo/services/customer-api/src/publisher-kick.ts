/**
 * Asks the Publisher to drain its queue right after a publication is queued,
 * so customers see "Published" in seconds instead of waiting for the next
 * scheduled tick. Fire-and-forget: the scheduled run remains the guarantee,
 * so a failed kick never fails the customer's request.
 */
export type PublisherKick = () => void;

export const noopPublisherKick: PublisherKick = () => {};

export function createPublisherKick(input: {
  publisherUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  onError?: (error: unknown) => void;
}): PublisherKick {
  const endpoint = new URL("/internal/run-once", input.publisherUrl);
  if (endpoint.protocol !== "https:")
    throw new Error("Publisher endpoint must use HTTPS.");
  const fetchFn = input.fetchFn ?? fetch;
  return () => {
    void fetchFn(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${input.commandKey}` },
      signal: AbortSignal.timeout(30_000),
    })
      .then((response) => response.body?.cancel())
      .catch((error: unknown) => input.onError?.(error));
  };
}
