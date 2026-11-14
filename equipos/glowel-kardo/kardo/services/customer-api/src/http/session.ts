import type { FastifyRequest } from "fastify";
import type {
  CustomerIdentity,
  CustomerSessionVerifier,
} from "../customer-session.js";

/** Verifies the bearer token on `request` and returns the authenticated
 * customer's identity, or throws `CustomerSessionError`. Every route handler
 * that needs a session calls this first, so authentication always happens
 * before any authorization or database work — see `requirePermission` in
 * `repositories/context.ts` for the next step. */
export async function requireSession(
  request: FastifyRequest,
  verifier: CustomerSessionVerifier,
): Promise<CustomerIdentity> {
  return verifier.verify(request.headers.authorization);
}
