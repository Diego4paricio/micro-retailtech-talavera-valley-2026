import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  WebhookCryptoError,
} from "../src/webhook-crypto.js";

const key = randomBytes(32).toString("base64url");
const otherKey = randomBytes(32).toString("base64url");

describe("webhook secret encryption", () => {
  it("round-trips a secret through encrypt/decrypt with the same AAD", async () => {
    const plaintext = generateWebhookSecret();
    const envelope = await encryptWebhookSecret({
      plaintext,
      workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
      base64UrlKey: key,
    });
    expect(envelope.startsWith("v1:")).toBe(true);
    const decrypted = await decryptWebhookSecret({
      envelope,
      workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
      base64UrlKey: key,
    });
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with the wrong workspace id (AAD mismatch)", async () => {
    const plaintext = generateWebhookSecret();
    const envelope = await encryptWebhookSecret({
      plaintext,
      workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
      base64UrlKey: key,
    });
    await expect(
      decryptWebhookSecret({
        envelope,
        workspaceId: "00000000-0000-0000-0000-000000000000",
        base64UrlKey: key,
      }),
    ).rejects.toThrow(WebhookCryptoError);
  });

  it("fails to decrypt with the wrong key", async () => {
    const plaintext = generateWebhookSecret();
    const envelope = await encryptWebhookSecret({
      plaintext,
      workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
      base64UrlKey: key,
    });
    await expect(
      decryptWebhookSecret({
        envelope,
        workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
        base64UrlKey: otherKey,
      }),
    ).rejects.toThrow(WebhookCryptoError);
  });

  it("rejects a malformed envelope", async () => {
    await expect(
      decryptWebhookSecret({
        envelope: "not-a-real-envelope",
        workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
        base64UrlKey: key,
      }),
    ).rejects.toThrow(WebhookCryptoError);
  });

  it("generates a secret matching the whsec_ pattern", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{32,64}$/);
  });
});
