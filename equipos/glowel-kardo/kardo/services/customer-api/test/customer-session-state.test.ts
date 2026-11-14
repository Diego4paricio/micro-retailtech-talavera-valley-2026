import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  CustomerSessionError,
  createCustomerSessionVerifier,
  SecondFactorRequiredError,
  type SessionState,
} from "../src/customer-session.js";
import type { AccountRepository } from "../src/repositories/account.js";
import {
  createPostgresSessionStateLookup,
  SESSION_STATE_CACHE_MS,
} from "../src/session-state.js";
import { authHeader, subjectId } from "./helpers.js";

const issuer = "https://ipowddzbfxjqmrgxqius.supabase.co/auth/v1";
const sessionId = "5a1d0c9e-7b3f-4c2a-9e8d-1f2a3b4c5d6e";
const otherSessionId = "6b2e1d0f-8c4a-4d3b-8f9e-2a3b4c5d6e7f";

async function verifierWithToken(
  claims: Record<string, unknown>,
  state: SessionState,
) {
  const keys = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "test-key";
  const token = await new SignJWT({
    email: "customer@kardo.test",
    role: "authenticated",
    session_id: sessionId,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(subjectId)
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  const stateOf = vi.fn(async () => state);
  const verifier = createCustomerSessionVerifier({
    issuer,
    audience: "authenticated",
    key: createLocalJWKSet({ keys: [publicJwk] }),
    sessions: { stateOf, forget: () => undefined },
  });
  return { verify: () => verifier.verify(`Bearer ${token}`), stateOf };
}

const withFactor = { alive: true, requiresSecondFactor: true };
const withoutFactor = { alive: true, requiresSecondFactor: false };

describe("customer session state", () => {
  it("holds back an aal1 token when the account has a verified factor", async () => {
    const { verify } = await verifierWithToken({ aal: "aal1" }, withFactor);
    await expect(verify()).rejects.toBeInstanceOf(SecondFactorRequiredError);
  });

  it("treats a token without the aal claim as aal1", async () => {
    const { verify } = await verifierWithToken({}, withFactor);
    await expect(verify()).rejects.toBeInstanceOf(SecondFactorRequiredError);
  });

  it("lets an aal1 token through when the account has no factor", async () => {
    const { verify, stateOf } = await verifierWithToken(
      { aal: "aal1" },
      withoutFactor,
    );
    await expect(verify()).resolves.toEqual({
      subject: subjectId,
      email: "customer@kardo.test",
      sessionId,
    });
    expect(stateOf).toHaveBeenCalledWith(subjectId, sessionId);
  });

  it("lets an aal2 token of an account with a factor through", async () => {
    const { verify } = await verifierWithToken({ aal: "aal2" }, withFactor);
    await expect(verify()).resolves.toMatchObject({ subject: subjectId });
  });

  it("refuses a signed token whose session was closed", async () => {
    const { verify } = await verifierWithToken(
      { aal: "aal2" },
      { alive: false, requiresSecondFactor: false },
    );
    const error = await verify().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomerSessionError);
    expect(error).not.toBeInstanceOf(SecondFactorRequiredError);
  });

  it("refuses a token without a session id", async () => {
    const { verify } = await verifierWithToken(
      { session_id: undefined },
      withoutFactor,
    );
    await expect(verify()).rejects.toBeInstanceOf(CustomerSessionError);
  });

  it("answers 401 MFA_REQUIRED, not AUTH_REQUIRED", async () => {
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: () =>
          Promise.reject(new SecondFactorRequiredError("second factor")),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("MFA_REQUIRED");
    await app.close();
  });
});

describe("session state lookup", () => {
  function fakeSql(answers: SessionState[]) {
    const statements: string[] = [];
    const tag = (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      statements.push(text.trim());
      if (!text.includes("customer_session_state")) return Promise.resolve([]);
      const next = answers.shift();
      return Promise.resolve(
        next
          ? [
              {
                session_alive: next.alive,
                requires_second_factor: next.requiresSecondFactor,
              },
            ]
          : [],
      );
    };
    const sql = {
      begin: (work: (transaction: typeof tag) => Promise<unknown>) => work(tag),
    } as unknown as Sql;
    return { sql, statements };
  }

  it("takes the API role before asking and caches the answer briefly", async () => {
    let clock = 1_000;
    const { sql, statements } = fakeSql([withFactor, withoutFactor]);
    const lookup = createPostgresSessionStateLookup(sql, () => clock);

    expect(await lookup.stateOf(subjectId, sessionId)).toEqual(withFactor);
    expect(statements[0]).toContain("set_config('role', 'kardo_customer_api'");
    expect(await lookup.stateOf(subjectId, sessionId)).toEqual(withFactor);
    expect(statements).toHaveLength(2);

    clock += SESSION_STATE_CACHE_MS + 1;
    expect(await lookup.stateOf(subjectId, sessionId)).toEqual(withoutFactor);
    expect(statements).toHaveLength(4);
  });

  it("forgets a closed session at once", async () => {
    const { sql } = fakeSql([
      withoutFactor,
      { alive: false, requiresSecondFactor: false },
    ]);
    const lookup = createPostgresSessionStateLookup(sql);
    expect((await lookup.stateOf(subjectId, sessionId)).alive).toBe(true);
    lookup.forget(sessionId);
    expect((await lookup.stateOf(subjectId, sessionId)).alive).toBe(false);
  });

  it("reads a missing row as a closed session that needs the factor", async () => {
    const { sql } = fakeSql([]);
    const lookup = createPostgresSessionStateLookup(sql);
    expect(await lookup.stateOf(subjectId, sessionId)).toEqual({
      alive: false,
      requiresSecondFactor: true,
    });
  });

  it("never reads a database error as an open session", async () => {
    const sql = {
      begin: () => Promise.reject(new Error("connection lost")),
    } as unknown as Sql;
    const lookup = createPostgresSessionStateLookup(sql);
    await expect(lookup.stateOf(subjectId, sessionId)).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("account routes", () => {
  function appWith(repository: Partial<AccountRepository>) {
    const forget = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => ({
          subject: subjectId,
          email: "customer@kardo.test",
          sessionId,
        }),
      },
      sessionStates: { stateOf: vi.fn(), forget },
      accountRepository: repository as AccountRepository,
    });
    return { app, forget };
  }

  it("lists the sessions and marks the current one", async () => {
    const { app } = appWith({
      listSessions: async () => [
        {
          id: sessionId,
          createdAt: "2026-10-03T10:00:00.000Z",
          lastActiveAt: "2026-10-03T12:00:00.000Z",
          userAgent: "Mozilla/5.0 (Macintosh) Chrome/140",
          ip: "189.203.1.2",
          current: true,
          secondFactor: true,
        },
      ],
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/sessions",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      id: sessionId,
      current: true,
    });
    await app.close();
  });

  it("closes one session and forgets it in the cache", async () => {
    const closeSession = vi.fn(async () => 1);
    const { app, forget } = appWith({ closeSession });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/me/sessions/${otherSessionId}`,
      headers: authHeader,
    });
    expect(response.json()).toEqual({ closed: 1 });
    expect(closeSession).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      otherSessionId,
    );
    expect(forget).toHaveBeenCalledWith(otherSessionId);
    await app.close();
  });

  it("does not forget anything when the session was not the person's", async () => {
    const { app, forget } = appWith({ closeSession: async () => 0 });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/me/sessions/${otherSessionId}`,
      headers: authHeader,
    });
    expect(response.json()).toEqual({ closed: 0 });
    expect(forget).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a session id that is not a uuid", async () => {
    const { app } = appWith({ closeSession: async () => 1 });
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/me/sessions/not-a-uuid",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("closes the other sessions and forgets each one", async () => {
    const { app, forget } = appWith({
      closeOtherSessions: async () => [otherSessionId],
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/sessions/close-others",
      headers: authHeader,
    });
    expect(response.json()).toEqual({ closed: 1 });
    expect(forget).toHaveBeenCalledWith(otherSessionId);
    await app.close();
  });

  it("returns the sign-in history with its window", async () => {
    const { app } = appWith({
      listSignIns: async () => [
        {
          id: otherSessionId,
          signedInAt: "2026-10-03T10:00:00.000Z",
          userAgent: null,
          ip: null,
        },
      ],
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/sign-ins",
      headers: authHeader,
    });
    expect(response.json()).toMatchObject({ days: 90 });
    expect(response.json().items).toHaveLength(1);
    await app.close();
  });
});

describe("tus datos routes (ADR 023)", () => {
  function appWith(repository: Partial<AccountRepository>) {
    const forget = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => ({
          subject: subjectId,
          email: "customer@kardo.test",
          sessionId,
        }),
      },
      sessionStates: { stateOf: vi.fn(), forget },
      accountRepository: repository as AccountRepository,
    });
    return { app, forget };
  }

  const remove = (app: ReturnType<typeof appWith>["app"], confirm: string) =>
    app.inject({
      method: "DELETE",
      url: "/v1/me",
      headers: authHeader,
      payload: { confirm },
    });

  it("asks to sign in again when the authentication is old", async () => {
    const { app } = appWith({
      deleteAccount: async () => ({ status: "reauthenticate" as const }),
    });
    const response = await remove(app, "BORRAR MI CUENTA");
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("REAUTHENTICATION_REQUIRED");
    await app.close();
  });

  it("refuses while something blocks it", async () => {
    const { app } = appWith({
      deleteAccount: async () => ({
        status: "blocked" as const,
        check: { recentSignIn: true, blockers: [], erase: [] },
      }),
    });
    const response = await remove(app, "BORRAR MI CUENTA");
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ACCOUNT_DELETION_BLOCKED");
    await app.close();
  });

  it("needs the exact phrase", async () => {
    const deleteAccount = vi.fn();
    const { app } = appWith({ deleteAccount });
    const response = await remove(app, "borrar");
    expect(response.statusCode).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
    await app.close();
  });

  it("deletes, forgets the session and says how many spaces went", async () => {
    const { app, forget } = appWith({
      deleteAccount: async () => ({
        status: "deleted" as const,
        erased: [otherSessionId],
      }),
    });
    const response = await remove(app, "BORRAR MI CUENTA");
    expect(response.json()).toEqual({ deleted: true, erasedWorkspaces: 1 });
    expect(forget).toHaveBeenCalledWith(sessionId);
    await app.close();
  });

  it("downloads the person's data as a file", async () => {
    const { app } = appWith({
      exportData: async () => ({
        exportedAt: "2026-10-03T20:00:00.000Z",
        profile: {
          email: "customer@kardo.test",
          displayName: "Ana",
          preferredName: null,
          timeZone: null,
          hourCycle: null,
          locale: "es-MX",
          marketingEmails: false,
          createdAt: "2026-09-01T00:00:00.000Z",
          termsVersion: "1.1",
          privacyVersion: "1.1",
          termsAcceptedAt: null,
        },
        organizations: [],
        verificationMethods: [],
        sessions: [],
        signIns: [],
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/export",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(
      "kardo-mis-datos-2026-10-03.json",
    );
    expect(response.json().profile.email).toBe("customer@kardo.test");
    await app.close();
  });
});
