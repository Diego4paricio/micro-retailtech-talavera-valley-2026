import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createStaffSessionVerifier } from "../src/staff-session.js";

const issuer = "https://ipowddzbfxjqmrgxqius.supabase.co/auth/v1";
const subject = "e6abf26a-3263-4149-9d75-9b7441165d29";

async function signedToken(overrides: Record<string, string> = {}) {
  const keys = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "staff-test-key";
  const token = await new SignJWT({
    email: "operator@kardo.test",
    role: "authenticated",
    aal: "aal2",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "staff-test-key" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  return { token, key: createLocalJWKSet({ keys: [publicJwk] }) };
}

describe("staff session verification", () => {
  it("accepts only a signed AAL2 authenticated session", async () => {
    const { token, key } = await signedToken();
    const verifier = createStaffSessionVerifier({
      issuer,
      audience: "authenticated",
      key,
    });

    await expect(verifier.verify(`Bearer ${token}`)).resolves.toEqual({
      subject,
      email: "operator@kardo.test",
    });
  });

  it("rejects an AAL1 session before it can query staff storage", async () => {
    const { token, key } = await signedToken({ aal: "aal1" });
    const verifier = createStaffSessionVerifier({
      issuer,
      audience: "authenticated",
      key,
    });

    await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow(
      "AAL2 staff session",
    );
  });

  it("rejects a customer token signed by another Supabase issuer", async () => {
    const { token, key } = await signedToken();
    const verifier = createStaffSessionVerifier({
      issuer: "https://vgmacbcqfvfjqnbbnljr.supabase.co/auth/v1",
      audience: "authenticated",
      key,
    });

    await expect(verifier.verify(`Bearer ${token}`)).rejects.toThrow();
  });
});
