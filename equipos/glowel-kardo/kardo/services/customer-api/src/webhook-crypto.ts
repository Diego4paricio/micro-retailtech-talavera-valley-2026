import { randomBytes } from "node:crypto";

/**
 * Encrypts/decrypts a lead-delivery webhook signing secret at rest, in the
 * exact envelope format the Analytics Worker (which signs outgoing webhook
 * payloads and therefore needs the plaintext secret) also implements:
 *
 *   "v1:" + base64url(12-byte IV) + ":" + base64url(ciphertext || GCM tag)
 *
 * AES-256-GCM via WebCrypto (`globalThis.crypto.subtle`), keyed by
 * `LEAD_WEBHOOK_KEY` (32 raw bytes, base64url), with the workspace id as
 * Additional Authenticated Data — binding a ciphertext to the workspace row
 * it was written for, so it cannot be replayed onto a different workspace's
 * settings even if the ciphertext bytes were somehow copied across rows.
 */

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const ENVELOPE_VERSION = "v1";

export class WebhookCryptoError extends Error {}

function decodeKey(base64UrlKey: string): Uint8Array {
  const raw = Buffer.from(base64UrlKey, "base64url");
  if (raw.length !== 32) {
    throw new WebhookCryptoError(
      "LEAD_WEBHOOK_KEY must decode to exactly 32 bytes.",
    );
  }
  return raw;
}

async function importKey(base64UrlKey: string): Promise<CryptoKey> {
  const raw = decodeKey(base64UrlKey);
  return globalThis.crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    ALGORITHM,
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWebhookSecret(input: {
  plaintext: string;
  workspaceId: string;
  base64UrlKey: string;
}): Promise<string> {
  const key = await importKey(input.base64UrlKey);
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv as unknown as BufferSource,
      additionalData: new TextEncoder().encode(input.workspaceId),
    },
    key,
    new TextEncoder().encode(input.plaintext),
  );
  return [
    ENVELOPE_VERSION,
    Buffer.from(iv).toString("base64url"),
    Buffer.from(ciphertext).toString("base64url"),
  ].join(":");
}

export async function decryptWebhookSecret(input: {
  envelope: string;
  workspaceId: string;
  base64UrlKey: string;
}): Promise<string> {
  const parts = input.envelope.split(":");
  const [version, ivPart, dataPart] = parts;
  if (
    parts.length !== 3 ||
    version !== ENVELOPE_VERSION ||
    !ivPart ||
    !dataPart
  ) {
    throw new WebhookCryptoError("Unrecognized webhook secret envelope.");
  }
  const key = await importKey(input.base64UrlKey);
  const iv = Buffer.from(ivPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv as unknown as BufferSource,
        additionalData: new TextEncoder().encode(input.workspaceId),
      },
      key,
      data as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new WebhookCryptoError(
      "Failed to decrypt the webhook secret (wrong key or AAD).",
    );
  }
}

/** `whsec_` + 32 random bytes, base64url — matches
 * `LeadDeliverySettingsResultSchema.webhookSecret`'s pattern. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/**
 * Builds the `x-kardo-signature` header value for an outgoing webhook body:
 * the exact twin of `signWebhookPayload` in the Analytics Worker, so the
 * panel's test event is signed like a real delivery (domain audit A2-53;
 * `test/webhook-crypto-twin.test.ts` compares both byte for byte).
 */
export async function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${hex}`;
}
