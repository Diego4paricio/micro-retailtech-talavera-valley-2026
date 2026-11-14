/**
 * Detects automated requests (bots, crawlers, and link-preview/prefetch
 * fetchers) so their hits can be excluded from tap/click analytics. This
 * never changes what is served: callers still return the normal page or
 * redirect for a flagged request, they simply skip the Analytics Engine
 * write for it.
 *
 * A request that carries no User-Agent header at all — as sent by Node's
 * built-in `fetch` (undici sends `user-agent: node`, and some runtimes send
 * none) — is never treated as automated on User-Agent grounds alone. Only an
 * explicit prefetch/preview purpose header, a HEAD request, or a known
 * bot/crawler/link-unfurler signature in the User-Agent counts.
 */

const purposeHeaderNames = ["sec-purpose", "purpose", "x-purpose"] as const;

// Generic "bot" already matches most named crawlers and link unfurlers
// (Slackbot, TelegramBot, Discordbot, LinkedInBot, Twitterbot, Googlebot,
// bingbot, Applebot, YandexBot, Facebot, …); the rest are listed explicitly
// because their User-Agent does not contain "bot".
const botUserAgentPattern =
  /bot|crawler|spider|facebookexternalhit|whatsapp|slack-imgproxy|skypeuripreview|headlesschrome|python-requests|curl|wget|go-http-client|okhttp/i;

const previewPurposePattern = /prefetch|preview/i;

export type AutomatedRequestSignal = {
  method: string;
  userAgent: string | null;
  purposeHeaderValues: readonly (string | null)[];
};

/** Pure predicate over the request signals that matter — easy to unit test
 * without constructing a full `Request`. */
export function isAutomatedRequestSignal(
  signal: AutomatedRequestSignal,
): boolean {
  if (signal.method === "HEAD") return true;
  if (
    signal.purposeHeaderValues.some(
      (value) => value !== null && previewPurposePattern.test(value),
    )
  ) {
    return true;
  }
  return (
    signal.userAgent !== null && botUserAgentPattern.test(signal.userAgent)
  );
}

/** Convenience wrapper reading the relevant headers off a real `Request`. */
export function isAutomatedRequest(request: Request): boolean {
  return isAutomatedRequestSignal({
    method: request.method,
    userAgent: request.headers.get("user-agent"),
    purposeHeaderValues: purposeHeaderNames.map((name) =>
      request.headers.get(name),
    ),
  });
}
