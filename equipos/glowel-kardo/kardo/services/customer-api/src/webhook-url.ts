import { isIP } from "node:net";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { ContentValidationError } from "./errors.js";

const BLOCKED_HOST_SUFFIXES = [".local", ".internal"];

/**
 * Save-time policy for a lead-delivery webhook URL, on top of the generic
 * `normalizePublicHttpsUrl` HTTPS/credentials rule: a webhook target must be
 * a real, publicly-routable *hostname* (never a literal IP, which sidesteps
 * hostname-based blocklists entirely) that clearly is not a
 * loopback/LAN-local name, on the default HTTPS port. This narrows what can
 * ever be saved; `resolveSafeWebhookAddress` (ssrf.ts) still re-validates
 * the resolved IP at send time, since a hostname's DNS answer can change
 * after it was saved.
 */
export function validateWebhookUrl(value: string): string {
  const normalized = normalizePublicHttpsUrl(value);
  if (!normalized) {
    throw new ContentValidationError(
      "INVALID_WEBHOOK_URL",
      "La URL del webhook debe ser una dirección completa que empiece con https://, sin usuario ni contraseña.",
    );
  }
  const url = new URL(normalized);
  // The WHATWG URL spec keeps the brackets in `.hostname` for a literal
  // IPv6 host (e.g. `"[::1]"`); `net.isIP` needs them stripped to recognize
  // it as an IP at all.
  const unbracketedHostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(unbracketedHostname) !== 0) {
    throw new ContentValidationError(
      "INVALID_WEBHOOK_URL",
      "La URL del webhook debe usar un nombre de dominio, no una dirección IP.",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new ContentValidationError(
      "INVALID_WEBHOOK_URL",
      "La URL del webhook debe ser de un servidor público (no localhost, .local ni .internal).",
    );
  }
  if (url.port && url.port !== "443") {
    throw new ContentValidationError(
      "INVALID_WEBHOOK_URL",
      "La URL del webhook debe usar el puerto normal de https (sin «:puerto»).",
    );
  }
  return normalized;
}
