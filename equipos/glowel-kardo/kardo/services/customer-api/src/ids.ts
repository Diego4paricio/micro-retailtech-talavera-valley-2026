import { randomBytes } from "node:crypto";

const PUBLIC_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** A random, non-predictable public id drawn from `[A-Za-z0-9_-]`. Used for
 * Touchpoint and organization workspace public ids alike. */
export function randomPublicId(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PUBLIC_ID_ALPHABET[(bytes[i] ?? 0) % PUBLIC_ID_ALPHABET.length];
  }
  return out;
}

/** A random workspace-invitation token. Base64url has no padding characters,
 * so 32 random bytes always produce a 43-character `[A-Za-z0-9_-]` string —
 * inside the `CreatedInvitation` contract's 32-128 length bound. Only its
 * SHA-256 hash is ever persisted. */
export function randomInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}
