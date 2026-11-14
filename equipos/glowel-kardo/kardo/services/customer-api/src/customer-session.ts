import {
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
  jwtVerify,
} from "jose";

export type CustomerIdentity = {
  subject: string;
  email: string;
  /** Supabase session behind the token (`session_id`), when it has one. */
  sessionId?: string;
};

export class CustomerSessionError extends Error {}

/** The account has a verified second factor and the token only proves the
 * password (or an email code): the panel asks for the code from the
 * authenticator app before anything else (relevo 28, ADR 023). */
export class SecondFactorRequiredError extends CustomerSessionError {}

export type SessionState = {
  /** The session still exists: not signed out nor closed from Configuración. */
  alive: boolean;
  /** The account has at least one verified second factor. */
  requiresSecondFactor: boolean;
};

export type SessionStateLookup = {
  stateOf(subject: string, sessionId: string): Promise<SessionState>;
  /** Drops a cached answer right after this API closes that session. */
  forget(sessionId: string): void;
};

export type CustomerSessionVerifier = {
  verify(authorization: string | undefined): Promise<CustomerIdentity>;
};

function bearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  const token = match?.[1];
  if (!token) throw new CustomerSessionError("A bearer token is required.");
  return token;
}

export function createCustomerSessionVerifier(input: {
  issuer: string;
  audience: string;
  key: JWTVerifyGetKey;
  /** Without it tokens are only checked cryptographically (unit tests). */
  sessions?: SessionStateLookup;
}): CustomerSessionVerifier {
  return {
    async verify(authorization) {
      const result = await jwtVerify(bearerToken(authorization), input.key, {
        issuer: input.issuer,
        audience: input.audience,
      });
      const identity = toCustomerIdentity(result.payload);
      if (!input.sessions) return identity;
      if (!identity.sessionId)
        throw new CustomerSessionError("The token has no session.");
      const state = await input.sessions.stateOf(
        identity.subject,
        identity.sessionId,
      );
      // Signed out, or closed from Configuración → Seguridad: the access
      // token is still signed, but its session is gone.
      if (!state.alive)
        throw new CustomerSessionError("The session was closed.");
      // Supabase signs `aal2` only after the second factor was verified in
      // this session. Activating TOTP used to protect nothing: an aal1 token
      // opened every route.
      if (state.requiresSecondFactor && result.payload.aal !== "aal2") {
        throw new SecondFactorRequiredError(
          "This account requires its second factor.",
        );
      }
      return identity;
    },
  };
}

export function createSupabaseCustomerSessionVerifier(
  issuer: string,
  audience: string,
  sessions: SessionStateLookup,
): CustomerSessionVerifier {
  return createCustomerSessionVerifier({
    issuer,
    audience,
    key: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
    sessions,
  });
}

export function unavailableCustomerSessionVerifier(): CustomerSessionVerifier {
  return {
    verify: async () =>
      Promise.reject(
        new CustomerSessionError("Authentication is not configured."),
      ),
  };
}

function toCustomerIdentity(payload: JWTPayload): CustomerIdentity {
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new CustomerSessionError(
      "The token is missing customer identity claims.",
    );
  }
  // Supabase issues the same JWT shape for anonymous and service-role
  // sessions; only a token whose `role` claim is exactly "authenticated"
  // represents a real signed-in customer. Rejecting anything else keeps an
  // anon-key or service-role token from ever reaching a customer route.
  if (payload.role !== "authenticated") {
    throw new CustomerSessionError(
      "The token does not represent an authenticated customer session.",
    );
  }
  if (payload.email.trim().length === 0) {
    throw new CustomerSessionError("The token is missing a verified email.");
  }
  const identity: CustomerIdentity = {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
  };
  if (typeof payload.session_id === "string")
    identity.sessionId = payload.session_id;
  return identity;
}
