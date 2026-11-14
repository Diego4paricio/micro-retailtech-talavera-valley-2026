import type { FastifyRequest } from "fastify";
import type { SessionRepository } from "../repositories/session.js";
import type { StaffIdentity, StaffSessionVerifier } from "../staff-session.js";

/**
 * Verifies the bearer token, then confirms the resulting identity belongs to
 * an active staff profile. Every route handler calls this first, so
 * authentication (`StaffSessionError`/`StaffMfaRequiredError`) always happens
 * before authorization (`StaffAccessError`), which in turn always happens
 * before any endpoint-specific permission check or query — mirrors the
 * acceptance tests in `Docs/engineering/08-operations-access-runbook.md`.
 *
 * A forged `Cf-Access-Authenticated-User-Email` (or any other) header is
 * never consulted: identity comes only from the verified JWT.
 */
export async function requireStaffIdentity(
  request: FastifyRequest,
  deps: {
    sessionVerifier: StaffSessionVerifier;
    sessionRepository: SessionRepository;
  },
): Promise<StaffIdentity> {
  const identity = await deps.sessionVerifier.verify(
    request.headers.authorization,
  );
  await deps.sessionRepository.getActiveStaffSession(
    identity.subject,
    identity.email,
  );
  return identity;
}
