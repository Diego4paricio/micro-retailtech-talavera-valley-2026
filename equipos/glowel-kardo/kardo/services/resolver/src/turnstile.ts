import { isRecord } from "./snapshot.js";

const siteverifyUrl =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile response token server-side. Never throws:
 * any network failure, non-2xx response, or malformed body is treated as a
 * failed verification, so the caller always gets a plain boolean answer.
 * `fetchImpl` defaults to the global `fetch` and exists so tests can inject a
 * stub instead of making a real network call.
 */
export async function verifyTurnstile(input: {
  secretKey: string;
  token: string;
  remoteIp: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (!input.token) return false;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(siteverifyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: input.secretKey,
        response: input.token,
        remoteip: input.remoteIp,
      }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return isRecord(result) && result.success === true;
  } catch {
    return false;
  }
}
