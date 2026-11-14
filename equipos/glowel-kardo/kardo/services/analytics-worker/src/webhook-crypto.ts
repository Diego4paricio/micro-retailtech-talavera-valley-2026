/**
 * Webhook secret encryption + outgoing signature format.
 *
 * Shared, byte-for-byte, between the Customer API (which encrypts the secret
 * when a workspace configures its webhook) and this Worker (which decrypts
 * it to sign outgoing lead.created deliveries). Implemented with pure
 * WebCrypto (no `node:crypto`) so this exact module can be copied into the
 * Customer API unchanged.
 *
 * Ciphertext format stored in `lead_delivery_settings.webhook_secret_ciphertext`:
 *
 *   "v1:" + base64url(iv) + ":" + base64url(ciphertext_and_tag)
 *
 *   - iv: 12 random bytes (AES-GCM nonce), regenerated on every encryption.
 *   - key: AES-256-GCM, 32 raw bytes, itself base64url-encoded in the
 *     `LEAD_WEBHOOK_KEY` secret (never stored in Postgres).
 *   - AAD (additional authenticated data): the UTF-8 bytes of the
 *     workspace_id the secret belongs to. This binds the ciphertext to that
 *     workspace: it cannot be decrypted (or silently reused) under a
 *     different workspace_id, even with the right key.
 *   - ciphertext_and_tag: WebCrypto's AES-GCM `encrypt()` output as-is (the
 *     16-byte authentication tag is appended by WebCrypto itself).
 *
 * Outgoing webhook signature header (`x-kardo-signature`), Stripe-style:
 *
 *   t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 *
 *   `secret` is the decrypted webhook secret, used as raw UTF-8 HMAC key
 *   material (not itself base64/hex decoded).
 */

const base64UrlAlphabet = /^[A-Za-z0-9_-]+$/;

export async function encryptWebhookSecret(
  secret: string,
  base64UrlKey: string,
  workspaceId: string,
): Promise<string> {
  const key = await importAesKey(base64UrlKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(workspaceId),
      },
      key,
      new TextEncoder().encode(secret),
    ),
  );
  return `v1:${base64UrlEncode(iv)}:${base64UrlEncode(ciphertext)}`;
}

export async function decryptWebhookSecret(
  ciphertext: string,
  base64UrlKey: string,
  workspaceId: string,
): Promise<string> {
  const parts = ciphertext.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported webhook secret ciphertext format.");
  }
  const ivPart = parts[1] ?? "";
  const dataPart = parts[2] ?? "";
  if (!base64UrlAlphabet.test(ivPart) || !base64UrlAlphabet.test(dataPart)) {
    throw new Error("Malformed webhook secret ciphertext.");
  }
  const iv = base64UrlDecode(ivPart);
  if (iv.byteLength !== 12) {
    throw new Error("Invalid webhook secret IV length.");
  }
  const key = await importAesKey(base64UrlKey);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(workspaceId),
    },
    key,
    base64UrlDecode(dataPart),
  );
  return new TextDecoder().decode(plaintext);
}

/** Builds the `x-kardo-signature` header value for an outgoing webhook body. */
export async function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return `t=${timestamp},v1=${toHex(new Uint8Array(signature))}`;
}

async function importAesKey(base64UrlKey: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(base64UrlKey);
  if (raw.byteLength !== 32) {
    throw new Error("LEAD_WEBHOOK_KEY must decode to exactly 32 bytes.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
