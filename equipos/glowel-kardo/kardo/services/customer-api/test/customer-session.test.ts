import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createCustomerSessionVerifier } from "../src/customer-session.js";

const issuer = "https://ipowddzbfxjqmrgxqius.supabase.co/auth/v1";
const subject = "e6abf26a-3263-4149-9d75-9b7441165d29";

async function signedToken(overrides: Record<string, string> = {}) {
  const keys = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "test-key";
  const token = await new SignJWT({
    email: "customer@kardo.test",
    role: "authenticated",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  return { token, key: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe("customer session verification", () => {
  it("accepts a signed token with the expected issuer and audience", async () => {
    const { token, key } = await signedToken();
    const verifier = createCustomerSessionVerifier({
      issuer,
      audience: "authenticated",
      key,
    });
    await expect(verifier.verify(`Bearer ${token}`)).resolves.toEqual({
      subject,
      email: "customer@kardo.test",
    });
  });

  it("rejects a token with the wrong audience", async () => {
    const { token, key } = await signedToken();
    const verifier = createCustomerSessionVerifier({
      issuer,
      audience: "customer",
      key,
    });
    await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow();
  });

  it("rejects a token from another Supabase issuer", async () => {
    const { token, key } = await signedToken();
    const verifier = createCustomerSessionVerifier({
      issuer: "https://vgmacbcqfvfjqnbbnljr.supabase.co/auth/v1",
      audience: "authenticated",
      key,
    });
    await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow();
  });

  it("lowercases the email claim for consistent RLS session variables", async () => {
    const { token, key } = await signedToken({ email: "Customer@Kardo.TEST" });
    const verifier = createCustomerSessionVerifier({
      issuer,
      audience: "authenticated",
      key,
    });
    await expect(verifier.verify(`Bearer ${token}`)).resolves.toEqual({
      subject,
      email: "customer@kardo.test",
    });
  });

  it.each(["anon", "service_role"])(
    "rejects a token whose role claim is %s instead of authenticated",
    async (role) => {
      const { token, key } = await signedToken({ role });
      const verifier = createCustomerSessionVerifier({
        issuer,
        audience: "authenticated",
        key,
      });
      await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow();
    },
  );

  it("rejects a token with an empty email claim", async () => {
    const { token, key } = await signedToken({ email: "   " });
    const verifier = createCustomerSessionVerifier({
      issuer,
      audience: "authenticated",
      key,
    });
    await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow();
  });
});
