import { normalizePublicHttpsUrl } from "@kardo/domain";

export class RedirectDestinationError extends Error {}

/**
 * Every public-facing URL in the API — redirect destinations, link items,
 * profile links, catalog item links — goes through this one function, which
 * simply wraps `@kardo/domain`'s `normalizePublicHttpsUrl`. Centralizing on
 * the domain package's rule (rather than re-implementing HTTPS/credential
 * checks per call site) keeps the API, Publisher and Resolver from silently
 * diverging on what counts as a safe URL.
 */
export function validateRedirectDestination(value: string): string {
  const normalized = normalizePublicHttpsUrl(value);
  if (!normalized) {
    throw new RedirectDestinationError(
      "A complete HTTPS destination without embedded credentials is required.",
    );
  }
  return normalized;
}
