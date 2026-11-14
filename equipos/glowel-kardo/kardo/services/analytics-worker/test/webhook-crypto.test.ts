import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  signWebhookPayload,
} from "../src/webhook-crypto.js";

// A valid 32-byte AES-256-GCM key, base64url-encoded (the LEAD_WEBHOOK_KEY shape).
const key = Buffer.alloc(32, 7).toString("base64url");

describe("signWebhookPayload", () => {
  it("produces a header whose HMAC-SHA256 an independent implementation can verify", async () => {
    const timestamp = 1_700_000_000;
    const header = await signWebhookPayload(
      "test-secret",
      '{"a":1}',
      timestamp,
    );
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    const hex = header.split("v1=")[1];
    const expected = createHmac("sha256", "test-secret")
      .update(`${timestamp}.{"a":1}`)
      .digest("hex");
    expect(hex).toBe(expected);
  });

  it("changes the signature when the body changes", async () => {
    const a = await signWebhookPayload("test-secret", "body-a", 1);
    const b = await signWebhookPayload("test-secret", "body-b", 1);
    expect(a).not.toBe(b);
  });

  it("defaults the timestamp to the current time when omitted", async () => {
    const before = Math.floor(Date.now() / 1000);
    const header = await signWebhookPayload("test-secret", "body");
    const timestamp = Number(header.match(/^t=(\d+),/)?.[1]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
  });
});

describe("encryptWebhookSecret / decryptWebhookSecret", () => {
  it("round-trips a secret through the same workspace AAD", async () => {
    const ciphertext = await encryptWebhookSecret(
      "whsec_abc123",
      key,
      "workspace-1",
    );
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext.split(":")).toHaveLength(3);
    await expect(
      decryptWebhookSecret(ciphertext, key, "workspace-1"),
    ).resolves.toBe("whsec_abc123");
  });

  it("produces a different ciphertext (fresh IV) on every call", async () => {
    const first = await encryptWebhookSecret(
      "whsec_abc123",
      key,
      "workspace-1",
    );
    const second = await encryptWebhookSecret(
      "whsec_abc123",
      key,
      "workspace-1",
    );
    expect(first).not.toBe(second);
  });

  it("fails to decrypt under a different workspace id (AAD binds the ciphertext)", async () => {
    const ciphertext = await encryptWebhookSecret(
      "whsec_abc123",
      key,
      "workspace-1",
    );
    await expect(
      decryptWebhookSecret(ciphertext, key, "workspace-2"),
    ).rejects.toThrow();
  });

  it("fails to decrypt with the wrong key", async () => {
    const otherKey = Buffer.alloc(32, 9).toString("base64url");
    const ciphertext = await encryptWebhookSecret(
      "whsec_abc123",
      key,
      "workspace-1",
    );
    await expect(
      decryptWebhookSecret(ciphertext, otherKey, "workspace-1"),
    ).rejects.toThrow();
  });

  it("rejects a malformed ciphertext format", async () => {
    await expect(
      decryptWebhookSecret("not-the-right-format", key, "workspace-1"),
    ).rejects.toThrow();
    await expect(
      decryptWebhookSecret("v2:aa:bb", key, "workspace-1"),
    ).rejects.toThrow();
  });

  it("rejects a key that does not decode to exactly 32 bytes", async () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64url");
    await expect(
      encryptWebhookSecret("whsec_abc123", shortKey, "workspace-1"),
    ).rejects.toThrow();
  });
});
