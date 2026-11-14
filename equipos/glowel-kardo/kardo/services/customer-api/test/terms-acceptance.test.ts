import { type CustomerProfile, legalVersions } from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { CustomerSessionError } from "../src/customer-session.js";
import type { ProfileRepository } from "../src/repositories/profile.js";
import { authHeader, subjectId, verifierFor } from "./helpers.js";

const accepted: CustomerProfile = {
  subject: subjectId,
  email: "customer@kardo.test",
  displayName: "Dueña",
  termsAcceptedAt: "2026-09-29T20:00:00.000Z",
  termsVersion: legalVersions.terms,
  privacyVersion: legalVersions.privacy,
};

function repository(): ProfileRepository {
  return {
    getProfile: vi.fn().mockResolvedValue(accepted),
    updateProfile: vi.fn().mockResolvedValue(accepted),
    acceptLegalTerms: vi.fn().mockResolvedValue(accepted),
  };
}

describe("POST /v1/me/terms-acceptance (clickwrap)", () => {
  it("records the current versions and returns the evidence", async () => {
    const profileRepository = repository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      profileRepository,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/terms-acceptance",
      headers: authHeader,
      payload: {
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(accepted);
    expect(profileRepository.acceptLegalTerms).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      {
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
      },
    );
    await app.close();
  });

  it("refuses a version that is not the current one", async () => {
    const profileRepository = repository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      profileRepository,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/terms-acceptance",
      headers: authHeader,
      payload: { termsVersion: "0.9", privacyVersion: legalVersions.privacy },
    });
    expect(response.statusCode).toBe(400);
    expect(profileRepository.acceptLegalTerms).not.toHaveBeenCalled();
    await app.close();
  });

  it("ignores a client timestamp: the server stamps the time", async () => {
    const profileRepository = repository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      profileRepository,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/terms-acceptance",
      headers: authHeader,
      payload: {
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
        acceptedAt: "2020-01-01T00:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(profileRepository.acceptLegalTerms).toHaveBeenCalledWith(
      expect.anything(),
      {
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
      },
    );
    await app.close();
  });

  it("requires a session", async () => {
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => {
          throw new CustomerSessionError();
        },
      },
      profileRepository: repository(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/terms-acceptance",
      payload: {
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
      },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
