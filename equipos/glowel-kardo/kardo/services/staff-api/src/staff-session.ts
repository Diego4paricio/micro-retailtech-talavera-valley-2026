import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";
import { StaffMfaRequiredError, StaffSessionError } from "./http/errors.js";

export type StaffIdentity = {
  subject: string;
  email: string;
};

export type StaffSessionVerifier = {
  verify(authorization: string | undefined): Promise<StaffIdentity>;
};

function bearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  const token = match?.[1];
  if (!token) throw new StaffSessionError("A bearer token is required.");
  return token;
}

export function createStaffSessionVerifier(input: {
  issuer: string;
  audience: string;
  key: JWTVerifyGetKey;
}): StaffSessionVerifier {
  return {
    async verify(authorization) {
      const result = await jwtVerify(bearerToken(authorization), input.key, {
        issuer: input.issuer,
        audience: input.audience,
      });
      return toStaffIdentity(result.payload);
    },
  };
}

export function createSupabaseStaffSessionVerifier(
  issuer: string,
  audience: string,
): StaffSessionVerifier {
  return createStaffSessionVerifier({
    issuer,
    audience,
    key: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
  });
}

export function unavailableStaffSessionVerifier(): StaffSessionVerifier {
  return {
    verify: async () =>
      Promise.reject(
        new StaffSessionError("Authentication is not configured."),
      ),
  };
}

function toStaffIdentity(payload: JWTPayload): StaffIdentity {
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.role !== "authenticated"
  ) {
    throw new StaffSessionError("The token is missing staff identity claims.");
  }
  if (payload.aal !== "aal2") {
    throw new StaffMfaRequiredError("An AAL2 staff session is required.");
  }
  return { subject: payload.sub, email: payload.email };
}
