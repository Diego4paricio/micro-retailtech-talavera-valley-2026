/**
 * Truncated SHA-256 of the caller's IP, never the IP itself. Callers combine
 * this with a route-specific prefix (e.g. a publicId) to key a RateLimit
 * binding without ever storing or logging the address.
 */
export async function hashClientIp(ip: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)),
  );
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Rate limiting is a hardening layer, not the public path's availability
 * guarantee: if the RateLimit binding itself is unreachable, requests are
 * allowed through (fail open) rather than taking the Touchpoint down, the
 * same posture already used for Analytics Engine writes.
 */
export async function isRateLimited(
  limiter: RateLimit,
  key: string,
): Promise<boolean> {
  try {
    const outcome = await limiter.limit({ key });
    return !outcome.success;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "rate limiter unavailable, failing open",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}
